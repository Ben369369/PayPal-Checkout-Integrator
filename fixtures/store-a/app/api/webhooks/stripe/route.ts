import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { markOrderCanceled, markOrderRefunded, recordWebhookEventOnce } from "@/lib/orders";
import { fulfillCheckoutSession, getStripe } from "@/lib/stripe";

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckoutSession(event.data.object);
      break;
    case "checkout.session.expired": {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) await markOrderCanceled(orderId);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      if (!charge.refunded) break; // partial refunds are out of scope
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi) break;
      const order = await db.order.findUnique({ where: { stripePaymentIntentId: pi } });
      if (order) await markOrderRefunded(order.id);
      break;
    }
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const isNew = await recordWebhookEventOnce("stripe", event.id, event.type);
  if (!isNew) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleEvent(event);
  } catch (err) {
    // Forget the event so Stripe's retry is processed.
    await db.processedWebhookEvent.delete({ where: { id: `stripe:${event.id}` } }).catch(() => {});
    console.error("[stripe webhook]", event.type, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
