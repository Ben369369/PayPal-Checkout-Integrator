import { db } from "@/lib/db";
import { clearCart, loadCart } from "@/lib/cart";

export type OrderStatus = "pending" | "paid" | "canceled" | "refunded";

export class EmptyCartError extends Error {
  constructor() {
    super("Cart is empty");
  }
}

/**
 * Creates a pending order from the server-side cart. Prices and totals come
 * from the database, so nothing the browser sends can change the amount.
 */
export async function createPendingOrderFromCart(cartId: string) {
  const cart = await loadCart(cartId);
  if (cart.lines.length === 0) throw new EmptyCartError();

  return db.order.create({
    data: {
      cartId,
      status: "pending",
      currency: cart.currency,
      subtotalCents: cart.subtotalCents,
      totalCents: cart.subtotalCents,
      items: {
        create: cart.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: line.lineTotalCents,
        })),
      },
    },
    include: { items: true },
  });
}

export async function getOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, include: { items: true } });
}

export async function listOrders() {
  return db.order.findMany({ orderBy: { createdAt: "desc" }, include: { items: true } });
}

/**
 * Marks an order paid after the payment provider confirmed it.
 * Idempotent: calling it again for a paid order is a no-op.
 * Rejects the payment if the captured amount differs from the order total.
 * Clears the cart the order was created from.
 */
export async function markOrderPaid(
  orderId: string,
  details: { amountCents: number; customerEmail?: string | null; stripePaymentIntentId?: string | null },
) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status === "paid" || order.status === "refunded") return order;
  if (details.amountCents !== order.totalCents) {
    throw new Error(
      `Amount mismatch for order ${orderId}: paid ${details.amountCents}, expected ${order.totalCents}`,
    );
  }

  const updated = await db.order.update({
    where: { id: orderId },
    data: {
      status: "paid",
      paidAt: new Date(),
      customerEmail: details.customerEmail ?? order.customerEmail,
      stripePaymentIntentId: details.stripePaymentIntentId ?? order.stripePaymentIntentId,
    },
  });
  if (order.cartId) await clearCart(order.cartId);
  return updated;
}

/** Marks a paid order refunded. Idempotent. */
export async function markOrderRefunded(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status === "refunded") return order;
  if (order.status !== "paid") throw new Error(`Order ${orderId} is ${order.status}, not paid`);
  return db.order.update({ where: { id: orderId }, data: { status: "refunded", refundedAt: new Date() } });
}

/** Cancels a pending order (the buyer backed out). Paid orders are left alone. */
export async function markOrderCanceled(orderId: string) {
  await db.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "canceled" } });
}

/**
 * Records a webhook event id. Returns false if it was already processed,
 * so handlers can skip duplicate deliveries.
 */
export async function recordWebhookEventOnce(provider: string, eventId: string, type: string): Promise<boolean> {
  try {
    await db.processedWebhookEvent.create({ data: { id: `${provider}:${eventId}`, provider, type } });
    return true;
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") return false;
    throw err;
  }
}
