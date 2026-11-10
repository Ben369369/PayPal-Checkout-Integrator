import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { killTree, startProcess } from "./proc.js";

/** A PayPal webhook exactly as PayPal sent it. */
export type RelayedEvent = {
  receivedAt: string;
  headers: Record<string, string>;
  rawBody: string;
  id: string;
  eventType: string;
  resourceId: string | null;
  relatedOrderId: string | null;
};

/**
 * Pull-model webhook relay: stores real PayPal deliveries untouched so the harness
 * can replay them (verbatim, twice, or altered) to a store that isn't publicly reachable.
 * Signature verification doesn't depend on the delivery URL, so replays verify normally.
 */
export class WebhookRelay {
  readonly events: RelayedEvent[] = [];
  private server: http.Server | null = null;
  private waiters: { match: (e: RelayedEvent) => boolean; resolve: (e: RelayedEvent) => void }[] = [];

  async start(): Promise<number> {
    this.server = http.createServer((req, res) => {
      if (req.method !== "POST" || !req.url?.startsWith("/paypal/webhook")) {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"received":true}');
        try {
          this.add(rawBody, req.headers);
        } catch (err) {
          console.error("[relay] bad payload", err);
        }
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    return (this.server!.address() as { port: number }).port;
  }

  private add(rawBody: string, rawHeaders: http.IncomingHttpHeaders) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) if (typeof v === "string") headers[k.toLowerCase()] = v;
    const json = JSON.parse(rawBody) as {
      id: string;
      event_type: string;
      resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    };
    const event: RelayedEvent = {
      receivedAt: new Date().toISOString(),
      headers,
      rawBody,
      id: json.id,
      eventType: json.event_type,
      resourceId: json.resource?.id ?? null,
      relatedOrderId: json.resource?.supplementary_data?.related_ids?.order_id ?? null,
    };
    this.events.push(event);
    this.waiters = this.waiters.filter((w) => {
      if (!w.match(event)) return true;
      w.resolve(event);
      return false;
    });
  }

  /** Resolves with the first matching event (past or future), or null after timeoutMs. */
  waitFor(match: (e: RelayedEvent) => boolean, timeoutMs: number): Promise<RelayedEvent | null> {
    const existing = this.events.find(match);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const waiter = { match, resolve: (e: RelayedEvent) => (clearTimeout(timer), resolve(e)) };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  stop() {
    this.server?.close();
  }
}

/** Sends a relayed event to the store's webhook route with PayPal's original headers. */
export async function replayToStore(storeWebhookUrl: string, event: RelayedEvent, rawBody = event.rawBody) {
  const forward: Record<string, string> = { "content-type": "application/json" };
  for (const [k, v] of Object.entries(event.headers)) if (k.startsWith("paypal-")) forward[k] = v;
  const res = await fetch(storeWebhookUrl, { method: "POST", headers: forward, body: rawBody });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: json };
}

/* ------------------------------------------------------------------ */
/* Cloudflare quick tunnel                                             */
/* ------------------------------------------------------------------ */

export function findCloudflared(): string | null {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "second-button", "bin", "cloudflared.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "cloudflared", "cloudflared.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "cloudflared", "cloudflared.exe"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) if (existsSync(p)) return p;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of ["cloudflared.exe", "cloudflared"]) {
      const p = path.join(dir, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Opens a public https://*.trycloudflare.com URL to a local port. */
export async function startQuickTunnel(binary: string, port: number, logFile: string): Promise<{ url: string; stop: () => void }> {
  let child: ChildProcess | null = null;
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cloudflared did not report a tunnel URL within 60s")), 60_000);
    child = startProcess(binary, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], {
      cwd: process.cwd(),
      logFile,
      onLine: (line) => {
        const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      },
    });
    child.on("exit", (code) => reject(new Error(`cloudflared exited (${code})`)));
  });
  return { url, stop: () => child && killTree(child) };
}
