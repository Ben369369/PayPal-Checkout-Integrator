import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicApiKey } from "@paypal-checkout-integrator/agent";
import type { RunReport } from "@paypal-checkout-integrator/harness";
import type { PlainPlan, PlainResult } from "@paypal-checkout-integrator/shared";

/**
 * Plain-English explanations for store owners with little or no programming
 * experience. These only explain; pass/fail always comes from the harness.
 */

const STYLE = `You explain software changes to a small-business owner who has little or no programming experience.
Rules: plain everyday words; no code, file names, or jargon (if a term like "pull request" is unavoidable, explain it in a few words);
short sentences; concrete and honest; never promise more than the evidence shows; this is PayPal's test mode (no real money).`;

const PlainPlanSchema = z.object({
  headline: z.string().describe("One sentence: what will happen to their store"),
  whatCustomersWillSee: z.array(z.string()).describe("2-4 bullets: what shoppers will notice"),
  whatWeWillChange: z.array(z.string()).describe("3-5 bullets in plain words, no file names"),
  whatStaysTheSame: z.array(z.string()).describe("2-3 bullets, e.g. card payments keep working exactly as before"),
  whatYouNeedToDo: z.array(z.string()).describe("1-3 bullets: what the owner must do next (see the rules in the request)"),
});

const PLAN_RULES = `Rules for this explanation:
- The owner's only decision now is to approve the plan or not. Never ask them to choose between technical options; internal notes, risks, and fallbacks are for the engineers, so leave them out.
- "What you'll need to do" is only: approve the plan; optionally connect their free PayPal test account in this app (we guide them); after the test purchases pass, accept the change on GitHub (a "pull request" is a proposed change they can review and accept); before going live, switch to their real PayPal business details (whoever runs their website can do this).
- Never mention environment variables, webhook ids, API keys by name, file names, or code.`;

const PlainResultSchema = z.object({
  headline: z.string().describe("One sentence with the real result, e.g. 'PayPal checkout passed all 9 test purchases.'"),
  whatWeChecked: z.array(z.string()).describe("3-6 bullets: what the test purchases proved, in plain words"),
  whatThisMeans: z.string().describe("2-3 sentences for the owner"),
  nextSteps: z.array(z.string()).describe("1-4 concrete next steps for the owner"),
});

function client(): Anthropic | null {
  const key = anthropicApiKey();
  return key ? new Anthropic({ apiKey: key }) : null;
}

async function ask<T extends z.ZodType>(schema: T, content: string): Promise<z.infer<T> | null> {
  const c = client();
  if (!c) return null;
  const res = await c.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    system: STYLE,
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") return null;
  return (res.parsed_output as z.infer<T> | null) ?? null;
}

export async function explainPlan(repoMap: unknown, plan: unknown): Promise<PlainPlan | null> {
  return ask(
    PlainPlanSchema,
    `An AI agent studied this online store's code and plans to add PayPal checkout next to its existing card checkout (Stripe). Explain the plan to the owner.\n\nWhat the agent found:\n${JSON.stringify(repoMap).slice(0, 12000)}\n\nThe agent's plan:\n${JSON.stringify(plan).slice(0, 12000)}\n\nThe owner must approve the plan before any change is made. After building, the change is tested with real PayPal test purchases, then offered to the owner as a change they can review and accept on GitHub (a "pull request"). Accepting it updates their store's code; their website updates the next time it is deployed.\n\n${PLAN_RULES}`,
  );
}

export async function explainResult(opts: { kind: "add_paypal" | "check"; report: RunReport | null | undefined; passed: boolean; prUrl?: string | null }): Promise<PlainResult | null> {
  const scenarios = (opts.report?.scenarios ?? []).map((s) => ({
    name: s.name,
    result: s.status,
    failedChecks: s.checks.filter((c) => !c.pass).map((c) => `${c.name}${c.detail ? `: ${c.detail.slice(0, 200)}` : ""}`),
  }));
  const context =
    opts.kind === "add_paypal"
      ? `PayPal checkout was added to the owner's store and tested with real PayPal test-mode purchases. ${opts.passed ? `It is ready for the owner to accept on GitHub${opts.prUrl ? ` (${opts.prUrl})` : ""}.` : "Some tests still fail, so it is offered as a draft that should not be accepted yet."}`
      : `Someone proposed a change to the owner's store code. Before it is accepted, the PayPal checkout was re-tested with real test purchases. ${opts.passed ? "Everything still works." : "Something broke; the change should not be accepted until it is fixed."}`;
  return ask(PlainResultSchema, `${context}\n\nTest results:\n${JSON.stringify(scenarios).slice(0, 15000)}`);
}
