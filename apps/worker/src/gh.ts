import { execFileSync } from "node:child_process";
import { CHECK_NAME, installationOctokit, installationToken, redact, repoParts } from "@paypal-checkout-integrator/shared";

/** Runs git; on failure, throws git's own error output with any token redacted. */
function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(redact(`git ${args.find((a) => !a.startsWith("-")) ?? ""} failed: ${(e.stderr || e.message).trim()}`));
  }
}
const git = (cwd: string, args: string[]) => runGit(["-C", cwd, ...args]);

function authedUrl(token: string, fullName: string) {
  return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

/** Clones the repo as the app (installation token). The token never leaves this process. */
export async function cloneRepo(installationId: string, fullName: string, dir: string) {
  const token = await installationToken(installationId);
  runGit(["clone", "--quiet", authedUrl(token, fullName), dir]);
}

/** Refreshes the remote's token (they expire after an hour) and force-pushes our own branch. */
export async function pushBranch(installationId: string, fullName: string, dir: string, branch: string) {
  const token = await installationToken(installationId);
  git(dir, ["remote", "set-url", "origin", authedUrl(token, fullName)]);
  git(dir, ["push", "--force", "--quiet", "origin", `${branch}:refs/heads/${branch}`]);
}

export async function fetchPullHead(installationId: string, fullName: string, dir: string, prNumber: number) {
  const token = await installationToken(installationId);
  git(dir, ["remote", "set-url", "origin", authedUrl(token, fullName)]);
  git(dir, ["fetch", "--quiet", "origin", `pull/${prNumber}/head:pr-${prNumber}`]);
}

export type CheckOutput = { title: string; summary: string; text?: string };

export async function createCheckRun(installationId: string, fullName: string, headSha: string, detailsUrl: string, status: "queued" | "in_progress" = "in_progress") {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = repoParts(fullName);
  const { data } = await octokit.rest.checks.create({ owner, repo, name: CHECK_NAME, head_sha: headSha, status, details_url: detailsUrl });
  return data.id;
}

export async function completeCheckRun(
  installationId: string,
  fullName: string,
  checkRunId: number,
  conclusion: "success" | "failure" | "neutral" | "skipped",
  output: CheckOutput,
  detailsUrl: string,
) {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = repoParts(fullName);
  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion,
    details_url: detailsUrl,
    completed_at: new Date().toISOString(),
    output: { title: output.title, summary: output.summary.slice(0, 65_000), text: output.text?.slice(0, 65_000) },
  });
}

/** Opens the PR from our branch, or updates its body if it is already open. */
export async function openOrUpdatePullRequest(opts: {
  installationId: string;
  fullName: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  draft: boolean;
}): Promise<{ number: number; url: string }> {
  const octokit = await installationOctokit(opts.installationId);
  const { owner, repo } = repoParts(opts.fullName);
  const existing = await octokit.rest.pulls.list({ owner, repo, head: `${owner}:${opts.branch}`, state: "open" });
  if (existing.data[0]) {
    const pr = existing.data[0];
    await octokit.rest.pulls.update({ owner, repo, pull_number: pr.number, title: opts.title, body: opts.body });
    return { number: pr.number, url: pr.html_url };
  }
  const { data } = await octokit.rest.pulls.create({ owner, repo, head: opts.branch, base: opts.base, title: opts.title, body: opts.body, draft: opts.draft });
  return { number: data.number, url: data.html_url };
}

export async function commentOnPullRequest(installationId: string, fullName: string, prNumber: number, body: string) {
  const octokit = await installationOctokit(installationId);
  const { owner, repo } = repoParts(fullName);
  await octokit.rest.pulls.createReview({ owner, repo, pull_number: prNumber, event: "COMMENT", body });
}
