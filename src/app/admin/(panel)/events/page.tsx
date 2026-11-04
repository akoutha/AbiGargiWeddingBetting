import Link from "next/link";
import { addFunction, deleteFunction, updateFunction } from "@/app/admin/actions";
import { adminEvents, adminFunctions } from "@/lib/admin/queries";
import { count, money } from "@/lib/game/format";
import { ActionForm } from "@/components/admin/action-form";

const STATUS = { draft: "Draft", open: "Open", locked: "Locked", settled: "Settled", voided: "Voided" };

export default async function EventsPage() {
  const [events, functions] = await Promise.all([adminEvents(), adminFunctions()]);
  const groups = [...functions.map((f) => ({ id: f.id as string | null, name: f.name })), { id: null, name: "No function" }]
    .map((g) => ({ ...g, events: events.filter((e) => e.function_id === g.id) }))
    .filter((g) => g.events.length > 0);

  return (
    <>
      <div className="title-row">
        <h1 className="page-title">Events</h1>
        <Link className="button" href="/admin/events/new">New event</Link>
      </div>
      {events.length === 0 && <p className="empty">No events yet. Create the first one.</p>}
      {groups.map((g) => (
        <section className="panel" key={g.id ?? "none"}>
          <h2>{g.name}</h2>
          <ul className="rows">
            {g.events.map((e) => (
              <li className="row-item" key={e.id}>
                <Link href={`/admin/events/${e.id}`}>
                  <strong>{e.question}</strong>
                  <small>{count(e.bet_count, "bet")}, {money(e.total_staked)}</small>
                </Link>
                <span className="pill" data-status={e.status}>{STATUS[e.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="panel">
        <h2>Functions</h2>
        <p>Functions group events for guests. Lower order numbers appear first.</p>
        {functions.map((f) => (
          <div className="function-row" key={f.id}>
            <ActionForm action={updateFunction} submit="Save" variant="secondary" className="inline-form grow">
              <input type="hidden" name="id" value={f.id} />
              <input name="name" defaultValue={f.name} aria-label="Function name" required />
              <input name="sort_order" type="number" defaultValue={f.sort_order} aria-label="Order" className="short" />
            </ActionForm>
            <ActionForm action={deleteFunction} submit="Delete" pendingText="Deleting..." variant="secondary" className="inline-form"
              confirm={`Delete ${f.name}? Its events stay, without a function.`}>
              <input type="hidden" name="id" value={f.id} />
            </ActionForm>
          </div>
        ))}
        <ActionForm action={addFunction} submit="Add function" className="inline-form grow">
          <input name="name" placeholder="Sangeet" aria-label="New function name" required />
          <input name="sort_order" type="number" defaultValue={functions.length + 1} aria-label="Order" className="short" />
        </ActionForm>
      </section>
    </>
  );
}
