export function AddToCartForm({
  productId,
  slug,
  withQuantity = false,
}: {
  productId: string;
  slug: string;
  withQuantity?: boolean;
}) {
  return (
    <form action="/api/cart" method="post" className="flex items-center gap-2">
      <input type="hidden" name="action" value="add" />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="redirectTo" value="/cart" />
      {withQuantity ? (
        <input
          type="number"
          name="quantity"
          defaultValue={1}
          min={1}
          max={99}
          aria-label="Quantity"
          data-testid="add-quantity"
          className="w-16 rounded-md border border-stone-300 px-2 py-2 text-sm"
        />
      ) : (
        <input type="hidden" name="quantity" value="1" />
      )}
      <button
        type="submit"
        data-testid={`add-to-cart-${slug}`}
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        Add to cart
      </button>
    </form>
  );
}
