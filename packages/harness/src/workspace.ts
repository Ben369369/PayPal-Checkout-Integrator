import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type Checkout = { dir: string; appDir: string; commitSha: string; cleanup: () => void };

/**
 * Clean checkout of `ref` from a local git repo into a temp directory (a detached worktree),
 * so the run never sees uncommitted files or another branch's build output.
 */
export function checkoutRef(opts: { repo: string; ref: string; app: string; runId: string }): Checkout {
  const base = path.join(os.tmpdir(), "second-button-runs");
  mkdirSync(base, { recursive: true });
  const dir = path.join(base, opts.runId);
  const git = (...args: string[]) => execFileSync("git", ["-C", opts.repo, ...args], { encoding: "utf8" }).trim();

  const commitSha = git("rev-parse", "--verify", `${opts.ref}^{commit}`);
  git("worktree", "add", "--detach", dir, commitSha);

  const appDir = path.join(dir, opts.app);
  if (!existsSync(path.join(appDir, "package.json"))) throw new Error(`${opts.app} has no package.json at ${opts.ref}`);

  return {
    dir,
    appDir,
    commitSha,
    cleanup: () => {
      // On Windows the stopped server can hold file locks for a moment, so retry the delete.
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      git("worktree", "prune");
    },
  };
}
