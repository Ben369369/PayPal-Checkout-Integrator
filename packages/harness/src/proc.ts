import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import net from "node:net";

export type RunOptions = { cwd: string; env?: NodeJS.ProcessEnv; logFile?: string; timeoutMs?: number };

/** Runs a shell command to completion; rejects with the tail of its output on failure. */
export function run(command: string, opts: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const log = opts.logFile ? createWriteStream(opts.logFile, { flags: "a" }) : null;
    log?.write(`\n$ ${command}\n`);
    const child = spawn(command, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, shell: true });
    let tail = "";
    const onData = (chunk: Buffer) => {
      log?.write(chunk);
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killTree(child);
          reject(new Error(`Timed out: ${command}`));
        }, opts.timeoutMs)
      : null;
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      log?.end();
      if (code === 0) resolve();
      else reject(new Error(`\`${command}\` exited with ${code}\n${tail}`));
    });
  });
}

/** Starts a long-running process and returns it. Output goes to logFile and onLine. */
export function startProcess(
  file: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; logFile?: string; onLine?: (line: string) => void },
): ChildProcess {
  const log = opts.logFile ? createWriteStream(opts.logFile, { flags: "a" }) : null;
  const child = spawn(file, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
  const onData = (chunk: Buffer) => {
    log?.write(chunk);
    if (opts.onLine) for (const line of chunk.toString().split(/\r?\n/)) if (line) opts.onLine(line);
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("close", () => log?.end());
  return child;
}

/** Kills a process and its children (Windows needs taskkill /T). */
export function killTree(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

export async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up within ${timeoutMs / 1000}s`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
