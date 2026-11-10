import { randomBytes } from "node:crypto";
import { listRelayedEvents } from "@paypal-checkout-integrator/shared";
import type { RelayedEvent, RelayFactory, WebhookSource } from "@paypal-checkout-integrator/harness";

/**
 * Webhook relay for hosted runs: PayPal delivers to the web app's public
 * /api/paypal/relay/<key> endpoint, which stores each event untouched in
 * Postgres; this source polls for them so the harness can replay them.
 */
class DbWebhookSource implements WebhookSource {
  readonly events: RelayedEvent[] = [];
  private lastId = 0;
  private timer: NodeJS.Timeout | null = null;
  private waiters: { match: (e: RelayedEvent) => boolean; resolve: (e: RelayedEvent) => void }[] = [];

  constructor(private readonly key: string) {}

  start() {
    this.timer = setInterval(() => void this.poll(), 3000);
  }

  async poll() {
    try {
      for (const row of await listRelayedEvents(this.key, this.lastId)) {
        this.lastId = Math.max(this.lastId, Number(row.id));
        const event: RelayedEvent = {
          receivedAt: new Date(row.received_at).toISOString(),
          headers: row.headers,
          rawBody: row.raw_body,
          id: row.event_id ?? "",
          eventType: row.event_type ?? "",
          resourceId: row.resource_id,
          relatedOrderId: row.related_order_id,
        };
        this.events.push(event);
        this.waiters = this.waiters.filter((w) => {
          if (!w.match(event)) return true;
          w.resolve(event);
          return false;
        });
      }
    } catch (err) {
      console.error("[relay] poll failed", (err as Error).message);
    }
  }

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

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.poll();
  }
}

export function dbRelay(runId: string): RelayFactory {
  return async ({ log }) => {
    const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
    if (!base?.startsWith("https://")) {
      log("  ! PUBLIC_URL is not an https URL; webhook scenarios will be limited");
      return null;
    }
    const key = `${runId}-${randomBytes(6).toString("hex")}`;
    const source = new DbWebhookSource(key);
    source.start();
    return { url: `${base}/api/paypal/relay/${key}`, source, stop: () => source.stop() };
  };
}
