import { NextResponse, type NextRequest } from "next/server";
import {
  addToCart,
  getCurrentCart,
  getOrCreateCartId,
  loadCart,
  removeFromCart,
  setCartQuantity,
} from "@/lib/cart";

type CartAction = { action: string; productId: string; quantity: number; redirectTo: string | null };

async function readBody(request: NextRequest): Promise<CartAction> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      action: String(body.action ?? "add"),
      productId: String(body.productId ?? ""),
      quantity: Number(body.quantity ?? 1),
      redirectTo: null,
    };
  }
  const form = await request.formData();
  return {
    action: String(form.get("action") ?? "add"),
    productId: String(form.get("productId") ?? ""),
    quantity: Number(form.get("quantity") ?? 1),
    redirectTo: form.get("redirectTo") ? String(form.get("redirectTo")) : "/cart",
  };
}

/** Only allow same-site relative redirects. */
function safeRedirect(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/cart";
  return path;
}

export async function GET() {
  return NextResponse.json(await getCurrentCart());
}

export async function POST(request: NextRequest) {
  const { action, productId, quantity, redirectTo } = await readBody(request);
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });

  const cartId = await getOrCreateCartId();
  try {
    if (action === "add") await addToCart(cartId, productId, quantity);
    else if (action === "set") await setCartQuantity(cartId, productId, quantity);
    else if (action === "remove") await removeFromCart(cartId, productId);
    else return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }

  if (redirectTo !== null) {
    return NextResponse.redirect(new URL(safeRedirect(redirectTo), request.url), 303);
  }
  return NextResponse.json(await loadCart(cartId));
}
