import type { Metadata } from "next";
import Link from "next/link";
import { ChuiLogo } from "@/components/Brand";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PayPal Checkout Integrator · Chui Labs", template: "%s · PayPal Checkout Integrator · Chui Labs" },
  description: "Adds PayPal checkout to a Stripe-only store, proves it with a real PayPal sandbox purchase, and opens a pull request.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <ChuiLogo />
              <span className="brand-name">PayPal Checkout Integrator</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">PayPal Checkout Integrator by Chui Labs. PayPal sandbox and Stripe test mode only.</footer>
      </body>
    </html>
  );
}
