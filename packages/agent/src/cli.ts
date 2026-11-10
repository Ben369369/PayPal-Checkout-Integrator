#!/usr/bin/env tsx
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { REPO_ROOT, runAgent } from "./pipeline.js";

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: REPO_ROOT },
    base: { type: "string", default: "main" },
    app: { type: "string", default: "." },
    branch: { type: "string" },
    "max-repairs": { type: "string", default: "4" },
    scenarios: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

const report = await runAgent({
  repo: path.resolve(values.repo!),
  base: values.base!,
  app: values.app!,
  branch: values.branch,
  maxRepairs: Number(values["max-repairs"]),
  scenarios: values.scenarios?.split(",").map(Number),
  async approvePlan(plan) {
    console.log("\nFile plan:");
    for (const f of plan.files) console.log(`  ${f.action.padEnd(6)} ${f.path}  [${f.stage}] ${f.purpose}`);
    if (values.yes) {
      console.log("Approved (--yes).\n");
      return true;
    }
    if (!process.stdin.isTTY) {
      console.log("Not approved: run with --yes to approve without a prompt.");
      return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Approve and build? [y/N] ");
    rl.close();
    return /^y(es)?$/i.test(answer.trim());
  },
});

console.log(`\nStatus: ${report.status.toUpperCase()}  Branch: ${report.branch}`);
console.log(`Attempts: ${report.attempts.length}  APIMatic queries: ${report.apimaticQueries.length}  Est. cost: $${report.estimatedCostUsd}`);
const last = report.attempts.at(-1);
if (last?.scenarioTable) console.log(`\n${last.scenarioTable}`);
console.log(`Report: agent-runs/${report.runId}/report.json`);
process.exit(report.status === "passed" ? 0 : 1);
