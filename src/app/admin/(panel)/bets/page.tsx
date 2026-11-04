import { adminBets, adminEvents, adminGuests } from "@/lib/admin/queries";
import { count } from "@/lib/game/format";
import { BetTable } from "@/components/admin/bet-table";

type Search = { event?: string; guest?: string; status?: string };

export default async function BetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filter = await searchParams;
  const [bets, events, guests] = await Promise.all([adminBets(filter), adminEvents(), adminGuests("")]);

  return (
    <>
      <h1 className="page-title">Bets</h1>
      <form className="panel filter-form">
        <label>Event
          <select name="event" defaultValue={filter.event ?? ""}>
            <option value="">All events</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.question}</option>)}
          </select>
        </label>
        <label>Guest
          <select name="guest" defaultValue={filter.guest ?? ""}>
            <option value="">All guests</option>
            {guests.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={filter.status ?? ""}>
            <option value="">All except cancelled</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="voided">Voided</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button className="button secondary">Filter</button>
      </form>
      <section className="panel">
        <h2>{bets.length === 500 ? "Latest 500 bets" : count(bets.length, "bet")}</h2>
        {bets.length === 0 ? <p>No bets match these filters.</p> : <BetTable bets={bets} />}
      </section>
    </>
  );
}
