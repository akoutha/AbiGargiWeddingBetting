import Link from "next/link";
import { requireGuest } from "@/lib/auth/session";
import { money, multiplier } from "@/lib/game/format";
import { listEvents, type GameEvent } from "@/lib/game/queries";
import { Countdown } from "@/components/live";

function EventTicket({ event }: { event: GameEvent }) {
  const best = Math.max(...event.outcomes.map((o) => Number(o.odds)));
  return (
    <Link href={`/events/${event.id}`} className="ticket">
      <div className="ticket-body">
        <p className="ticket-meta">{event.function_name}</p>
        <h2>{event.question}</h2>
        <p className="ticket-foot">
          {event.bet
            ? `You bet ${money(event.bet.stake)} on ${event.bet.outcome_label}`
            : event.lock_at ? <Countdown lockAt={event.lock_at} /> : "Open for bets"}
        </p>
      </div>
      <div className="ticket-stub">
        <span>up to</span>
        <strong>{multiplier(best)}</strong>
      </div>
    </Link>
  );
}

const STATUS_TEXT = { locked: "Waiting for the result", settled: "Result in", voided: "Cancelled", open: "" };

function ClosedRow({ event }: { event: GameEvent }) {
  const bet = event.bet;
  const yours = !bet ? "" : bet.status === "won" ? `You won ${money(bet.payout ?? 0)}`
    : bet.status === "lost" ? "You lost this one"
    : bet.status === "voided" ? "Stake returned" : `You bet ${money(bet.stake)}`;
  return (
    <li>
      <Link href={`/events/${event.id}`}>
        <span>{event.question}</span>
        <small>{yours || STATUS_TEXT[event.status]}</small>
      </Link>
    </li>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ function?: string }> }) {
  const guest = await requireGuest();
  const { function: selected } = await searchParams;
  const events = await listEvents(guest.id);

  const functions = [...new Map(
    events.filter((e) => e.function_id).map((e) => [e.function_id!, e.function_name!]),
  )];
  const visible = selected ? events.filter((e) => e.function_id === selected) : events;
  const open = visible
    .filter((e) => e.status === "open")
    .sort((a, b) => (a.lock_at ?? "9").localeCompare(b.lock_at ?? "9"));
  const closed = visible.filter((e) => e.status !== "open");

  return (
    <>
      {functions.length > 1 && (
        <nav className="filters" aria-label="Filter by function">
          <Link href="/" aria-current={!selected ? "true" : undefined}>All</Link>
          {functions.map(([id, name]) => (
            <Link key={id} href={`/?function=${id}`} aria-current={selected === id ? "true" : undefined}>{name}</Link>
          ))}
        </nav>
      )}
      {open.length === 0 && closed.length === 0 && (
        <p className="empty">No bets are open yet. New ones appear here as the wedding gets closer.</p>
      )}
      {open.length === 0 && closed.length > 0 && <p className="empty">Nothing is open right now.</p>}
      <div className="tickets">
        {open.map((e) => <EventTicket key={e.id} event={e} />)}
      </div>
      {closed.length > 0 && (
        <section className="closed">
          <h2>Closed</h2>
          <ul>{closed.map((e) => <ClosedRow key={e.id} event={e} />)}</ul>
        </section>
      )}
    </>
  );
}
