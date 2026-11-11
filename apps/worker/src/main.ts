import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")], quiet: true });

const { migrate, queue, QUEUES, workerBeat } = await import("@paypal-checkout-integrator/shared");
const { addPaypalJob, checkJob } = await import("./jobs.js");

await migrate();
const boss = await queue();

// One job at a time: each run builds a store and drives a browser.
await boss.work<{ runId: string }>(QUEUES.addPaypal, { localConcurrency: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
  await addPaypalJob(job.data.runId);
});
await boss.work<{ runId: string }>(QUEUES.check, { localConcurrency: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
  await checkJob(job.data.runId);
});

// Tell the web app we're online (it shows an "offline" notice when this goes stale).
const beat = () => workerBeat().catch((e) => console.error("heartbeat failed:", e instanceof Error ? e.message : e));
void beat();
setInterval(beat, 60 * 1000);

// Free Render web services sleep when idle; GitHub and PayPal webhooks need it awake.
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
if (publicUrl) {
  const ping = () => fetch(`${publicUrl}/api/health`).catch(() => {});
  void ping();
  setInterval(ping, 4 * 60 * 1000);
}

console.log(`PayPal Checkout Integrator worker ready (queues: ${Object.values(QUEUES).join(", ")})${publicUrl ? `; keeping ${publicUrl} awake` : ""}`);

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
