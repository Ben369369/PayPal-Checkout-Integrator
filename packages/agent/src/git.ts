import { execFileSync } from "node:child_process";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
}

/** Creates a worktree at `dir` on a new branch `branch` from `base`. */
export function createWorktree(repo: string, base: string, branch: string, dir: string): string {
  const baseSha = git(repo, ["rev-parse", "--verify", `${base}^{commit}`]);
  git(repo, ["worktree", "add", "-b", branch, dir, baseSha]);
  return baseSha;
}

/** Files (relative to `appPrefix`) changed in the working tree or committed since `baseSha`. */
export function changedFiles(root: string, baseSha: string, appPrefix: string): string[] {
  git(root, ["add", "-N", "."]);
  const out = git(root, ["diff", "--name-only", baseSha, "--", appPrefix]);
  const prefix = appPrefix === "." ? "" : `${appPrefix.replace(/\/$/, "")}/`;
  return out
    .split("\n")
    .filter(Boolean)
    .map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f));
}

export function diffSince(root: string, baseSha: string, appPrefix: string): string {
  git(root, ["add", "-N", "."]);
  return git(root, ["diff", baseSha, "--", appPrefix]);
}

/** Commits the given paths (relative to the repo root) if any of them changed. Returns the sha or null. */
export type CommitIdentity = { name: string; email: string };

export function commitPaths(root: string, paths: string[], message: string, identity: CommitIdentity): string | null {
  if (paths.length === 0) return null;
  git(root, ["add", "-A", "--", ...paths]);
  const staged = git(root, ["diff", "--cached", "--name-only"]);
  if (!staged) return null;
  git(root, [
    "-c",
    `user.name=${identity.name}`,
    "-c",
    `user.email=${identity.email}`,
    "commit",
    "-q",
    "-m",
    message,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}
