"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Keeps odds, balances, and rankings current without a live connection. */
export function AutoRefresh({ seconds = 12 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && navigator.onLine) router.refresh();
    };
    const timer = setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);
  return null;
}

export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return <p className="notice" role="status">You&apos;re offline. Bets can&apos;t be placed until you reconnect.</p>;
}

function timeLeft(ms: number) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes} min`;
}

export function Countdown({ lockAt }: { lockAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return <span>&nbsp;</span>;
  const ms = new Date(lockAt).getTime() - now;
  return <span>{ms > 0 ? `Closes in ${timeLeft(ms)}` : "Closing now"}</span>;
}

const TABS = [
  { href: "/", label: "Bets" },
  { href: "/my-bets", label: "My Bets" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" || path.startsWith("/events") : path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>{t.label}</Link>
        );
      })}
    </nav>
  );
}
