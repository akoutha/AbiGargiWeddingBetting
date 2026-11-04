import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGuest } from "@/lib/auth/session";
import { money, multiplier } from "@/lib/game/format";
import { gameSettings, getEvent, guestSummary } from "@/lib/game/queries";
import { BetSlip } from "@/components/bet-slip";
import { Countdown } from "@/components/live";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const guest = await requireGuest();
  const { id } = await params;
  const [event, summary, settings] = await Promise.all([
    getEvent(guest.id, id), guestSummary(guest.id), gameSettings(),
  ]);
  if (!event) notFound();
  const bet = event.bet;

  return (
    <article className="event">
      <Link className="back" href="/">All bets</Link>
      <div className="event-card">
        {event.function_name && <p className="ticket-meta">{event.function_name}</p>}
        <h1>{event.question}</h1>
        {event.description && <p>{event.description}</p>}
        {event.status === "open" && event.lock_at && (
          <p className="ticket-foot"><Countdown lockAt={event.lock_at} /></p>
        )}

        {event.status === "open" && (
          <BetSlip outcomes={event.outcomes} bet={bet}
            available={summary.available_balance} minBet={settings.min_bet}
            paused={settings.betting_paused} />
        )}

        {event.status !== "open" && (
          <>
            <p className="status-line">
              {event.status === "locked" && "Betting has closed. Waiting for the result."}
              {event.status === "settled" && "Final result"}
              {event.status === "voided" && "This event was cancelled and all bets were returned."}
            </p>
            <ul className="results">
              {event.outcomes.map((o) => (
                <li key={o.id} data-winner={o.id === event.winning_outcome_id || undefined}>
                  <span>{o.label}{o.id === event.winning_outcome_id && " (winner)"}</span>
                  <strong>{multiplier(o.odds)}</strong>
                </li>
              ))}
            </ul>
            {bet && (
              <p className="your-result">
                You bet {money(bet.stake)} on {bet.outcome_label} at {multiplier(bet.locked_odds)}.{" "}
                {bet.status === "won" && `You won ${money(bet.payout ?? 0)}.`}
                {bet.status === "lost" && "It didn't come in."}
                {bet.status === "voided" && "Your stake was returned."}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
