import { requireGuest } from "@/lib/auth/session";
import { money, signedMoney } from "@/lib/game/format";
import { gameSettings, guestSummary } from "@/lib/game/queries";
import { AutoRefresh, OfflineNotice, TabBar } from "@/components/live";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const guest = await requireGuest();
  const [summary, settings] = await Promise.all([guestSummary(guest.id), gameSettings()]);

  return (
    <>
      <header className="purse">
        <div>
          <p>{guest.displayName}</p>
          <p className="purse-amount">{money(summary.available_balance)}</p>
        </div>
        <dl>
          <div><dt>Earnings</dt><dd>{signedMoney(summary.earnings)}</dd></div>
          <div><dt>Rank</dt><dd>{summary.rank ? `#${summary.rank}` : "None"}</dd></div>
        </dl>
      </header>
      <OfflineNotice />
      {settings.ended && <p className="notice">The game has ended. Final standings are on the leaderboard.</p>}
      {settings.betting_paused && !settings.ended && (
        <p className="notice">Betting is paused for a moment.</p>
      )}
      <main className="game">{children}</main>
      <TabBar />
      <AutoRefresh />
    </>
  );
}
