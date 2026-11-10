import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { OrderSummary } from "@/components/OrderSummary";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">Order details</h1>
      <OrderSummary order={order} />
    </div>
  );
}
