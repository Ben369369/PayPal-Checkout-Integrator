import { NextResponse, type NextRequest } from "next/server";
import { confirmCheckoutSession } from "@/lib/stripe";

/**
 * Stripe redirects the buyer here after payment. Confirms the Checkout Session
 * with Stripe's API (marking the order paid), then shows the order.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.redirect(new URL("/cart", request.url), 303);

  try {
    const session = await confirmCheckoutSession(sessionId);
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (!orderId) throw new Error(`Checkout Session ${sessionId} has no order id`);
    return NextResponse.redirect(new URL(`/checkout/success?order_id=${orderId}`, request.url), 303);
  } catch (err) {
    console.error("[stripe return]", err);
    return NextResponse.redirect(new URL("/cart?error=checkout_failed", request.url), 303);
  }
}
