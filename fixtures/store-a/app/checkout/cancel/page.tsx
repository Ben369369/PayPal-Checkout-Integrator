import Link from "next/link";
import { markOrderCanceled } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** The buyer backed out of Stripe Checkout. The cart is left as it was. */
export default async function CheckoutCancelPage({ searchParams }: PageProps<"/checkout/cancel">) {
  const { order_id } = await searchParams;
  if (typeof order_id === "string") await markOrderCanceled(order_id);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold" data-testid="checkout-result">
        Checkout canceled
      </h1>
      <p className="mb-6 text-stone-600">You weren&apos;t charged. Your cart is still saved.</p>
      <Link href="/cart" className="underline" data-testid="back-to-cart">
        Back to cart
      </Link>
    </div>
  );
}
