import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { OrderSummary } from "@/components/OrderSummary";

export const dynamic = "force-dynamic";

/** Order confirmation. The payment provider's return handler confirms payment before redirecting here. */
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const { order_id } = await searchParams;
  const order = typeof order_id === "string" ? await getOrder(order_id) : null;
  if (!order) redirect("/cart");

  const paid = order.status === "paid";
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold" data-testid="checkout-result">
        {paid ? "Thank you for your order" : "Payment processing"}
      </h1>
      <p className="mb-6 text-stone-600">
        {paid
          ? "Your payment was received."
          : "We haven't received confirmation of your payment yet. Refresh this page in a moment."}
      </p>
      <OrderSummary order={order} />
      <Link href={`/orders/${order.id}`} className="mt-6 inline-block text-sm underline">
        View order
      </Link>
    </div>
  );
}
