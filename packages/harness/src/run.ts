import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import Stripe from "stripe";
import { StoreDb } from "./db.js";
import { loadEnv, REPO_ROOT } from "./env.js";
import { PayPalApi } from "./paypal-api.js";
import { findCloudflared, startQuickTunnel, WebhookRelay } from "./relay.js";
import { runScenarios, type ScenarioResult } from "./scenarios.js";
import { buildAndStartStore, type RunningStore } from "./store.js";
import { checkoutRef } from "./workspace.js";

export type RunOptions = {
  repo: string;
  ref: string;
  app: string;
  scenarios?: number[];
  keepCheckout?: boolean;
  headed?: boolean;
  log?: (msg: string) => void;
};

export type RunReport = {
  runId: string;
  repo: string;
  ref: string;
  app: string;
  commitSha: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "passed" | "failed" | "error";
  webhookRelay: { enabled: boolean; url?: string; webhookId?: string; eventsReceived: number; reason?: string };
  scenarios: ScenarioResult[];
  couldNotVerify: string[];
  error?: string;
};

const WEBHOOK_EVENTS = ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"];

export async function runHarness(opts: RunOptions): Promise<RunReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const env = loadEnv();
  const runId = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const runDir = path.join(REPO_ROOT, "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const report: RunReport = {
    runId,
    repo: opts.repo,
    ref: opts.ref,
    app: opts.app,
    commitSha: "",
    startedAt: new Date().toISOString(),
    status: "running",
    webhookRelay: { enabled: false, eventsReceived: 0 },
    scenarios: [],
    couldNotVerify: [],
  };
  const save = () => writeFileSync(path.join(runDir, "results.json"), JSON.stringify(report, null, 2));
  const cleanups: (() => Promise<void> | void)[] = [];
  const paypal = new PayPalApi(env.paypalClientId, env.paypalClientSecret);
  let relay: WebhookRelay | null = null;
  let store: RunningStore | null = null;

  try {
    log(`Run ${runId}: ${opts.repo} @ ${opts.ref} (${opts.app})`);
    const checkout = checkoutRef({ repo: opts.repo, ref: opts.ref, app: opts.app, runId });
    report.commitSha = checkout.commitSha;
    if (!opts.keepCheckout) cleanups.push(checkout.cleanup);
    log(`  checkout ${checkout.commitSha.slice(0, 8)} → ${checkout.dir}`);

    // Webhook relay: public tunnel → local relay; register a PayPal webhook for this run only.
    let webhookId = "";
    const cloudflared = findCloudflared();
    if (cloudflared) {
      relay = new WebhookRelay();
      const relayPort = await relay.start();
      cleanups.push(() => relay?.stop());
      const tunnel = await startQuickTunnel(cloudflared, relayPort, path.join(runDir, "tunnel.log"));
      cleanups.push(tunnel.stop);
      const { json } = await paypal.listWebhooks();
      for (const w of json.webhooks ?? []) if (w.url.includes(".trycloudflare.com")) await paypal.deleteWebhook(w.id);
      webhookId = await paypal.createWebhook(`${tunnel.url}/paypal/webhook`, WEBHOOK_EVENTS);
      cleanups.push(() => paypal.deleteWebhook(webhookId));
      report.webhookRelay = { enabled: true, url: tunnel.url, webhookId, eventsReceived: 0 };
      log(`  webhook relay ${tunnel.url} (PayPal webhook ${webhookId})`);
    } else {
      report.webhookRelay.reason = "cloudflared not found; webhook scenarios limited";
      log("  ! cloudflared not found: webhook scenarios 5 and 6 will be skipped or partial");
    }

    store = await buildAndStartStore({
      appDir: checkout.appDir,
      logDir: runDir,
      env: {
        PAYPAL_ENV: "sandbox",
        PAYPAL_CLIENT_ID: env.paypalClientId,
        PAYPAL_CLIENT_SECRET: env.paypalClientSecret,
        PAYPAL_WEBHOOK_ID: webhookId || "not-configured",
        STRIPE_SECRET_KEY: env.stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: "",
      },
      onStage: (s) => log(`  store: ${s}`),
    });
    cleanups.push(() => store?.stop());
    log(`  store running at ${store.baseUrl}`);

    const browser = await chromium.launch({ headless: !opts.headed });
    cleanups.push(() => browser.close());
    const db = new StoreDb(store.dbFile);

    report.scenarios = await runScenarios(
      {
        browser,
        store,
        db,
        paypal,
        stripe: new Stripe(env.stripeSecretKey),
        buyer: { email: env.buyerEmail, password: env.buyerPassword },
        relay,
        runDir,
        prices: db.productPrices(),
        log,
        shared: {},
      },
      opts.scenarios,
    );
    report.status = report.scenarios.every((s) => s.status !== "fail") ? "passed" : "failed";
  } catch (err) {
    report.status = "error";
    report.error = (err as Error).message;
    log(`  ✗ run error: ${report.error}`);
  } finally {
    report.webhookRelay.eventsReceived = relay?.events.length ?? 0;
    if (relay) writeFileSync(path.join(runDir, "webhook-events.json"), JSON.stringify(relay.events, null, 2));
    report.couldNotVerify = couldNotVerify(report);
    report.finishedAt = new Date().toISOString();
    save();
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* best effort */
      }
    }
  }
  return report;
}

function couldNotVerify(report: RunReport): string[] {
  const out = [
    "Pay Later messaging: PayPal only renders it on HTTPS pages, so on localhost the harness only checks that the element is present.",
  ];
  if (!report.webhookRelay.enabled) out.push("Real webhook delivery: no tunnel was available, so signed PayPal events could not be replayed.");
  for (const s of report.scenarios) {
    if (s.status === "skipped") out.push(`Scenario ${s.id} (${s.name}): ${s.notes.join("; ")}`);
    for (const c of s.checks) if (!c.pass && /delivered/.test(c.name)) out.push(`Scenario ${s.id}: ${c.name}: ${c.detail}`);
  }
  return out;
}

export function formatTable(report: RunReport): string {
  const rows = report.scenarios.map((s) => {
    const failed = s.checks.filter((c) => !c.pass).map((c) => c.name);
    const why = s.error ?? (failed.length ? failed.join("; ") : s.status === "skipped" ? s.notes[0] ?? "" : "");
    return `| ${s.id} | ${s.name} | ${s.provider} | ${s.status.toUpperCase()} | ${s.paypalOrderId ?? ""} | ${why.replace(/\|/g, "/")} |`;
  });
  return ["| # | Scenario | Provider | Result | PayPal order | Notes |", "|---|---|---|---|---|---|", ...rows].join("\n");
}
