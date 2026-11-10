import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { ProductTile } from "@/components/ProductTile";
import { AddToCartForm } from "@/components/AddToCartForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await db.product.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Shop</h1>
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id} className="flex flex-col gap-3" data-testid={`product-${p.slug}`}>
            <Link href={`/products/${p.slug}`}>
              <ProductTile slug={p.slug} name={p.name} />
            </Link>
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/products/${p.slug}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              <span className="text-sm text-stone-600" data-testid="product-price">
                {formatCents(p.priceCents, p.currency)}
              </span>
            </div>
            <AddToCartForm productId={p.id} slug={p.slug} />
          </li>
        ))}
      </ul>
    </div>
  );
}
