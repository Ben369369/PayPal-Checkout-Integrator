import type { Metadata } from "next";
import Link from "next/link";
import { ChuiLogo } from "@/components/Brand";
import { Nav, ViewToggle, type NavItem } from "@/components/Nav";
import { currentUser, isOperator } from "@/lib/auth";
import { currentView } from "@/lib/view";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PayPal Checkout Integrator · Chui Labs", template: "%s · PayPal Checkout Integrator · Chui Labs" },
  description: "Add PayPal checkout to your custom-built online store without touching code. Tested with real PayPal test purchases before anything changes.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, view] = await Promise.all([currentUser().catch(() => null), currentView()]);
  const operator = await isOperator(user).catch(() => false);
  const items: NavItem[] = user
    ? [{ href: "/", label: "My stores" }, ...(view === "developer" ? [{ href: "/runs", label: "All runs" }] : []), ...(operator ? [{ href: "/setup", label: "Setup" }] : [])]
    : [{ href: "/#how", label: "How it works" }, { href: "/#who", label: "Who it's for" }];

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
            <Nav items={items} />
            <div className="topbar-end">
              {user ? (
                <>
                  <ViewToggle view={view} />
                  <span className="user" title={`Signed in as ${user.login}`}>
                    {user.avatarUrl && <img src={user.avatarUrl} alt="" width={24} height={24} />}
                    {user.login}
                  </span>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit" className="linklike">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <a className="btn" href="/api/auth/login">
                  Sign in with GitHub
                </a>
              )}
            </div>
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">PayPal Checkout Integrator by Chui Labs. Uses PayPal&apos;s test mode (sandbox): no real money moves.</footer>
      </body>
    </html>
  );
}
