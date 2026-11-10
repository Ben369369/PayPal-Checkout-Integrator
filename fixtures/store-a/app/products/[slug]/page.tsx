import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { ProductTile } from "@/components/ProductTile";
import { AddToCartForm } from "@/components/AddToCartForm";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await db.product.findUnique({ where: { slug } });
  if (!product || !product.active) notFound();

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductTile slug={product.slug} name={product.name} />
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-xl" data-testid="product-price">
          {formatCents(product.priceCents, product.currency)}
        </p>
        <p className="text-stone-600">{product.description}</p>
        <AddToCartForm productId={product.id} slug={product.slug} withQuantity />
      </div>
    </div>
  );
}
