import { NextResponse, type NextRequest } from "next/server";
import { getOrder, markOrderRefunded } from "@/lib/orders";
import { refundStripePayment } from "@/lib/stripe";

/** Admin action: fully refund a paid order. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/orders/[id]/refund">) {
  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const back = new URL("/admin/orders", request.url);
  if (order.status === "refunded") return NextResponse.redirect(back, 303);
  if (order.status !== "paid") {
    back.searchParams.set("error", `Order is ${order.status}, not paid`);
    return NextResponse.redirect(back, 303);
  }

  try {
    await refundStripePayment(order);
    await markOrderRefunded(order.id);
  } catch (err) {
    console.error("[refund]", err);
    back.searchParams.set("error", "Refund failed");
  }
  return NextResponse.redirect(back, 303);
}
