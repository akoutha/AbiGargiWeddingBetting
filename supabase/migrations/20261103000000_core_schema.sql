-- Wedding Betting: core schema. See PRODUCT.md.
-- Browsers never touch this database directly. Every table has row level
-- security with no policies, and only the server (service_role) has access.

create table game_settings (
  id boolean primary key default true check (id),
  starting_balance integer not null default 1000 check (starting_balance > 0),
  min_bet integer not null default 10 check (min_bet > 0),
  betting_paused boolean not null default false,
  ended_at timestamptz
);
insert into game_settings default values;

create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  is_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) > 0),
  pin_hash text,
  failed_pin_attempts integer not null default 0,
  pin_locked_until timestamptz,
  joined_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index guests_display_name_key on guests (lower(trim(display_name)));

create table guest_sessions (
  token_hash text primary key,
  guest_id uuid not null references guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index guest_sessions_guest_idx on guest_sessions (guest_id);

create table functions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0
);

create type event_status as enum ('draft', 'open', 'locked', 'settled', 'voided');

create table events (
  id uuid primary key default gen_random_uuid(),
  function_id uuid references functions (id) on delete set null,
  question text not null check (length(trim(question)) > 0),
  description text,
  status event_status not null default 'draft',
  lock_at timestamptz,
  winning_outcome_id uuid,
  sort_order integer not null default 0,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  odds numeric(8, 2) not null check (odds > 1),
  sort_order integer not null default 0,
  unique (event_id, label),
  unique (id, event_id)
);

alter table events
  add constraint events_winning_outcome_fk
  foreign key (winning_outcome_id, id) references outcomes (id, event_id);

create type bet_status as enum ('open', 'won', 'lost', 'voided', 'cancelled');

create table bets (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests (id) on delete restrict,
  event_id uuid not null references events (id) on delete restrict,
  outcome_id uuid not null,
  stake integer not null check (stake > 0),
  locked_odds numeric(8, 2) not null check (locked_odds > 1),
  status bet_status not null default 'open',
  payout integer,
  idempotency_key uuid not null unique,
  placed_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  -- Keeps a bet's outcome inside its event, and blocks deleting an outcome
  -- once anyone has bet on it.
  foreign key (outcome_id, event_id) references outcomes (id, event_id) on delete restrict
);
-- One live bet per guest per event. Cancelled bets stay for history.
create unique index bets_one_per_event on bets (guest_id, event_id)
  where status <> 'cancelled';
create index bets_event_idx on bets (event_id, status);
create index bets_guest_idx on bets (guest_id, placed_at desc);

create type ledger_type as enum (
  'starting_grant',
  'bet_stake',
  'bet_refund',
  'payout',
  'payout_reversal',
  'adjustment_unscored',
  'adjustment_scored'
);

-- Every balance change. A guest's available balance is the sum of amounts.
create table ledger_entries (
  id bigint generated always as identity primary key,
  guest_id uuid not null references guests (id) on delete restrict,
  type ledger_type not null,
  amount integer not null check (amount <> 0),
  bet_id uuid references bets (id) on delete restrict,
  event_id uuid references events (id) on delete restrict,
  actor_id uuid references admins (user_id) on delete set null,
  note text,
  created_at timestamptz not null default clock_timestamp()
);
create index ledger_guest_idx on ledger_entries (guest_id);

create table admin_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references admins (user_id) on delete set null,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);

create function reject_history_change() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'HISTORY_IS_READ_ONLY';
end $$;

create trigger ledger_is_append_only before update or delete on ledger_entries
  for each row execute function reject_history_change();
create trigger admin_actions_is_append_only before update or delete on admin_actions
  for each row execute function reject_history_change();

-- A guest receives the starting balance when added, however late they arrive.
create function grant_starting_balance() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into ledger_entries (guest_id, type, amount)
  select new.id, 'starting_grant', starting_balance from game_settings;
  return new;
end $$;

create trigger guests_starting_grant after insert on guests
  for each row execute function grant_starting_balance();

-- Earnings exclude the starting grant and unscored admin adjustments.
-- Open bets count at their stake, so placing a bet does not change rank.
create view guest_balances with (security_invoker = true) as
select
  g.id as guest_id,
  g.display_name,
  g.is_active,
  g.joined_at,
  coalesce(l.available, 0)::integer as available_balance,
  (coalesce(l.available, 0) + coalesce(b.open_stakes, 0))::integer as total_balance,
  (coalesce(l.available, 0) + coalesce(b.open_stakes, 0) - coalesce(l.unscored, 0))::integer as earnings
from guests g
left join (
  select guest_id,
    sum(amount) as available,
    sum(amount) filter (where type in ('starting_grant', 'adjustment_unscored')) as unscored
  from ledger_entries group by guest_id
) l on l.guest_id = g.id
left join (
  select guest_id, sum(stake) as open_stakes
  from bets where status = 'open' group by guest_id
) b on b.guest_id = g.id;

-- Tied guests share a rank. Guests appear once they have joined.
create view leaderboard with (security_invoker = true) as
select
  rank() over (order by earnings desc)::integer as rank,
  guest_id,
  display_name,
  earnings,
  total_balance
from guest_balances
where is_active and joined_at is not null;

-- An open event past its lock time is locked, even before anyone touches it.
create view events_current with (security_invoker = true) as
select e.*,
  case when e.status = 'open' and e.lock_at <= clock_timestamp()
    then 'locked'::event_status else e.status end as current_status
from events e;

-- Money and bet count per outcome, plus the payout if each outcome wins.
create view outcome_totals with (security_invoker = true) as
select
  o.id as outcome_id,
  o.event_id,
  o.label,
  o.odds,
  count(b.id)::integer as bet_count,
  coalesce(sum(b.stake), 0)::integer as total_staked,
  coalesce(sum(round(b.stake * b.locked_odds)), 0)::integer as potential_payout
from outcomes o
left join bets b on b.outcome_id = o.id and b.status in ('open', 'won', 'lost')
group by o.id;
