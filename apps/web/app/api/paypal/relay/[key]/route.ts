import { NextResponse, type NextRequest } from "next/server";
import { storeRelayedEvent } from "@paypal-checkout-integrator/shared";
import { ensureDb } from "@/lib/server";

/**
 * Webhook relay: PayPal delivers sandbox events here during a harness run.
 * Each event is stored exactly as received (raw body + headers) so the worker
 * can replay it to the store under test; signatures still verify because PayPal
 * verifies headers, body, and webhook id, not the delivery URL.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/paypal/relay/[key]">) {
  const { key } = await ctx.params;
  if (!/^[\w-]{8,100}$/.test(key)) return NextResponse.json({ error: "bad key" }, { status: 404 });
  const rawBody = await request.text();
  if (rawBody.length > 512_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    if (name.startsWith("paypal-") || name === "content-type") headers[name] = value;
  });
  await ensureDb();
  await storeRelayedEvent(key, headers, rawBody);
  return NextResponse.json({ received: true });
}
