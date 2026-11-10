import Link from "next/link";
import { listOrders } from "@/lib/orders";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  canceled: "bg-stone-100 text-stone-600",
  refunded: "bg-blue-100 text-blue-800",
};

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const orders = await listOrders();
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Orders</h1>
      {typeof error === "string" && (
        <p role="alert" data-testid="admin-error" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {orders.length === 0 ? (
        <p className="text-stone-600">No orders yet.</p>
      ) : (
        <table className="w-full text-left text-sm" data-testid="orders-table">
          <thead className="border-b border-stone-200 text-stone-500">
            <tr>
              <th className="py-2 font-medium">Order</th>
              <th className="py-2 font-medium">Created</th>
              <th className="py-2 font-medium">Items</th>
              <th className="py-2 font-medium">Payment</th>
              <th className="py-2 text-right font-medium">Total</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {orders.map((order) => (
              <tr key={order.id} data-testid={`order-row-${order.id}`}>
                <td className="py-3 font-mono text-xs">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    {order.id}
                  </Link>
                </td>
                <td className="py-3 text-stone-600">{order.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="py-3 text-stone-600">{order.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td className="py-3 text-stone-600">{order.stripePaymentIntentId ? "Card (Stripe)" : "—"}</td>
                <td className="py-3 text-right">{formatCents(order.totalCents, order.currency)}</td>
                <td className="py-3">
                  <span
                    data-testid="order-status"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[order.status] ?? ""}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {order.status === "paid" && (
                    <form action={`/api/admin/orders/${order.id}/refund`} method="post">
                      <button
                        type="submit"
                        data-testid="refund-order"
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100"
                      >
                        Refund
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
