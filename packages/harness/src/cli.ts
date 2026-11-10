#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import path from "node:path";
import { REPO_ROOT } from "./env.js";
import { formatTable, runHarness } from "./run.js";

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: REPO_ROOT },
    ref: { type: "string" },
    app: { type: "string", default: "." },
    scenarios: { type: "string" },
    keep: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
  },
});

if (!values.ref) {
  console.error("Usage: pnpm --filter @paypal-checkout-integrator/harness run -- --ref <git ref> [--repo <path>] [--app <subdir>] [--scenarios 1,2,3] [--keep] [--headed]");
  process.exit(2);
}

const report = await runHarness({
  repo: path.resolve(values.repo!),
  ref: values.ref,
  app: values.app!,
  scenarios: values.scenarios?.split(",").map(Number),
  keepCheckout: values.keep,
  headed: values.headed,
});

console.log(`\n${formatTable(report)}\n`);
console.log(`Status: ${report.status.toUpperCase()}   Evidence: runs/${report.runId}/`);
if (report.couldNotVerify.length) console.log(`Could not verify:\n${report.couldNotVerify.map((s) => `  - ${s}`).join("\n")}`);
process.exit(report.status === "passed" ? 0 : 1);
