import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ApimaticContext } from "./apimatic.js";
import type { AgentTool } from "./llm.js";

/** Builds an AgentTool, deriving the JSON schema from the zod schema. */
export function defineTool<S extends z.ZodObject>(
  name: string,
  description: string,
  schema: S,
  run: AgentTool<S>["run"],
  eager = false,
): AgentTool {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { name, description, schema, inputSchema: json as AgentTool["inputSchema"], run: run as AgentTool["run"], eager };
}

export type WritePolicy =
  | { mode: "readonly" }
  | { mode: "plan"; writable: Set<string>; protectedFiles: Set<string> };

export type Workspace = {
  /** Absolute path to the app inside the agent's worktree. */
  appDir: string;
  apimatic: ApimaticContext;
  policy: WritePolicy;
  /** Files the agent wrote in this stage (relative to appDir). */
  written: Set<string>;
  commandEnv: NodeJS.ProcessEnv;
};

const READ_ONLY_PREFIXES = ["node_modules/@paypal/paypal-server-sdk/", "node_modules/next/dist/docs/"];
const MAX_READ_CHARS = 60_000;

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Resolves a model-supplied path and rejects anything outside the app directory. */
function resolveInApp(ws: Workspace, p: string): { abs: string; rel: string } {
  const abs = path.resolve(ws.appDir, p);
  const rel = norm(path.relative(ws.appDir, abs));
  if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel)) throw new Error(`Path ${p} is outside the project`);
  return { abs, rel };
}

function checkWritable(ws: Workspace, rel: string) {
  if (ws.policy.mode === "readonly") throw new Error("This stage is read-only. Do not write files yet.");
  if (ws.policy.protectedFiles.has(rel)) throw new Error(`${rel} is a Stripe file and must never be modified.`);
  if (rel.startsWith("node_modules/") || rel.startsWith(".next/")) throw new Error(`${rel} is not a source file.`);
  if (!ws.policy.writable.has(rel)) {
    throw new Error(`${rel} is not in the approved file plan. Allowed files: ${[...ws.policy.writable].join(", ")}`);
  }
}

function git(appDir: string, args: string[]): string {
  return execFileSync("git", ["-C", appDir, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

const COMMAND_ALLOWLIST: RegExp[] = [
  /^pnpm install$/,
  /^pnpm add( -D)?( @?[\w./-]+(@[\w.^~<>=-]+)?)+$/,
  /^pnpm exec prisma (generate|validate|format)$/,
  /^pnpm exec prisma migrate deploy$/,
  /^pnpm exec prisma migrate diff --from-config-datasource --to-schema [\w./-]+ --script$/,
  /^pnpm exec next typegen$/,
  /^pnpm exec tsc --noEmit$/,
  /^pnpm (typecheck|lint|build)$/,
];

/** The agent's commands never see credentials (API keys, PayPal/Stripe secrets, buyer login). */
export function sanitizedEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/SECRET|KEY|PASSWORD|TOKEN|PAYPAL_|STRIPE_|ANTHROPIC/i.test(k)),
  );
}

/* ------------------------------------------------------------------ */
/* Read-only tools                                                     */
/* ------------------------------------------------------------------ */

export function readTools(ws: Workspace): AgentTool[] {
  return [
    defineTool(
      "list_files",
      "List the project's source files (tracked and newly created), optionally under a directory.",
      z.object({ dir: z.string().optional().describe("Directory relative to the project root, e.g. 'app/api'") }),
      async ({ dir }) => {
        const files = git(ws.appDir, ["ls-files", "--cached", "--others", "--exclude-standard", "--", dir ? norm(dir) : "."])
          .split("\n")
          .filter(Boolean);
        return files.length ? files.slice(0, 500).join("\n") + (files.length > 500 ? `\n… ${files.length - 500} more` : "") : "(no files)";
      },
    ),
    defineTool(
      "read_file",
      "Read a project file with line numbers. Also reads the installed PayPal server SDK types under node_modules/@paypal/paypal-server-sdk/ and the Next.js docs under node_modules/next/dist/docs/.",
      z.object({
        path: z.string(),
        start_line: z.number().int().positive().optional(),
        end_line: z.number().int().positive().optional(),
      }),
      async ({ path: p, start_line, end_line }) => {
        const { abs, rel } = resolveInApp(ws, p);
        if (rel.startsWith("node_modules/") && !READ_ONLY_PREFIXES.some((pre) => rel.startsWith(pre))) {
          throw new Error(`Only ${READ_ONLY_PREFIXES.join(" and ")} can be read inside node_modules`);
        }
        if (!existsSync(abs)) throw new Error(`${rel} does not exist`);
        if (statSync(abs).isDirectory()) return readdirSync(abs).join("\n");
        const lines = readFileSync(abs, "utf8").split("\n");
        const from = (start_line ?? 1) - 1;
        const to = Math.min(lines.length, end_line ?? lines.length);
        let out = lines
          .slice(from, to)
          .map((l, i) => `${String(from + i + 1).padStart(5)}  ${l}`)
          .join("\n");
        if (out.length > MAX_READ_CHARS) out = `${out.slice(0, MAX_READ_CHARS)}\n… truncated; read a smaller line range`;
        return out;
      },
    ),
    defineTool(
      "search",
      "Search project source files with a regular expression (git grep -E). Returns file:line:match.",
      z.object({ pattern: z.string(), dir: z.string().optional() }),
      async ({ pattern, dir }) => {
        const res = spawnSync("git", ["-C", ws.appDir, "grep", "-n", "-I", "-E", "--untracked", pattern, "--", dir ? norm(dir) : "."], {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const out = (res.stdout ?? "").trim();
        if (!out) return "(no matches)";
        const lines = out.split("\n");
        return lines.slice(0, 200).join("\n") + (lines.length > 200 ? `\n… ${lines.length - 200} more matches` : "");
      },
    ),
    defineTool(
      "search_sdk_types",
      "Search the installed @paypal/paypal-server-sdk type definitions (.d.ts) with a regular expression. Use it to confirm the exact names of controllers, methods, models, and enum members before using them.",
      z.object({ pattern: z.string() }),
      async ({ pattern }) => {
        const root = path.join(ws.appDir, "node_modules/@paypal/paypal-server-sdk/dist/cjs/types");
        if (!existsSync(root)) return "The PayPal server SDK is not installed yet. Install it with `pnpm add @paypal/paypal-server-sdk`.";
        const re = new RegExp(pattern);
        const hits: string[] = [];
        const walk = (dir: string) => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(".d.ts")) {
              readFileSync(full, "utf8")
                .split("\n")
                .forEach((line, i) => {
                  if (hits.length < 150 && re.test(line)) hits.push(`${norm(path.relative(ws.appDir, full))}:${i + 1}: ${line.trim()}`);
                });
            }
          }
        };
        walk(root);
        return hits.length ? hits.join("\n") : "(no matches)";
      },
    ),
    defineTool(
      "paypal_sdk_endpoint_search",
      "APIMatic Context Plugin for the PayPal Server SDK (TypeScript): look up an SDK endpoint method's description, parameters, and response by (partial, case-sensitive) name, e.g. 'createOrder', 'refundCapturedPayment'.",
      z.object({ query: z.string() }),
      async ({ query }) => ws.apimatic.call("endpoint_search", { query }),
    ),
    defineTool(
      "paypal_sdk_model_search",
      "APIMatic Context Plugin for the PayPal Server SDK (TypeScript): look up an SDK model's definition and properties by (partial, case-sensitive) name, e.g. 'OrderRequest', 'PurchaseUnitRequest'.",
      z.object({ query: z.string() }),
      async ({ query }) => ws.apimatic.call("model_search", { query }),
    ),
    defineTool(
      "paypal_sdk_ask",
      "APIMatic Context Plugin for the PayPal Server SDK (TypeScript): ask an integration question and get SDK-specific steps and code. Ask one focused step at a time.",
      z.object({ prompt: z.string() }),
      async ({ prompt }) => ws.apimatic.call("ask", { prompt }),
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Write tools                                                         */
/* ------------------------------------------------------------------ */

export function writeTools(ws: Workspace): AgentTool[] {
  return [
    defineTool(
      "write_file",
      "Create or overwrite a file in the approved plan with the full content.",
      z.object({ path: z.string(), content: z.string() }),
      async ({ path: p, content }) => {
        const { abs, rel } = resolveInApp(ws, p);
        checkWritable(ws, rel);
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, content.endsWith("\n") ? content : `${content}\n`);
        ws.written.add(rel);
        return `Wrote ${rel} (${content.split("\n").length} lines)`;
      },
      true,
    ),
    defineTool(
      "edit_file",
      "Replace one exact, unique occurrence of old_string with new_string in a file in the approved plan.",
      z.object({ path: z.string(), old_string: z.string().min(1), new_string: z.string() }),
      async ({ path: p, old_string, new_string }) => {
        const { abs, rel } = resolveInApp(ws, p);
        checkWritable(ws, rel);
        if (!existsSync(abs)) throw new Error(`${rel} does not exist; use write_file to create it`);
        const text = readFileSync(abs, "utf8");
        const count = text.split(old_string).length - 1;
        if (count === 0) throw new Error(`old_string not found in ${rel}. Read the file again and copy the text exactly.`);
        if (count > 1) throw new Error(`old_string occurs ${count} times in ${rel}; include more surrounding lines so it is unique.`);
        writeFileSync(abs, text.replace(old_string, () => new_string));
        ws.written.add(rel);
        return `Edited ${rel}`;
      },
      true,
    ),
    defineTool(
      "run_command",
      `Run an allowlisted command in the project directory and get its exit code and output. Allowed: ${COMMAND_ALLOWLIST.map((r) => r.source.replace(/^\^|\$$/g, "")).join(" | ")}`,
      z.object({ command: z.string() }),
      async ({ command }) => {
        const cmd = command.trim().replace(/\s+/g, " ");
        if (!COMMAND_ALLOWLIST.some((re) => re.test(cmd))) throw new Error(`Command not allowed: ${cmd}`);
        const res = spawnSync(cmd, { cwd: ws.appDir, shell: true, encoding: "utf8", env: { ...sanitizedEnv(), ...ws.commandEnv }, timeout: 600_000, maxBuffer: 50 * 1024 * 1024 });
        const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
        const tail = out.length > 12_000 ? `…${out.slice(-12_000)}` : out;
        return `exit code ${res.status ?? "timeout"}\n${tail}`;
      },
    ),
  ];
}
