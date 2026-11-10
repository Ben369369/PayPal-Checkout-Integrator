import { NextResponse, type NextRequest } from "next/server";
import { getCartId } from "@/lib/cart";
import { createPendingOrderFromCart, EmptyCartError } from "@/lib/orders";
import { createStripeCheckoutSession } from "@/lib/stripe";
import { db } from "@/lib/db";

/** Creates a pending order from the cart and redirects to Stripe's hosted checkout. */
export async function POST(request: NextRequest) {
  const cartId = await getCartId();
  if (!cartId) return NextResponse.redirect(new URL("/cart", request.url), 303);

  try {
    const order = await createPendingOrderFromCart(cartId);
    const session = await createStripeCheckoutSession(order);
    await db.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    if (err instanceof EmptyCartError) return NextResponse.redirect(new URL("/cart", request.url), 303);
    console.error("[stripe checkout]", err);
    return NextResponse.redirect(new URL("/cart?error=checkout_failed", request.url), 303);
  }
}
