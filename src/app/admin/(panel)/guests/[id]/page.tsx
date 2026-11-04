import Link from "next/link";
import { notFound } from "next/navigation";
import { adjustBalance, renameGuest, resetPin, setGuestActive } from "@/app/admin/actions";
import { adminBets, adminGuest, guestLedger } from "@/lib/admin/queries";
import { money, signedMoney } from "@/lib/game/format";
import { ActionForm } from "@/components/admin/action-form";
import { BetTable } from "@/components/admin/bet-table";
import { LocalTime } from "@/components/admin/time";

const LEDGER = {
  starting_grant: "Starting balance",
  bet_stake: "Bet placed",
  bet_refund: "Stake returned",
  payout: "Payout",
  payout_reversal: "Payout reversed",
  adjustment_unscored: "Admin adjustment",
  adjustment_scored: "Scored adjustment",
} as Record<string, string>;

export default async function AdminGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guest = await adminGuest(id);
  if (!guest) notFound();
  const [bets, ledger] = await Promise.all([adminBets({ guest: id }), guestLedger(id)]);
  const idField = <input type="hidden" name="id" value={id} />;

  return (
    <>
      <Link className="back" href="/admin/guests">All guests</Link>
      <h1 className="page-title">{guest.display_name}</h1>
      <dl className="stats">
        <div><dt>Available</dt><dd>{money(guest.available_balance)}</dd></div>
        <div><dt>Total</dt><dd>{money(guest.total_balance)}</dd></div>
        <div><dt>Earnings</dt><dd>{signedMoney(guest.earnings)}</dd></div>
      </dl>
      <section className="panel">
        <h2>Bets ({bets.length})</h2>
        {bets.length === 0 ? <p>No bets yet.</p> : <BetTable bets={bets} />}
      </section>
      <section className="panel">
        <h2>Adjust balance</h2>
        <p>Adjustments don&apos;t count as earnings unless you score them as a prize or penalty.</p>
        <ActionForm action={adjustBalance} submit="Adjust balance">
          {idField}
          <label htmlFor="amount">Amount (use a minus sign to subtract)</label>
          <input id="amount" name="amount" inputMode="text" required />
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" required />
          <label className="check"><input type="checkbox" name="scored" /> Count toward earnings</label>
        </ActionForm>
      </section>
      <section className="panel">
        <h2>Guest settings</h2>
        <ActionForm action={renameGuest} submit="Save name" variant="secondary" className="inline-form grow">
          {idField}
          <input name="name" defaultValue={guest.display_name} aria-label="Display name" required />
        </ActionForm>
        <div className="actions spaced">
          <ActionForm action={resetPin} submit="Reset PIN" pendingText="Resetting..." variant="secondary" confirm="Reset this guest's PIN and sign them out?" className="inline-form">{idField}</ActionForm>
          <ActionForm action={setGuestActive} submit={guest.is_active ? "Deactivate" : "Reactivate"} pendingText="Saving..." variant="secondary"
            confirm={guest.is_active ? "Deactivate this guest? They'll be signed out and leave the leaderboard." : undefined} className="inline-form">
            {idField}
            <input type="hidden" name="active" value={String(!guest.is_active)} />
          </ActionForm>
        </div>
      </section>
      <section className="panel">
        <h2>Balance history</h2>
        <ul className="rows">
          {ledger.map((l) => (
            <li className="row-item" key={l.id}>
              <div>
                <strong>{LEDGER[l.type] ?? l.type}</strong>
                <small>{l.question ?? l.note} <LocalTime iso={l.created_at} /></small>
              </div>
              <span>{signedMoney(l.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
