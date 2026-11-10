import { formatCents } from "@/lib/money";

type Order = {
  id: string;
  status: string;
  currency: string;
  totalCents: number;
  items: { id: string; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
};

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6" data-testid="order-summary">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-stone-500">
          Order <span data-testid="order-id">{order.id}</span>
        </span>
        <span
          data-testid="order-status"
          className="rounded-full bg-stone-100 px-3 py-1 font-medium capitalize text-stone-700"
        >
          {order.status}
        </span>
      </div>
      <ul className="divide-y divide-stone-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between py-2 text-sm">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatCents(item.lineTotalCents, order.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-between border-t border-stone-200 pt-4 font-semibold">
        <span>Total</span>
        <span data-testid="order-total">{formatCents(order.totalCents, order.currency)}</span>
      </div>
    </div>
  );
}
