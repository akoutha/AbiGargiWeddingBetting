import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addOutcome, deleteEvent, deleteOutcome, duplicateEvent, lockEvent, publishEvent,
  renameOutcome, reopenEvent, setOdds, updateEvent, voidEvent,
} from "@/app/admin/actions";
import { adminBets, adminEvent, adminFunctions, eventOutcomes } from "@/lib/admin/queries";
import { count, money, multiplier } from "@/lib/game/format";
import { BetTable } from "@/components/admin/bet-table";
import { ActionForm } from "@/components/admin/action-form";
import { SettlePanel } from "@/components/admin/settle-panel";
import { LocalTime, LockTimeField } from "@/components/admin/time";
import { AutoRefresh } from "@/components/live";

const STATUS = {
  draft: "Draft. Guests can't see this yet.",
  open: "Open. Guests can bet.",
  locked: "Locked. Waiting for the result.",
  settled: "Settled. Payouts are complete.",
  voided: "Voided. All stakes were returned.",
};

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await adminEvent(id);
  if (!event) notFound();
  const [outcomes, functions, bets] = await Promise.all([
    eventOutcomes(id), adminFunctions(), adminBets({ event: id }),
  ]);
  const editableOutcomes = event.status === "draft" || event.status === "open";
  const idField = <input type="hidden" name="id" value={event.id} />;

  return (
    <>
      <Link className="back" href="/admin/events">All events</Link>
      <h1 className="page-title">{event.question}</h1>
      <p className="status-note">
        {STATUS[event.status]}
        {event.lock_at && event.status === "open" && <> Closes <LocalTime iso={event.lock_at} />.</>}
      </p>

      <div className="actions spaced">
        {event.status === "draft" && (
          <ActionForm action={publishEvent} submit="Publish" pendingText="Publishing..." className="inline-form">{idField}</ActionForm>
        )}
        {event.status === "open" && (
          <ActionForm action={lockEvent} submit="Lock betting" pendingText="Locking..." className="inline-form">{idField}</ActionForm>
        )}
        <ActionForm action={duplicateEvent} submit="Duplicate" pendingText="Copying..." variant="secondary" className="inline-form">{idField}</ActionForm>
        {event.status === "draft" && (
          <ActionForm action={deleteEvent} submit="Delete" pendingText="Deleting..." variant="danger" confirm="Delete this draft?" className="inline-form">{idField}</ActionForm>
        )}
      </div>

      {event.status === "locked" && (
        <SettlePanel eventId={event.id} outcomes={outcomes} currentWinner={null} />
      )}
      {event.status === "settled" && (
        <SettlePanel eventId={event.id} outcomes={outcomes} currentWinner={event.winning_outcome_id} />
      )}

      <section className="panel">
        <h2>Outcomes and odds</h2>
        {event.status === "open" && <p>New odds apply to new bets. Existing bets keep their odds.</p>}
        <ul className="outcomes">
          {outcomes.map((o) => (
            <li key={o.id} data-winner={o.id === event.winning_outcome_id || undefined}>
              <div className="outcome-head">
                {editableOutcomes && !o.has_history ? (
                  <ActionForm action={renameOutcome} submit="Rename" variant="secondary" className="inline-form grow">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="label" defaultValue={o.label} aria-label="Outcome name" required />
                  </ActionForm>
                ) : <strong>{o.label}{o.id === event.winning_outcome_id && " (winner)"}</strong>}
                {!editableOutcomes && <strong>{multiplier(o.odds)}</strong>}
              </div>
              <p className="outcome-totals">
                {count(o.bet_count, "bet")}, {money(o.total_staked)} staked, pays {money(o.potential_payout)} if it wins
              </p>
              {editableOutcomes && (
                <div className="outcome-actions">
                  <ActionForm action={setOdds} submit="Save odds" variant="secondary" className="inline-form">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="odds" defaultValue={Number(o.odds)} inputMode="decimal" aria-label={`Odds for ${o.label}`} className="short" required />
                  </ActionForm>
                  {!o.has_history && (
                    <ActionForm action={deleteOutcome} submit="Delete" pendingText="Deleting..." variant="secondary" confirm={`Delete ${o.label}?`} className="inline-form">
                      <input type="hidden" name="id" value={o.id} />
                    </ActionForm>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {editableOutcomes && (
          <ActionForm action={addOutcome} submit="Add outcome" variant="secondary" className="inline-form grow">
            {idField}
            <input name="label" placeholder="New outcome" aria-label="New outcome name" required />
            <input name="odds" placeholder="Odds" inputMode="decimal" aria-label="New outcome odds" className="short" required />
          </ActionForm>
        )}
      </section>

      <section className="panel">
        <details>
          <summary>Edit event details</summary>
          <ActionForm action={updateEvent} submit="Save details">
            {idField}
            <label htmlFor="question">Question</label>
            <input id="question" name="question" defaultValue={event.question} required />
            <label htmlFor="description">Description (optional)</label>
            <textarea id="description" name="description" rows={2} defaultValue={event.description ?? ""} />
            <label htmlFor="function_id">Function</label>
            <select id="function_id" name="function_id" defaultValue={event.function_id ?? ""}>
              <option value="">No function</option>
              {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {event.status === "draft" || event.status === "open" ? (
              <LockTimeField value={event.lock_at} />
            ) : <input type="hidden" name="lock_at" value={event.lock_at ?? ""} />}
            <label htmlFor="sort_order">Order within the function</label>
            <input id="sort_order" name="sort_order" type="number" defaultValue={event.sort_order} />
          </ActionForm>
        </details>
      </section>

      {event.status === "locked" && (
        <section className="panel">
          <h2>Reopen betting</h2>
          <p>Use this if the event locked too early.</p>
          <ActionForm action={reopenEvent} submit="Reopen" pendingText="Reopening..." variant="secondary">
            {idField}
            <LockTimeField label="New lock time (optional)" />
          </ActionForm>
        </section>
      )}

      {event.status !== "draft" && event.status !== "voided" && (
        <section className="panel">
          <h2>Void this event</h2>
          <p>Use this if the event doesn&apos;t happen. Every stake is returned{event.status === "settled" ? ", and payouts are taken back" : ""}. This can&apos;t be undone.</p>
          <ActionForm action={voidEvent} submit="Void event" pendingText="Voiding..." variant="danger" confirm="Void this event and return every stake?">
            {idField}
            <label htmlFor="reason">Reason</label>
            <input id="reason" name="reason" required />
          </ActionForm>
        </section>
      )}

      <section className="panel">
        <h2>Bets ({bets.length})</h2>
        {bets.length === 0 ? <p>No bets yet.</p> : <BetTable bets={bets} hideEvent />}
      </section>
      <AutoRefresh />
    </>
  );
}
