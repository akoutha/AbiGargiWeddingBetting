import { requireGuest } from "@/lib/auth/session";
import { money, signedMoney } from "@/lib/game/format";
import { leaderboard } from "@/lib/game/queries";

export default async function LeaderboardPage() {
  const guest = await requireGuest();
  const standings = await leaderboard();

  return (
    <>
      <h1 className="page-title">Leaderboard</h1>
      <ol className="standings">
        {standings.map((s) => (
          <li key={s.guest_id} aria-current={s.guest_id === guest.id ? "true" : undefined}>
            <span className="standing-rank">{s.rank}</span>
            <span className="standing-name">
              {s.display_name}{s.guest_id === guest.id && " (you)"}
              <small>{money(s.total_balance)} total</small>
            </span>
            <strong>{signedMoney(s.earnings)}</strong>
          </li>
        ))}
      </ol>
    </>
  );
}
