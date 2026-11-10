import { PgBoss } from "pg-boss";
import { databaseUrl, sslFor } from "./db";

export const QUEUES = { addPaypal: "add_paypal", check: "paypal_check" } as const;
export type JobData = { runId: string };

let boss: PgBoss | null = null;

export async function queue(): Promise<PgBoss> {
  if (!boss) {
    const url = databaseUrl();
    const instance = new PgBoss({ connectionString: url, ssl: sslFor(url), max: 3 });
    instance.on("error", (err) => console.error("[queue]", err));
    await instance.start();
    for (const name of Object.values(QUEUES)) {
      if (!(await instance.getQueue(name))) await instance.createQueue(name);
    }
    boss = instance;
  }
  return boss;
}

export async function enqueue(name: (typeof QUEUES)[keyof typeof QUEUES], data: JobData) {
  // Runs take a while: generous expiry, no automatic retries (a run is not idempotent).
  return (await queue()).send(name, data, { expireInSeconds: 4 * 60 * 60, retryLimit: 0 });
}
