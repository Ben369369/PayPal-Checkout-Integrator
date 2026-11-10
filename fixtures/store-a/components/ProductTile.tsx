const PALETTE = ["#c2410c", "#0e7490", "#4d7c0f", "#6d28d9", "#be185d", "#a16207"];

function colorFor(slug: string): string {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Placeholder product image: a colored tile with the product's initials. */
export function ProductTile({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div
      className={`flex aspect-square items-center justify-center rounded-lg text-3xl font-semibold text-white/90 ${className}`}
      style={{ backgroundColor: colorFor(slug) }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
