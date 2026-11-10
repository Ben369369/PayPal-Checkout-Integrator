import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey, runAgent, type AgentReport } from "@paypal-checkout-integrator/agent";
import { formatTable, runHarness, type HarnessEnv, type RunReport } from "@paypal-checkout-integrator/harness";
import {
  ADD_PAYPAL_BRANCH,
  addEvent,
  redact,
  botIdentity,
  decidePlan,
  getInstallation,
  getPlan,
  getRun,
  getSandboxSettings,
  savePlan,
  saveAttempt,
  updateRun,
  type Installation,
  type Run,
} from "@paypal-checkout-integrator/shared";
import { passedCount, reportUrl, saveHarnessEvidence } from "./evidence.js";
import { cloneRepo, commentOnPullRequest, completeCheckRun, createCheckRun, fetchPullHead, openOrUpdatePullRequest, pushBranch } from "./gh.js";
import { prBody, scenarioTable } from "./markdown.js";
import { dbRelay } from "./relay.js";

const WORK_ROOT = path.join(os.tmpdir(), "paypal-checkout-integrator-worker");
const RUNS_DIR = path.join(WORK_ROOT, "harness-runs");
const AGENT_RUNS_DIR = path.join(WORK_ROOT, "agent-runs");

async function loadRun(runId: string): Promise<{ run: Run; inst: Installation }> {
  const run = await getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  const inst = await getInstallation(run.installation_id);
  if (!inst) throw new Error(`Installation ${run.installation_id} not found`);
  return { run, inst };
}

/** Per-repo sandbox credentials from the dashboard; the worker's own env fills any gaps. */
async function credentials(installationId: number): Promise<{ creds: Partial<HarnessEnv>; appDir: string }> {
  const s = await getSandboxSettings(installationId);
  const creds: Partial<HarnessEnv> = {};
  if (s.paypalClientId) creds.paypalClientId = s.paypalClientId;
  if (s.paypalClientSecret) creds.paypalClientSecret = s.paypalClientSecret;
  if (s.buyerEmail) creds.buyerEmail = s.buyerEmail;
  if (s.buyerPassword) creds.buyerPassword = s.buyerPassword;
  if (s.stripeSecretKey) creds.stripeSecretKey = s.stripeSecretKey;
  return { creds, appDir: s.appDir || "." };
}

function logger(runId: string) {
  return (raw: string) => {
    const msg = redact(raw);
    console.log(`[${runId.slice(0, 8)}] ${msg}`);
    void addEvent(runId, msg).catch(() => {});
    const stage = msg.match(/^▶ (\S+)/)?.[1];
    if (stage) void updateRun(runId, { stage }).catch(() => {});
  };
}

function workDir(runId: string) {
  const dir = path.join(WORK_ROOT, "repos", runId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.dirname(dir), { recursive: true });
  return dir;
}

/** Waits for the owner to approve or reject the plan on the dashboard. */
async function waitForApproval(runId: string, log: (m: string) => void): Promise<boolean> {
  await updateRun(runId, { status: "awaiting_approval", stage: "plan" });
  log("Plan ready for review on the dashboard.");
  const deadline = Date.now() + 24 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const plan = await getPlan(runId);
    if (plan?.approved_at || plan?.rejected_at) {
      await updateRun(runId, { status: plan.approved_at ? "running" : "rejected" });
      log(plan.approved_at ? "Plan approved. Building." : "Plan rejected by the owner.");
      return Boolean(plan.approved_at);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  await decidePlan(runId, false);
  return false;
}

/* ------------------------------------------------------------------ */
/* Job 1: add PayPal (agent + harness + PR)                            */
/* ------------------------------------------------------------------ */

export async function addPaypalJob(runId: string) {
  const { inst } = await loadRun(runId);
  const log = logger(runId);
  await updateRun(runId, { status: "running", started_at: new Date(), stage: "clone" });
  const { creds, appDir } = await credentials(inst.id);
  const dir = workDir(runId);

  try {
    log(`▶ clone ${inst.repo_full_name}`);
    await cloneRepo(inst.github_installation_id, inst.repo_full_name, dir);
    const identity = await botIdentity();

    const agent: AgentReport = await runAgent({
      repo: dir,
      base: inst.default_branch,
      app: appDir,
      branch: ADD_PAYPAL_BRANCH,
      maxRepairs: 4,
      identity,
      log,
      outDir: AGENT_RUNS_DIR,
      harness: { credentials: creds, relay: dbRelay(runId), runsDir: RUNS_DIR },
      approvePlan: async (plan, repoMap) => {
        await savePlan(runId, repoMap, plan);
        return waitForApproval(runId, log);
      },
      onAttempt: async (attempt, harness, diff) => {
        await saveAttempt(runId, { ...attempt, diff, harnessRunId: attempt.harnessRunId });
        if (harness) await saveHarnessEvidence(runId, harness, RUNS_DIR);
      },
    });

    if (agent.status === "plan_rejected") {
      await updateRun(runId, { status: "rejected", finished_at: new Date(), cost_usd: agent.estimatedCostUsd });
      return;
    }
    if (!agent.commits.length) throw new Error(agent.error ?? "The agent made no commits");

    log(`▶ publish ${ADD_PAYPAL_BRANCH}`);
    await pushBranch(inst.github_installation_id, inst.repo_full_name, dir, ADD_PAYPAL_BRANCH);
    const passed = agent.status === "passed";
    const counts = passedCount(agent.finalHarness);
    const url = reportUrl(runId);

    const checkRunId = await createCheckRun(inst.github_installation_id, inst.repo_full_name, agent.headSha!, url);
    await completeCheckRun(
      inst.github_installation_id,
      inst.repo_full_name,
      checkRunId,
      passed ? "success" : "failure",
      { title: `${counts.passed} of ${counts.total} sandbox scenarios passed`, summary: `${scenarioTable(agent.finalHarness)}\n\n[Run report](${url})` },
      url,
    );
    const pr = await openOrUpdatePullRequest({
      installationId: inst.github_installation_id,
      fullName: inst.repo_full_name,
      branch: ADD_PAYPAL_BRANCH,
      base: inst.default_branch,
      title: passed ? "Add PayPal checkout (verified in the PayPal sandbox)" : "Draft: add PayPal checkout (sandbox checks failing)",
      body: prBody({ agent, reportUrl: url, webhookUrlHint: "https://<your-domain>/api/webhooks/paypal" }),
      draft: !passed,
    });
    log(`Pull request: ${pr.url}`);

    await updateRun(runId, {
      status: passed ? "passed" : "failed",
      finished_at: new Date(),
      commit_sha: agent.headSha,
      branch: ADD_PAYPAL_BRANCH,
      pr_number: pr.number,
      pr_url: pr.url,
      check_run_id: checkRunId,
      cost_usd: agent.estimatedCostUsd,
      summary: {
        passed: counts.passed,
        total: counts.total,
        attempts: agent.attempts.length,
        apimaticQueries: agent.apimaticQueries,
        commits: agent.commits,
        planSummary: agent.plan?.summary,
        couldNotVerify: [...new Set([...agent.couldNotVerify, ...(agent.finalHarness?.couldNotVerify ?? [])])],
        model: agent.model,
        usage: agent.usage,
        webhookEvents: agent.finalHarness?.webhookRelay.eventsReceived ?? 0,
      },
    });
  } catch (err) {
    log(`✗ ${(err as Error).message}`);
    await updateRun(runId, { status: "error", error: redact((err as Error).message).slice(0, 2000), finished_at: new Date() });
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

/* ------------------------------------------------------------------ */
/* Job 2: PR check (harness only, never pushes)                         */
/* ------------------------------------------------------------------ */

export async function checkJob(runId: string) {
  const { run, inst } = await loadRun(runId);
  const log = logger(runId);
  const url = reportUrl(runId);
  await updateRun(runId, { status: "running", started_at: new Date(), stage: "clone" });
  const { creds, appDir } = await credentials(inst.id);
  const dir = workDir(runId);
  let checkRunId = run.check_run_id ? Number(run.check_run_id) : null;

  try {
    if (!run.pr_number || !run.commit_sha) throw new Error("Check run is missing the PR number or commit");
    checkRunId ??= await createCheckRun(inst.github_installation_id, inst.repo_full_name, run.commit_sha, url);
    log(`▶ clone ${inst.repo_full_name} PR #${run.pr_number} @ ${run.commit_sha.slice(0, 8)}`);
    await cloneRepo(inst.github_installation_id, inst.repo_full_name, dir);
    await fetchPullHead(inst.github_installation_id, inst.repo_full_name, dir, run.pr_number);

    log("▶ harness");
    const report: RunReport = await runHarness({ repo: dir, ref: run.commit_sha, app: appDir, credentials: creds, relay: dbRelay(runId), runsDir: RUNS_DIR, log });
    await saveHarnessEvidence(runId, report, RUNS_DIR);
    const counts = passedCount(report);
    const passed = report.status === "passed";

    await completeCheckRun(
      inst.github_installation_id,
      inst.repo_full_name,
      checkRunId,
      passed ? "success" : "failure",
      { title: report.error ? "The harness could not run" : `${counts.passed} of ${counts.total} sandbox scenarios passed`, summary: `${report.error ? `Error: ${report.error}\n\n` : ""}${scenarioTable(report)}\n\n[Run report](${url})` },
      url,
    );
    if (!passed) {
      const cause = await likelyCause(report).catch(() => null);
      await commentOnPullRequest(
        inst.github_installation_id,
        inst.repo_full_name,
        run.pr_number,
        `**PayPal checkout check failed** on \`${run.commit_sha.slice(0, 7)}\`: ${counts.passed} of ${counts.total} sandbox scenarios passed.\n\n${scenarioTable(report)}\n\n${cause ? `**Likely cause** _(AI explanation of the evidence; the pass/fail result above comes from PayPal's API and the checks)_:\n\n${cause}\n\n` : ""}[Run report](${url})`,
      );
    }
    await updateRun(runId, {
      status: passed ? "passed" : "failed",
      finished_at: new Date(),
      check_run_id: checkRunId,
      summary: { passed: counts.passed, total: counts.total, couldNotVerify: report.couldNotVerify, webhookEvents: report.webhookRelay.eventsReceived },
    });
  } catch (err) {
    log(`✗ ${(err as Error).message}`);
    await updateRun(runId, { status: "error", error: redact((err as Error).message).slice(0, 2000), finished_at: new Date(), check_run_id: checkRunId });
    if (checkRunId) {
      await completeCheckRun(inst.github_installation_id, inst.repo_full_name, checkRunId, "neutral", { title: "The check could not run", summary: redact((err as Error).message).slice(0, 2000) }, url).catch(() => {});
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

/** A short, plain-language explanation of the failing evidence for the PR comment. */
async function likelyCause(report: RunReport): Promise<string | null> {
  const key = anthropicApiKey();
  if (!key) return null;
  const failing = report.scenarios
    .filter((s) => s.status === "fail")
    .map((s) => ({ scenario: `${s.id} ${s.name}`, error: s.error, failedChecks: s.checks.filter((c) => !c.pass), notes: s.notes, apiEvidence: s.apiEvidence }));
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    system:
      "You explain why an automated PayPal checkout test failed on a pull request. Use only the evidence given. Write 2-4 short sentences for the PR author: the most likely cause and where to look. Do not claim certainty you don't have.",
    messages: [{ role: "user", content: `${formatTable(report)}\n\n${report.error ? `Run error: ${report.error}\n\n` : ""}${JSON.stringify(failing).slice(0, 20_000)}` }],
  });
  if (res.stop_reason === "refusal") return null;
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim() || null;
}
