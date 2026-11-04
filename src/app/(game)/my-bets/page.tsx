import Link from "next/link";
import { requireGuest } from "@/lib/auth/session";
import { money, multiplier, payoutFor } from "@/lib/game/format";
import { listEvents, type GameEvent } from "@/lib/game/queries";
import { switchGuest } from "@/app/actions";

const RESULT = { open: "", won: "Won", lost: "Lost", voided: "Voided" };

function BetRow({ event }: { event: GameEvent }) {
  const bet = event.bet!;
  const changeable = event.status === "open";
  return (
    <li>
      <Link href={`/events/${event.id}`} className="bet-row">
        <span className="bet-row-q">{event.question}</span>
        <span>{bet.outcome_label}</span>
        <span>
          {money(bet.stake)} at {multiplier(bet.locked_odds)}
          {bet.status === "open" && `, could win ${money(payoutFor(bet.stake, bet.locked_odds))}`}
          {bet.status !== "open" && `, returned ${money(bet.payout ?? 0)}`}
        </span>
        {bet.status !== "open" && <strong data-result={bet.status}>{RESULT[bet.status]}</strong>}
        {bet.status === "open" && (
          <small>{changeable ? "Tap to change or cancel" : "Betting closed, waiting for the result"}</small>
        )}
      </Link>
    </li>
  );
}

export default async function MyBetsPage() {
  const guest = await requireGuest();
  const bets = (await listEvents(guest.id)).filter((e) => e.bet);
  const open = bets.filter((e) => e.bet!.status === "open");
  const finished = bets.filter((e) => e.bet!.status !== "open");

  return (
    <>
      <h1 className="page-title">My Bets</h1>
      {bets.length === 0 && (
        <p className="empty">You haven&apos;t placed a bet yet. <Link href="/">See what&apos;s open</Link>.</p>
      )}
      {open.length > 0 && (
        <section className="bets"><h2>Open</h2><ul>{open.map((e) => <BetRow key={e.id} event={e} />)}</ul></section>
      )}
      {finished.length > 0 && (
        <section className="bets"><h2>Finished</h2><ul>{finished.map((e) => <BetRow key={e.id} event={e} />)}</ul></section>
      )}
      <form action={switchGuest} className="switch">
        <button className="quiet-link">Switch guest</button>
      </form>
    </>
  );
}
