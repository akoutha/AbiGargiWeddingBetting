import "server-only";
import { cache } from "react";
import { query } from "@/lib/db";

export type Outcome = { id: string; label: string; odds: string };

export type GuestBet = {
  id: string;
  outcome_id: string;
  outcome_label: string;
  stake: number;
  locked_odds: string;
  status: "open" | "won" | "lost" | "voided";
  payout: number | null;
};

export type GameEvent = {
  id: string;
  question: string;
  description: string | null;
  status: "open" | "locked" | "settled" | "voided";
  lock_at: string | null;
  function_id: string | null;
  function_name: string | null;
  winning_outcome_id: string | null;
  outcomes: Outcome[];
  bet: GuestBet | null;
};

const EVENT_SQL = `
  select e.id, e.question, e.description, e.current_status as status,
    to_char(e.lock_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lock_at,
    e.function_id, f.name as function_name, e.winning_outcome_id,
    (select json_agg(json_build_object('id', o.id, 'label', o.label, 'odds', o.odds::text)
       order by o.sort_order)
     from outcomes o where o.event_id = e.id) as outcomes,
    (select json_build_object(
       'id', b.id, 'outcome_id', b.outcome_id, 'outcome_label', o.label, 'stake', b.stake,
       'locked_odds', b.locked_odds::text, 'status', b.status, 'payout', b.payout)
     from bets b join outcomes o on o.id = b.outcome_id
     where b.event_id = e.id and b.guest_id = $1 and b.status <> 'cancelled') as bet
  from events_current e
  left join functions f on f.id = e.function_id
  where e.status <> 'draft'`;

export const listEvents = (guestId: string) =>
  query<GameEvent>(
    `${EVENT_SQL} order by f.sort_order nulls last, e.lock_at nulls last, e.sort_order`,
    [guestId],
  );

export async function getEvent(guestId: string, eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const [event] = await query<GameEvent>(`${EVENT_SQL} and e.id = $2`, [guestId, eventId]);
  return event ?? null;
}

export type Standing = {
  rank: number;
  guest_id: string;
  display_name: string;
  earnings: number;
  total_balance: number;
};

export const leaderboard = cache(() =>
  query<Standing>("select * from leaderboard order by rank, display_name"),
);

export const guestSummary = cache(async (guestId: string) => {
  const [row] = await query<{ available_balance: number; total_balance: number; earnings: number }>(
    "select available_balance, total_balance, earnings from guest_balances where guest_id = $1",
    [guestId],
  );
  const standing = (await leaderboard()).find((s) => s.guest_id === guestId);
  return { ...row, rank: standing?.rank ?? null };
});

export const gameSettings = cache(async () => {
  const [row] = await query<{ betting_paused: boolean; ended: boolean; min_bet: number }>(
    "select betting_paused, ended_at is not null as ended, min_bet from game_settings",
  );
  return row;
});

export async function guestForJoin(guestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(guestId)) return null;
  const [row] = await query<{ id: string; display_name: string; has_pin: boolean }>(
    "select id, display_name, pin_hash is not null as has_pin from guests where id = $1 and is_active",
    [guestId],
  );
  return row ?? null;
}
