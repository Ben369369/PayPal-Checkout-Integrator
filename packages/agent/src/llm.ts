import { appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";

type Tool = Anthropic.Beta.BetaTool;
type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** A tool the agent can call: JSON-schema definition, zod validator, and handler. */
export type AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  inputSchema: Tool["input_schema"];
  /** Large inputs (file contents) stream as they are generated. */
  eager?: boolean;
  /** Returning `{ finish: value }` ends the loop with that value. */
  run: (input: z.infer<S>) => Promise<string | { finish: unknown; message?: string }>;
};

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; requests: number };

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0 };
}

export type LoopOptions = {
  client: Anthropic;
  system: string;
  prompt: string;
  tools: AgentTool[];
  maxTurns: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  transcriptFile: string;
  usage: Usage;
  log: (msg: string) => void;
};

export type LoopResult = { finished: unknown | null; turns: number; stopReason: string | null; finalText: string };

/**
 * Manual streaming tool-use loop. We own the loop (not the beta tool runner)
 * because tools enforce per-stage write policies, and every turn is written to
 * a transcript file as evidence.
 */
export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  const toolDefs: Tool[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
    ...(t.eager ? { eager_input_streaming: true } : {}),
  }));
  const messages: MessageParam[] = [{ role: "user", content: opts.prompt }];
  const record = (entry: unknown) => appendFileSync(opts.transcriptFile, `${JSON.stringify(entry)}\n`);
  record({ type: "start", at: new Date().toISOString(), system: opts.system, prompt: opts.prompt, tools: opts.tools.map((t) => t.name) });

  let jsonRetries = 0;
  let lastText = "";
  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    const stream = opts.client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64_000,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "high" },
      // Route policy declines to another model instead of stopping the run.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: opts.system,
      tools: toolDefs,
      messages,
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      opts.log("    (tool input was not parseable JSON; re-issuing the turn)");
      turn--;
      continue;
    }

    const u = message.usage;
    opts.usage.requests++;
    opts.usage.inputTokens += u.input_tokens;
    opts.usage.outputTokens += u.output_tokens;
    opts.usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    opts.usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
    record({ type: "assistant", turn, stop_reason: message.stop_reason, usage: u, content: message.content });

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) {
      lastText = text;
      opts.log(`    ${text.split("\n")[0].slice(0, 160)}`);
    }

    if (message.stop_reason === "refusal") {
      return { finished: null, turns: turn, stopReason: "refusal", finalText: lastText };
    }
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      // The model stopped without calling a finish tool; remind it once per turn.
      messages.push({ role: "user", content: "Continue. When you are done, call the finish tool for this stage." });
      continue;
    }
    if (message.stop_reason === "max_tokens") {
      messages.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          is_error: true,
          content: "Your output hit max_tokens and this tool input was truncated. Split large files into smaller edits.",
        })),
      });
      continue;
    }

    const results: ToolResult[] = [];
    let finished: { value: unknown } | null = null;
    for (const use of toolUses) {
      const tool = opts.tools.find((t) => t.name === use.name);
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Unknown tool ${use.name}` });
        continue;
      }
      const parsed = tool.schema.safeParse(use.input);
      if (!parsed.success) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: true,
          content: `Invalid input for ${use.name}: ${parsed.error.message.slice(0, 1500)}`,
        });
        continue;
      }
      opts.log(`    → ${use.name} ${summarizeInput(parsed.data)}`);
      try {
        const out = await tool.run(parsed.data);
        if (typeof out === "string") {
          results.push({ type: "tool_result", tool_use_id: use.id, content: out || "(empty)" });
        } else {
          finished = { value: out.finish };
          results.push({ type: "tool_result", tool_use_id: use.id, content: out.message ?? "Recorded." });
        }
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: (err as Error).message.slice(0, 4000) });
      }
    }
    record({ type: "tool_results", turn, results });
    messages.push({ role: "user", content: results });
    if (finished) return { finished: finished.value, turns: turn, stopReason: message.stop_reason, finalText: lastText };
  }
  return { finished: null, turns: opts.maxTurns, stopReason: "max_turns", finalText: lastText };
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const key = o.path ?? o.command ?? o.query ?? o.pattern ?? o.prompt ?? "";
  return String(key).slice(0, 120);
}
