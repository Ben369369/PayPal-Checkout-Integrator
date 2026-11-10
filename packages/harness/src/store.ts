import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { freePort, killTree, run, startProcess, waitForHttp } from "./proc.js";

export type StoreEnv = Record<string, string>;
export type RunningStore = { baseUrl: string; port: number; dbFile: string; adminPassword: string; stop: () => void };

/**
 * Install, migrate a fresh SQLite DB, seed, build, and start the store.
 * Every step's output goes to `<logDir>/store.log`.
 */
export async function buildAndStartStore(opts: {
  appDir: string;
  logDir: string;
  env: StoreEnv;
  onStage?: (stage: string) => void;
}): Promise<RunningStore> {
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  const adminPassword = `admin-${Math.random().toString(36).slice(2, 10)}`;
  const dbRelative = "prisma/harness.db";
  const env: StoreEnv = {
    ...opts.env,
    DATABASE_URL: `file:./${dbRelative}`,
    APP_URL: baseUrl,
    ADMIN_PASSWORD: adminPassword,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const logFile = path.join(opts.logDir, "store.log");
  const step = async (stage: string, command: string, timeoutMs: number) => {
    opts.onStage?.(stage);
    await run(command, { cwd: opts.appDir, env, logFile, timeoutMs });
  };

  // On Windows, antivirus file locks can make pnpm's staging rename fail
  // ("concurrent package import did not settle"); that's not the code under test, so retry once.
  try {
    await step("install", "pnpm install --frozen-lockfile", 600_000);
  } catch {
    opts.onStage?.("install (retry)");
    await new Promise((r) => setTimeout(r, 5000));
    await step("install", "pnpm install --frozen-lockfile", 600_000);
  }
  await step("migrate", "pnpm exec prisma migrate deploy", 120_000);
  await step("seed", "pnpm exec prisma db seed", 120_000);
  await step("build", "pnpm build", 600_000);

  opts.onStage?.("start");
  const nextBin = path.join(opts.appDir, "node_modules", "next", "dist", "bin", "next");
  const child: ChildProcess = startProcess(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: opts.appDir,
    env,
    logFile,
  });
  await waitForHttp(baseUrl, 60_000);

  return { baseUrl, port, dbFile: path.join(opts.appDir, dbRelative), adminPassword, stop: () => killTree(child) };
}
