import "server-only";
import { query } from "@/lib/db";

const iso = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export type AdminEvent = {
  id: string;
  question: string;
  description: string | null;
  status: "draft" | "open" | "locked" | "settled" | "voided";
  lock_at: string | null;
  function_id: string | null;
  function_name: string | null;
  sort_order: number;
  winning_outcome_id: string | null;
  bet_count: number;
  total_staked: number;
};

const EVENT_SQL = `
  select e.id, e.question, e.description, e.current_status as status, ${iso("e.lock_at")} as lock_at,
    e.function_id, f.name as function_name, e.sort_order, e.winning_outcome_id,
    (select count(*)::int from bets b where b.event_id = e.id and b.status <> 'cancelled') as bet_count,
    (select coalesce(sum(b.stake), 0)::int from bets b where b.event_id = e.id and b.status in ('open', 'won', 'lost')) as total_staked
  from events_current e left join functions f on f.id = e.function_id`;

export const adminEvents = () =>
  query<AdminEvent>(`${EVENT_SQL} order by f.sort_order nulls last, e.sort_order, e.created_at`);

export async function adminEvent(id: string) {
  if (!isUuid(id)) return null;
  const [event] = await query<AdminEvent>(`${EVENT_SQL} where e.id = $1`, [id]);
  return event ?? null;
}

export type AdminOutcome = {
  id: string;
  label: string;
  odds: string;
  bet_count: number;
  total_staked: number;
  potential_payout: number;
  has_history: boolean;
};

export const eventOutcomes = (eventId: string) =>
  query<AdminOutcome>(
    `select o.id, o.label, o.odds::text, t.bet_count, t.total_staked, t.potential_payout,
       exists (select 1 from bets b where b.outcome_id = o.id) as has_history
     from outcomes o join outcome_totals t on t.outcome_id = o.id
     where o.event_id = $1 order by o.sort_order`,
    [eventId],
  );

export type AdminFunction = { id: string; name: string; sort_order: number };
export const adminFunctions = () =>
  query<AdminFunction>("select id, name, sort_order from functions order by sort_order, name");

export type AdminBet = {
  id: string;
  guest_id: string;
  guest_name: string;
  event_id: string;
  question: string;
  outcome_label: string;
  stake: number;
  locked_odds: string;
  status: "open" | "won" | "lost" | "voided" | "cancelled";
  payout: number | null;
  placed_at: string;
};

export function adminBets(filter: { event?: string; guest?: string; status?: string }) {
  return query<AdminBet>(
    `select b.id, b.guest_id, g.display_name as guest_name, b.event_id, e.question,
       o.label as outcome_label, b.stake, b.locked_odds::text, b.status, b.payout,
       ${iso("b.placed_at")} as placed_at
     from bets b
     join guests g on g.id = b.guest_id
     join events e on e.id = b.event_id
     join outcomes o on o.id = b.outcome_id
     where ($1::uuid is null or b.event_id = $1)
       and ($2::uuid is null or b.guest_id = $2)
       and (case when $3::text is null then b.status <> 'cancelled' else b.status::text = $3 end)
     order by b.placed_at desc limit 500`,
    [
      filter.event && isUuid(filter.event) ? filter.event : null,
      filter.guest && isUuid(filter.guest) ? filter.guest : null,
      filter.status || null,
    ],
  );
}

export async function dashboardStats() {
  const [row] = await query<{
    guests: number; joined: number; bets: number; wagered: number; paused: boolean; ended: boolean;
  }>(`select
    (select count(*)::int from guests where is_active) as guests,
    (select count(*)::int from guests where is_active and joined_at is not null) as joined,
    (select count(*)::int from bets where status in ('open', 'won', 'lost')) as bets,
    (select coalesce(sum(stake), 0)::int from bets where status in ('open', 'won', 'lost')) as wagered,
    (select betting_paused from game_settings) as paused,
    (select ended_at is not null from game_settings) as ended`);
  return row;
}

export type AdminGuest = {
  id: string;
  display_name: string;
  is_active: boolean;
  joined: boolean;
  available_balance: number;
  total_balance: number;
  earnings: number;
  bet_count: number;
};

const GUEST_SQL = `
  select g.id, g.display_name, g.is_active, g.joined_at is not null and g.pin_hash is not null as joined,
    b.available_balance, b.total_balance, b.earnings,
    (select count(*)::int from bets x where x.guest_id = g.id and x.status <> 'cancelled') as bet_count
  from guests g join guest_balances b on b.guest_id = g.id`;

export const adminGuests = (search: string) =>
  query<AdminGuest>(
    `${GUEST_SQL} where $1 = '' or strpos(lower(g.display_name), lower($1)) > 0
     order by lower(g.display_name)`,
    [search],
  );

export async function adminGuest(id: string) {
  if (!isUuid(id)) return null;
  const [guest] = await query<AdminGuest>(`${GUEST_SQL} where g.id = $1`, [id]);
  return guest ?? null;
}

export const guestLedger = (guestId: string) =>
  query<{ id: string; type: string; amount: number; note: string | null; question: string | null; created_at: string }>(
    `select l.id::text, l.type, l.amount, l.note, e.question, ${iso("l.created_at")} as created_at
     from ledger_entries l left join events e on e.id = l.event_id
     where l.guest_id = $1 order by l.id desc`,
    [guestId],
  );

export const existingGuestNames = () =>
  query<{ display_name: string }>("select display_name from guests");

export const activityLog = () =>
  query<{ id: string; admin_name: string | null; action: string; details: Record<string, unknown>; created_at: string }>(
    `select l.id::text, a.display_name as admin_name, l.action, l.details, ${iso("l.created_at")} as created_at
     from admin_actions l left join admins a on a.user_id = l.actor_id
     order by l.id desc limit 100`,
  );

export const adminAccounts = () =>
  query<{ user_id: string; display_name: string; email: string; is_owner: boolean; is_active: boolean }>(
    "select user_id, display_name, email, is_owner, is_active from admins order by is_owner desc, created_at",
  );

export async function hasAnyAdmin() {
  const [row] = await query<{ any: boolean }>("select exists (select 1 from admins) as any");
  return row.any;
}
