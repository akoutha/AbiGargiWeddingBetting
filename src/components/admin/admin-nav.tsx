"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/bets", label: "Bets" },
  { href: "/admin/guests", label: "Guests" },
  { href: "/admin/game", label: "Game" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Admin">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === t.href : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
