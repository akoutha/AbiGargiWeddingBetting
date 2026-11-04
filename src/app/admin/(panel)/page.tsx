import Link from "next/link";
import { adminEvents, dashboardStats, type AdminEvent } from "@/lib/admin/queries";
import { lockEvent } from "@/app/admin/actions";
import { count, money } from "@/lib/game/format";
import { ActionForm } from "@/components/admin/action-form";
import { LocalTime } from "@/components/admin/time";
import { AutoRefresh } from "@/components/live";

function EventRow({ event, lock }: { event: AdminEvent; lock?: boolean }) {
  return (
    <li className="row-item">
      <Link href={`/admin/events/${event.id}`}>
        <strong>{event.question}</strong>
        <small>
          {count(event.bet_count, "bet")}, {money(event.total_staked)}
          {event.status === "open" && event.lock_at && <>, closes <LocalTime iso={event.lock_at} /></>}
        </small>
      </Link>
      {lock && (
        <ActionForm action={lockEvent} submit="Lock" pendingText="Locking..." variant="secondary" className="inline-form">
          <input type="hidden" name="id" value={event.id} />
        </ActionForm>
      )}
    </li>
  );
}

export default async function DashboardPage() {
  const [stats, events] = await Promise.all([dashboardStats(), adminEvents()]);
  const waiting = events.filter((e) => e.status === "locked");
  const open = events
    .filter((e) => e.status === "open")
    .sort((a, b) => (a.lock_at ?? "9").localeCompare(b.lock_at ?? "9"));

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      {stats.ended && <p className="notice">The game has ended.</p>}
      {stats.paused && !stats.ended && <p className="notice">Betting is paused. Resume it from Game.</p>}
      <dl className="stats">
        <div><dt>Guests joined</dt><dd>{stats.joined} of {stats.guests}</dd></div>
        <div><dt>Bets placed</dt><dd>{stats.bets}</dd></div>
        <div><dt>Money wagered</dt><dd>{money(stats.wagered)}</dd></div>
      </dl>
      <section className="panel">
        <h2>Waiting for a result</h2>
        {waiting.length === 0 ? <p>No locked events are waiting.</p> : (
          <ul className="rows">{waiting.map((e) => <EventRow key={e.id} event={e} />)}</ul>
        )}
      </section>
      <section className="panel">
        <h2>Open for bets</h2>
        {open.length === 0 ? <p>No events are open. <Link href="/admin/events">Go to Events</Link> to publish one.</p> : (
          <ul className="rows">{open.map((e) => <EventRow key={e.id} event={e} lock />)}</ul>
        )}
      </section>
      <AutoRefresh />
    </>
  );
}
