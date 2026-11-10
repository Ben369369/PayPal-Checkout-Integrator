import Stripe from "stripe";
import { markOrderPaid } from "@/lib/orders";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("This store only runs with a Stripe test-mode key");
  }
  client ??= new Stripe(key);
  return client;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type OrderForCheckout = {
  id: string;
  currency: string;
  items: { name: string; unitPriceCents: number; quantity: number }[];
};

/** Creates a hosted Stripe Checkout Session for a pending order. */
export async function createStripeCheckoutSession(order: OrderForCheckout) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      payment_intent_data: { metadata: { orderId: order.id } },
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: order.currency,
          unit_amount: item.unitPriceCents,
          product_data: { name: item.name },
        },
      })),
      success_url: `${appUrl()}/api/checkout/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/checkout/cancel?order_id=${order.id}`,
    },
    { idempotencyKey: `checkout-session-${order.id}` },
  );
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/**
 * Marks the order paid if Stripe says the session is paid.
 * Used by both the success page and the webhook; markOrderPaid is idempotent.
 */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) throw new Error(`Checkout Session ${session.id} has no order id`);
  if (session.payment_status !== "paid") return null;
  return markOrderPaid(orderId, {
    amountCents: session.amount_total ?? -1,
    customerEmail: session.customer_details?.email ?? null,
    stripePaymentIntentId: paymentIntentId(session),
  });
}

export async function confirmCheckoutSession(sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  await fulfillCheckoutSession(session);
  return session;
}

/** Issues a full refund for an order paid through Stripe. */
export async function refundStripePayment(order: { id: string; stripePaymentIntentId: string | null }) {
  if (!order.stripePaymentIntentId) throw new Error(`Order ${order.id} has no Stripe payment`);
  return getStripe().refunds.create(
    { payment_intent: order.stripePaymentIntentId, metadata: { orderId: order.id } },
    { idempotencyKey: `refund-${order.id}` },
  );
}
