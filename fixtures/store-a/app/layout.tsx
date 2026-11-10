import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCart } from "@/lib/cart";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidepool Goods",
  description: "A small demo store (Stripe test mode).",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cart = await getCurrentCart();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Tidepool Goods
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/" className="hover:underline">
                Shop
              </Link>
              <Link href="/cart" className="hover:underline" data-testid="nav-cart">
                Cart (<span data-testid="cart-count">{cart.itemCount}</span>)
              </Link>
              {/* No prefetch: /admin needs HTTP auth, and prefetching it logs 401s for shoppers. */}
              <Link href="/admin/orders" prefetch={false} className="text-stone-500 hover:underline">
                Admin
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
          Demo store. Test mode only; no real payments.
        </footer>
      </body>
    </html>
  );
}
