import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const CART_COOKIE = "cart_id";
export const MAX_QUANTITY = 99;

export type CartLine = {
  productId: string;
  slug: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type CartView = {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  currency: string;
};

const EMPTY_CART: CartView = { id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: "usd" };

/** Cart id from the cookie, or null. Safe to call while rendering. */
export async function getCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/** Cart id from the cookie, creating a cart (and the cookie) if needed. Route handlers and server actions only. */
export async function getOrCreateCartId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_COOKIE)?.value;
  if (existing) {
    const cart = await db.cart.findUnique({ where: { id: existing }, select: { id: true } });
    if (cart) return cart.id;
  }
  const cart = await db.cart.create({ data: {} });
  store.set(CART_COOKIE, cart.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return cart.id;
}

/** Loads a cart with prices taken from the database, never from the client. */
export async function loadCart(cartId: string | null): Promise<CartView> {
  if (!cartId) return EMPTY_CART;
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: { items: { include: { product: true }, orderBy: { id: "asc" } } },
  });
  if (!cart) return EMPTY_CART;

  const lines: CartLine[] = cart.items
    .filter((item) => item.product.active && item.quantity > 0)
    .map((item) => ({
      productId: item.productId,
      slug: item.product.slug,
      name: item.product.name,
      unitPriceCents: item.product.priceCents,
      quantity: item.quantity,
      lineTotalCents: item.product.priceCents * item.quantity,
    }));

  return {
    id: cart.id,
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
    currency: "usd",
  };
}

export async function getCurrentCart(): Promise<CartView> {
  return loadCart(await getCartId());
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity)));
}

export async function addToCart(cartId: string, productId: string, quantity = 1) {
  const product = await db.product.findFirst({ where: { id: productId, active: true } });
  if (!product) throw new Error("Product not found");
  const existing = await db.cartItem.findUnique({ where: { cartId_productId: { cartId, productId } } });
  const next = clampQuantity((existing?.quantity ?? 0) + quantity);
  if (next === 0) return;
  await db.cartItem.upsert({
    where: { cartId_productId: { cartId, productId } },
    create: { cartId, productId, quantity: next },
    update: { quantity: next },
  });
}

export async function setCartQuantity(cartId: string, productId: string, quantity: number) {
  const next = clampQuantity(quantity);
  if (next === 0) return removeFromCart(cartId, productId);
  await db.cartItem.updateMany({ where: { cartId, productId }, data: { quantity: next } });
}

export async function removeFromCart(cartId: string, productId: string) {
  await db.cartItem.deleteMany({ where: { cartId, productId } });
}

export async function clearCart(cartId: string) {
  await db.cartItem.deleteMany({ where: { cartId } });
}
