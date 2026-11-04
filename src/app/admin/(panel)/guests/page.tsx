import Link from "next/link";
import { addGuest } from "@/app/admin/actions";
import { adminGuests } from "@/lib/admin/queries";
import { count, money, signedMoney } from "@/lib/game/format";
import { ActionForm } from "@/components/admin/action-form";

export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const guests = await adminGuests(q.trim());
  return (
    <>
      <div className="title-row">
        <h1 className="page-title">Guests</h1>
        <Link className="button" href="/admin/guests/import">Import guests</Link>
      </div>
      <section className="panel">
        <h2>Add a guest</h2>
        <ActionForm action={addGuest} submit="Add guest" className="inline-form grow">
          <input name="name" placeholder="Full name" aria-label="Guest name" required />
        </ActionForm>
      </section>
      <section className="panel">
        <form className="inline-form grow">
          <input name="q" defaultValue={q} placeholder="Search guests" aria-label="Search guests" />
          <button className="button secondary">Search</button>
        </form>
        <h2>{count(guests.length, "guest")}</h2>
        <ul className="rows">
          {guests.map((g) => (
            <li className="row-item" key={g.id}>
              <Link href={`/admin/guests/${g.id}`}>
                <strong>{g.display_name}</strong>
                <small>
                  {!g.is_active ? "Deactivated" : g.joined ? `${money(g.available_balance)} available, ${count(g.bet_count, "bet")}` : "Hasn't joined"}
                </small>
              </Link>
              <span>{signedMoney(g.earnings)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
