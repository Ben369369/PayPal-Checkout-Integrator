"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/** Plain-word page names; the active one gets a 3px navy underline. */
export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/repos") : pathname.startsWith(href));
  return (
    <nav className="nav" aria-label="Main">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Simple / Developer switch; returns to the current page. */
export function ViewToggle({ view }: { view: "simple" | "developer" }) {
  const pathname = usePathname();
  const href = (mode: string) => `/api/view?mode=${mode}&next=${encodeURIComponent(pathname)}`;
  return (
    <div className="view-toggle" role="group" aria-label="View">
      <a href={href("simple")} aria-current={view === "simple" ? "true" : undefined}>
        Simple
      </a>
      <a href={href("developer")} aria-current={view === "developer" ? "true" : undefined}>
        Developer
      </a>
    </div>
  );
}
