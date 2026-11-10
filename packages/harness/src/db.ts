import Database from "better-sqlite3";

export type OrderSnapshot = {
  order: Record<string, unknown>;
  items: { name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
};

/** Read-only view of the store's SQLite database. */
export class StoreDb {
  constructor(private readonly file: string) {}

  private with<T>(fn: (db: Database.Database) => T): T {
    const db = new Database(this.file, { readonly: true, fileMustExist: true });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  snapshot(orderId: string): OrderSnapshot | null {
    return this.with((db) => {
      const order = db.prepare(`SELECT * FROM "Order" WHERE id = ?`).get(orderId) as Record<string, unknown> | undefined;
      if (!order) return null;
      const items = db
        .prepare(`SELECT name, unitPriceCents, quantity, lineTotalCents FROM "OrderItem" WHERE orderId = ? ORDER BY name`)
        .all(orderId) as OrderSnapshot["items"];
      return { order, items };
    });
  }

  orderIdByPayPalOrderId(paypalOrderId: string): string | null {
    return this.with((db) => {
      const row = db.prepare(`SELECT id FROM "Order" WHERE paypalOrderId = ?`).get(paypalOrderId) as { id: string } | undefined;
      return row?.id ?? null;
    });
  }

  ordersWithStatus(status: string): number {
    return this.with((db) => (db.prepare(`SELECT COUNT(*) AS n FROM "Order" WHERE status = ?`).get(status) as { n: number }).n);
  }

  processedEventCount(provider: string, eventId: string): number {
    return this.with(
      (db) =>
        (db.prepare(`SELECT COUNT(*) AS n FROM "ProcessedWebhookEvent" WHERE id = ?`).get(`${provider}:${eventId}`) as { n: number }).n,
    );
  }

  productPrices(): Record<string, number> {
    return this.with((db) =>
      Object.fromEntries(
        (db.prepare(`SELECT slug, priceCents FROM "Product"`).all() as { slug: string; priceCents: number }[]).map((p) => [
          p.slug,
          p.priceCents,
        ]),
      ),
    );
  }
}

/** Fields that legitimately differ between providers or runs. */
const IGNORED = /^(id|cartId|createdAt|paidAt|refundedAt|customerEmail|paymentProvider|stripe\w*|paypal\w*)$/;

/** Compares a PayPal order with a Stripe order for the same cart, ignoring provider IDs and timestamps. */
export function diffSnapshots(paypal: OrderSnapshot, stripe: OrderSnapshot): string[] {
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(paypal.order), ...Object.keys(stripe.order)]);
  for (const key of keys) {
    if (IGNORED.test(key)) continue;
    if (paypal.order[key] !== stripe.order[key]) diffs.push(`order.${key}: paypal=${paypal.order[key]} stripe=${stripe.order[key]}`);
  }
  for (const key of ["paidAt", "refundedAt"]) {
    if (Boolean(paypal.order[key]) !== Boolean(stripe.order[key])) diffs.push(`order.${key} set: paypal=${Boolean(paypal.order[key])} stripe=${Boolean(stripe.order[key])}`);
  }
  if (JSON.stringify(paypal.items) !== JSON.stringify(stripe.items)) {
    diffs.push(`items: paypal=${JSON.stringify(paypal.items)} stripe=${JSON.stringify(stripe.items)}`);
  }
  return diffs;
}
