import Link from "next/link";
import type { AdminBet } from "@/lib/admin/queries";
import { money, multiplier, payoutFor } from "@/lib/game/format";
import { LocalTime } from "./time";

const STATUS = { open: "Open", won: "Won", lost: "Lost", voided: "Voided", cancelled: "Cancelled" };

export function BetTable({ bets, hideEvent }: { bets: AdminBet[]; hideEvent?: boolean }) {
  return (
    <ul className="rows bets-table">
      {bets.map((b) => (
        <li key={b.id} className="bet-entry">
          <div>
            <Link href={`/admin/guests/${b.guest_id}`}><strong>{b.guest_name}</strong></Link>
            {!hideEvent && <Link href={`/admin/events/${b.event_id}`} className="bet-question">{b.question}</Link>}
            <p>{b.outcome_label}: {money(b.stake)} at {multiplier(b.locked_odds)}, pays {money(payoutFor(b.stake, b.locked_odds))}</p>
            <small><LocalTime iso={b.placed_at} /></small>
          </div>
          <span className="pill" data-status={b.status}>{STATUS[b.status]}</span>
        </li>
      ))}
    </ul>
  );
}
