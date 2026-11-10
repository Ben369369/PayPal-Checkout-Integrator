import "server-only";
import {
  ADD_PAYPAL_BRANCH,
  CHECK_NAME,
  createRun,
  enqueue,
  findInstallationByRepo,
  githubApp,
  installationOctokit,
  QUEUES,
  repoParts,
  updateRun,
  upsertInstallation,
} from "@paypal-checkout-integrator/shared";
import { publicUrl } from "./server";

/** Records every repository an installation can access (with its default branch). */
export async function syncInstallation(installationId: number) {
  const octokit = await installationOctokit(installationId);
  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
  for (const r of repos) await upsertInstallation(installationId, r.full_name, r.default_branch ?? "main");
  return repos.length;
}

/** Imports all current installations of the app (recovers from missed webhooks). */
export async function syncAllInstallations() {
  const app = await githubApp();
  const installations = await app.octokit.paginate(app.octokit.rest.apps.listInstallations, { per_page: 100 });
  let repos = 0;
  for (const inst of installations) repos += await syncInstallation(inst.id);
  return { installations: installations.length, repos };
}

/** Files that can't affect checkout: docs and CI config. */
const DOCS_OR_CI = /(^docs\/|\.mdx?$|\.txt$|^\.github\/|^LICENSE|^\.gitignore$|^\.editorconfig$)/i;

/**
 * Starts a "PayPal checkout" check on a pull request: creates the check run
 * (so the PR shows it as queued right away), records the run, and enqueues it.
 */
export async function startPullRequestCheck(opts: { fullName: string; prNumber: number; headSha: string; headRef: string }) {
  const inst = await findInstallationByRepo(opts.fullName);
  if (!inst) return { skipped: "repository not connected" };
  // The app's own PayPal PR gets its check from the add-PayPal run.
  if (opts.headRef === ADD_PAYPAL_BRANCH) return { skipped: "own branch" };

  const octokit = await installationOctokit(inst.github_installation_id);
  const { owner, repo } = repoParts(opts.fullName);

  // Only check repos where the PayPal integration has been merged.
  const hasPaypal = await octokit.rest.repos
    .getContent({ owner, repo, path: "package.json", ref: inst.default_branch })
    .then((r) => ("content" in r.data ? Buffer.from(r.data.content, "base64").toString("utf8").includes("@paypal/paypal-server-sdk") : false))
    .catch(() => false);
  if (!hasPaypal) return { skipped: "PayPal not merged yet" };

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: opts.prNumber, per_page: 100 });
  const run = await createRun({ installationId: inst.id, kind: "check", commitSha: opts.headSha, prNumber: opts.prNumber, branch: opts.headRef });
  const detailsUrl = `${publicUrl()}/runs/${run.id}/report`;

  if (files.length > 0 && files.every((f) => DOCS_OR_CI.test(f.filename))) {
    const { data } = await octokit.rest.checks.create({
      owner,
      repo,
      name: CHECK_NAME,
      head_sha: opts.headSha,
      status: "completed",
      conclusion: "skipped",
      details_url: detailsUrl,
      output: { title: "Skipped: only docs or CI files changed", summary: files.map((f) => `- \`${f.filename}\``).join("\n") },
    });
    await updateRun(run.id, { status: "skipped", check_run_id: data.id, finished_at: new Date() });
    return { skipped: "docs only", runId: run.id };
  }

  const { data } = await octokit.rest.checks.create({
    owner,
    repo,
    name: CHECK_NAME,
    head_sha: opts.headSha,
    status: "queued",
    details_url: detailsUrl,
    output: { title: "Queued: real PayPal sandbox purchase", summary: "The harness will build this commit and run the PayPal checkout scenarios." },
  });
  await updateRun(run.id, { check_run_id: data.id });
  await enqueue(QUEUES.check, { runId: run.id });
  return { runId: run.id };
}

/** Starts the add-PayPal flow for a connected repository. */
export async function startAddPaypal(installationId: number) {
  const run = await createRun({ installationId, kind: "add_paypal", branch: ADD_PAYPAL_BRANCH });
  await enqueue(QUEUES.addPaypal, { runId: run.id });
  return run;
}
