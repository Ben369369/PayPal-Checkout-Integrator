import type { AgentReport } from "@paypal-checkout-integrator/agent";
import type { RunReport } from "@paypal-checkout-integrator/harness";
import { PRODUCT_NAME } from "@paypal-checkout-integrator/shared";

export function scenarioTable(report: RunReport | null | undefined): string {
  if (!report?.scenarios.length) return "_No harness run._";
  const icon = (s: string) => (s === "pass" ? "✅ pass" : s === "skipped" ? "⏸ skipped" : "❌ fail");
  const rows = report.scenarios.map((s) => {
    const failed = s.checks.filter((c) => !c.pass).map((c) => c.name);
    const note = s.error ?? (failed.length ? failed.join("; ") : s.notes[0] ?? "");
    return `| ${s.id} | ${s.name} | ${icon(s.status)} | ${s.paypalOrderId ? `\`${s.paypalOrderId}\`` : ""} | ${note.replace(/\|/g, "/")} |`;
  });
  return ["| # | Scenario | Result | PayPal order | Notes |", "|---|---|---|---|---|", ...rows].join("\n");
}

export function prBody(opts: { agent: AgentReport; reportUrl: string; webhookUrlHint: string }): string {
  const { agent } = opts;
  const h = agent.finalHarness;
  const passed = h?.scenarios.filter((s) => s.status === "pass").length ?? 0;
  const total = h?.scenarios.length ?? 0;
  const verdict =
    agent.status === "passed"
      ? `**${passed} of ${total} sandbox scenarios passed.** A real PayPal sandbox buyer completed these purchases, and PayPal's API confirmed them.`
      : `**Draft: ${passed} of ${total} sandbox scenarios passed after ${agent.attempts.length} attempt(s).** See the failures below.`;

  const files = (agent.plan?.files ?? []).map((f) => `- \`${f.path}\` (${f.action}): ${f.purpose.split(". ")[0]}.`).join("\n");
  const couldNot = [...new Set([...(agent.couldNotVerify ?? []), ...(h?.couldNotVerify ?? [])])];

  return `${verdict}

[Open the run report](${opts.reportUrl}) for the videos, PayPal API responses, and the Stripe vs PayPal database rows side by side.

## What changed
${agent.plan?.summary ?? ""}

${files}

Stripe files were not modified. Every PayPal SDK call was checked against the installed \`@paypal/paypal-server-sdk\` types.

## Scenario results
${scenarioTable(h)}

## Setup
1. Set \`PAYPAL_CLIENT_ID\`, \`PAYPAL_CLIENT_SECRET\`, and \`PAYPAL_ENV=sandbox\` (see \`.env.example\`).
2. In the PayPal developer dashboard, add a webhook pointing to \`${opts.webhookUrlHint}\` for \`PAYMENT.CAPTURE.COMPLETED\`, \`PAYMENT.CAPTURE.DENIED\`, and \`PAYMENT.CAPTURE.REFUNDED\`, then set \`PAYPAL_WEBHOOK_ID\`.
3. Apply the database migration (\`prisma migrate deploy\`).

## What I couldn't verify
${couldNot.length ? couldNot.map((c) => `- ${c}`).join("\n") : "- Nothing beyond the scenarios above."}

---
<sub>${PRODUCT_NAME} by Chui Labs · ${agent.attempts.length} attempt(s) · ${agent.apimaticQueries.length} APIMatic Context Plugin queries · model \`${agent.model}\` · about $${agent.estimatedCostUsd} of model usage</sub>`;
}
