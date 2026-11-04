-- All money movement happens here, inside single transactions.
--
-- Lock order is guest, then event. Guests are locked FOR NO KEY UPDATE, and
-- events FOR NO KEY UPDATE (admin) or FOR SHARE (bets). Those modes do not
-- conflict with the key-share locks taken by foreign keys, so settling an
-- event cannot deadlock with a bet in progress.
--
-- Time checks use clock_timestamp(), not now(), because now() is frozen at
-- the start of a transaction that may have waited on a lock.

create function assert_game_running() returns void
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from game_settings where ended_at is not null) then
    raise exception 'GAME_ENDED';
  end if;
end $$;

create function assert_admin(p_actor uuid) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from admins where user_id = p_actor and is_active) then
    raise exception 'NOT_ADMIN';
  end if;
end $$;

create function log_admin_action(p_actor uuid, p_action text, p_target uuid, p_details jsonb default '{}')
returns void language sql set search_path = public as $$
  insert into admin_actions (actor_id, action, target_id, details)
  values (p_actor, p_action, p_target, p_details);
$$;

create function lock_event_for_admin(p_event uuid) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  select * into v_event from events where id = p_event for no key update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  return v_event;
end $$;

create function event_is_past_lock(p_event events) returns boolean
language sql stable set search_path = public as $$
  select p_event.status = 'locked'
    or (p_event.status = 'open' and coalesce(p_event.lock_at <= clock_timestamp(), false));
$$;

-- Shared by placing and changing a bet. Runs with the guest row locked and
-- any bet being replaced already refunded.
create function insert_bet(
  p_guest uuid, p_outcome uuid, p_stake integer, p_expected_odds numeric, p_key uuid
) returns bets
language plpgsql set search_path = public as $$
declare
  v_settings game_settings;
  v_outcome outcomes;
  v_event events;
  v_available integer;
  v_bet bets;
begin
  select * into v_settings from game_settings for share;
  if v_settings.ended_at is not null then raise exception 'GAME_ENDED'; end if;
  if v_settings.betting_paused then raise exception 'BETTING_PAUSED'; end if;

  select * into v_outcome from outcomes where id = p_outcome;
  if not found then raise exception 'OUTCOME_NOT_FOUND'; end if;

  -- Waits for any lock, settlement, or odds change on this event to finish.
  select * into v_event from events where id = v_outcome.event_id for share;
  if v_event.status <> 'open' or event_is_past_lock(v_event) then
    raise exception 'EVENT_LOCKED';
  end if;

  select odds into v_outcome.odds from outcomes where id = p_outcome;
  if v_outcome.odds <> p_expected_odds then raise exception 'ODDS_CHANGED'; end if;

  if p_stake < v_settings.min_bet then raise exception 'STAKE_TOO_LOW'; end if;

  select coalesce(sum(amount), 0) into v_available
  from ledger_entries where guest_id = p_guest;
  if p_stake > v_available then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into bets (guest_id, event_id, outcome_id, stake, locked_odds, idempotency_key)
  values (p_guest, v_event.id, v_outcome.id, p_stake, v_outcome.odds, p_key)
  returning * into v_bet;

  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  values (p_guest, 'bet_stake', -p_stake, v_bet.id, v_event.id);

  return v_bet;
exception when unique_violation then
  raise exception 'ALREADY_BET';
end $$;

create function lock_active_guest(p_guest uuid) returns void
language plpgsql set search_path = public as $$
declare v_active boolean;
begin
  select is_active into v_active from guests where id = p_guest for no key update;
  if not found or not v_active then raise exception 'GUEST_INACTIVE'; end if;
end $$;

create function guest_place_bet(
  p_guest uuid, p_outcome uuid, p_stake integer, p_expected_odds numeric, p_key uuid
) returns bets
language plpgsql set search_path = public as $$
declare v_bet bets;
begin
  perform lock_active_guest(p_guest);

  -- A retry of the same submission returns the original bet.
  select * into v_bet from bets where idempotency_key = p_key and guest_id = p_guest;
  if found then return v_bet; end if;

  -- Checked here so an all-in guest hears this rather than a balance error.
  -- The unique index on bets still guards it.
  if exists (
    select 1 from bets b
    join outcomes o on o.event_id = b.event_id
    where o.id = p_outcome and b.guest_id = p_guest and b.status <> 'cancelled'
  ) then
    raise exception 'ALREADY_BET';
  end if;

  return insert_bet(p_guest, p_outcome, p_stake, p_expected_odds, p_key);
end $$;

-- A change is a cancel and a new bet in one transaction. The new bet takes
-- the current odds, which the guest must have seen.
create function guest_change_bet(
  p_guest uuid, p_bet uuid, p_outcome uuid, p_stake integer, p_expected_odds numeric, p_key uuid
) returns bets
language plpgsql set search_path = public as $$
declare
  v_old bets;
  v_new bets;
  v_event events;
  v_available integer;
begin
  perform lock_active_guest(p_guest);

  select * into v_new from bets where idempotency_key = p_key and guest_id = p_guest;
  if found then return v_new; end if;

  select * into v_old from bets where id = p_bet and guest_id = p_guest;
  if not found then raise exception 'BET_NOT_FOUND'; end if;
  if v_old.status <> 'open' then raise exception 'BET_NOT_OPEN'; end if;

  if (select event_id from outcomes where id = p_outcome) is distinct from v_old.event_id then
    raise exception 'OUTCOME_NOT_FOUND';
  end if;

  select * into v_event from events where id = v_old.event_id for share;
  if v_event.status <> 'open' or event_is_past_lock(v_event) then
    raise exception 'EVENT_LOCKED';
  end if;

  select coalesce(sum(amount), 0) into v_available
  from ledger_entries where guest_id = p_guest;
  -- Guests with a negative balance after a correction cannot bet again.
  if v_available < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update bets set status = 'cancelled', resolved_at = clock_timestamp() where id = v_old.id;
  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  values (p_guest, 'bet_refund', v_old.stake, v_old.id, v_old.event_id);

  return insert_bet(p_guest, p_outcome, p_stake, p_expected_odds, p_key);
end $$;

create function guest_cancel_bet(p_guest uuid, p_bet uuid) returns bets
language plpgsql set search_path = public as $$
declare
  v_bet bets;
  v_event events;
begin
  perform lock_active_guest(p_guest);

  select * into v_bet from bets where id = p_bet and guest_id = p_guest;
  if not found then raise exception 'BET_NOT_FOUND'; end if;
  -- A repeated cancel is harmless.
  if v_bet.status = 'cancelled' then return v_bet; end if;
  if v_bet.status <> 'open' then raise exception 'BET_NOT_OPEN'; end if;

  perform assert_game_running();
  select * into v_event from events where id = v_bet.event_id for share;
  if v_event.status <> 'open' or event_is_past_lock(v_event) then
    raise exception 'EVENT_LOCKED';
  end if;

  update bets set status = 'cancelled', resolved_at = clock_timestamp()
  where id = v_bet.id returning * into v_bet;
  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  values (p_guest, 'bet_refund', v_bet.stake, v_bet.id, v_bet.event_id);
  return v_bet;
end $$;

-- Sign-in. Reserves the attempt before the PIN is checked, so parallel guesses
-- cannot get around the lockout. A correct PIN clears the count.
create function guest_begin_pin_attempt(p_guest uuid) returns text
language plpgsql set search_path = public as $$
declare v_guest guests;
begin
  select * into v_guest from guests where id = p_guest for no key update;
  if not found or not v_guest.is_active then raise exception 'GUEST_INACTIVE'; end if;
  if v_guest.pin_hash is null then raise exception 'PIN_NOT_SET'; end if;
  if v_guest.pin_locked_until > clock_timestamp() then raise exception 'PIN_LOCKED'; end if;

  update guests set
    failed_pin_attempts = case when failed_pin_attempts + 1 >= 5 then 0 else failed_pin_attempts + 1 end,
    pin_locked_until = case when failed_pin_attempts + 1 >= 5
      then clock_timestamp() + interval '15 minutes' end
  where id = p_guest;
  return v_guest.pin_hash;
end $$;

create function guest_pin_succeeded(p_guest uuid) returns void
language sql set search_path = public as $$
  update guests set failed_pin_attempts = 0, pin_locked_until = null where id = p_guest;
$$;

-- The first person to claim a name sets its PIN. Later attempts are refused.
create function guest_claim_name(p_guest uuid, p_pin_hash text) returns void
language plpgsql set search_path = public as $$
begin
  update guests set pin_hash = p_pin_hash, joined_at = coalesce(joined_at, clock_timestamp())
  where id = p_guest and is_active and pin_hash is null;
  if not found then raise exception 'NAME_ALREADY_CLAIMED'; end if;
end $$;

create function admin_create_event(
  p_actor uuid, p_function uuid, p_question text, p_description text,
  p_lock_at timestamptz, p_outcomes jsonb
) returns events
language plpgsql set search_path = public as $$
declare
  v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  insert into events (function_id, question, description, lock_at)
  values (p_function, p_question, p_description, p_lock_at)
  returning * into v_event;

  insert into outcomes (event_id, label, odds, sort_order)
  select v_event.id, o.value ->> 'label', (o.value ->> 'odds')::numeric, o.ordinality
  from jsonb_array_elements(p_outcomes) with ordinality o;

  perform log_admin_action(p_actor, 'event.create', v_event.id,
    jsonb_build_object('question', p_question));
  return v_event;
end $$;

create function admin_publish_event(p_actor uuid, p_event uuid) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status <> 'draft' then raise exception 'EVENT_NOT_DRAFT'; end if;
  if (select count(*) from outcomes where event_id = p_event) < 2 then
    raise exception 'NEEDS_TWO_OUTCOMES';
  end if;
  if v_event.lock_at <= clock_timestamp() then raise exception 'LOCK_TIME_PASSED'; end if;

  update events set status = 'open' where id = p_event returning * into v_event;
  perform log_admin_action(p_actor, 'event.publish', p_event);
  return v_event;
end $$;

create function admin_lock_event(p_actor uuid, p_event uuid) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status <> 'open' then raise exception 'EVENT_NOT_OPEN'; end if;

  update events set status = 'locked' where id = p_event returning * into v_event;
  perform log_admin_action(p_actor, 'event.lock', p_event);
  return v_event;
end $$;

-- Reopening needs a future lock time, or none, or the event would lock again
-- immediately.
create function admin_reopen_event(p_actor uuid, p_event uuid, p_new_lock_at timestamptz)
returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if not event_is_past_lock(v_event) then raise exception 'EVENT_NOT_LOCKED'; end if;
  if p_new_lock_at <= clock_timestamp() then raise exception 'LOCK_TIME_PASSED'; end if;

  update events set status = 'open', lock_at = p_new_lock_at
  where id = p_event returning * into v_event;
  perform log_admin_action(p_actor, 'event.reopen', p_event,
    jsonb_build_object('lock_at', p_new_lock_at));
  return v_event;
end $$;

-- Existing bets keep the odds they were placed at.
create function admin_set_odds(p_actor uuid, p_outcome uuid, p_odds numeric) returns outcomes
language plpgsql set search_path = public as $$
declare
  v_outcome outcomes;
  v_old numeric;
  v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  select * into v_outcome from outcomes where id = p_outcome;
  if not found then raise exception 'OUTCOME_NOT_FOUND'; end if;

  v_event := lock_event_for_admin(v_outcome.event_id);
  if v_event.status not in ('draft', 'open') or event_is_past_lock(v_event) then
    raise exception 'EVENT_LOCKED';
  end if;

  select odds into v_old from outcomes where id = p_outcome;
  update outcomes set odds = p_odds where id = p_outcome returning * into v_outcome;
  perform log_admin_action(p_actor, 'outcome.set_odds', p_outcome,
    jsonb_build_object('from', v_old, 'to', p_odds));
  return v_outcome;
end $$;

create function pay_event(p_event uuid, p_winner uuid) returns void
language plpgsql set search_path = public as $$
begin
  update bets set
    status = case when outcome_id = p_winner then 'won' else 'lost' end::bet_status,
    payout = case when outcome_id = p_winner then round(stake * locked_odds)::integer else 0 end,
    resolved_at = clock_timestamp()
  where event_id = p_event and status = 'open';

  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  select guest_id, 'payout', payout, id, event_id
  from bets where event_id = p_event and status = 'won';

  update events set status = 'settled', winning_outcome_id = p_winner, settled_at = clock_timestamp()
  where id = p_event;
end $$;

create function reverse_payouts(p_event uuid) returns void
language plpgsql set search_path = public as $$
begin
  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  select guest_id, 'payout_reversal', -payout, id, event_id
  from bets where event_id = p_event and status = 'won';
end $$;

create function assert_outcome_in_event(p_outcome uuid, p_event uuid) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from outcomes where id = p_outcome and event_id = p_event) then
    raise exception 'OUTCOME_NOT_FOUND';
  end if;
end $$;

-- Shown to the admin before they confirm a settlement or a correction.
create function admin_settlement_preview(p_event uuid, p_winner uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  perform assert_outcome_in_event(p_winner, p_event);
  return (
    select jsonb_build_object(
      'winners', count(*) filter (where outcome_id = p_winner),
      'losers', count(*) filter (where outcome_id <> p_winner),
      'total_payout', coalesce(sum(round(stake * locked_odds))
        filter (where outcome_id = p_winner), 0)
    )
    from bets where event_id = p_event and status in ('open', 'won', 'lost')
  );
end $$;

create function admin_settle_event(p_actor uuid, p_event uuid, p_winner uuid) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status in ('settled', 'voided') then raise exception 'EVENT_ALREADY_RESOLVED'; end if;
  if not event_is_past_lock(v_event) then raise exception 'EVENT_NOT_LOCKED'; end if;
  perform assert_outcome_in_event(p_winner, p_event);

  perform pay_event(p_event, p_winner);
  perform log_admin_action(p_actor, 'event.settle', p_event,
    jsonb_build_object('winner', p_winner));
  select * into v_event from events where id = p_event;
  return v_event;
end $$;

-- A guest who already spent reversed winnings can go negative, by design.
create function admin_correct_event(p_actor uuid, p_event uuid, p_winner uuid) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status <> 'settled' then raise exception 'EVENT_NOT_SETTLED'; end if;
  perform assert_outcome_in_event(p_winner, p_event);
  if v_event.winning_outcome_id = p_winner then raise exception 'SAME_WINNER'; end if;

  perform reverse_payouts(p_event);
  update bets set status = 'open', payout = null, resolved_at = null
  where event_id = p_event and status in ('won', 'lost');
  perform pay_event(p_event, p_winner);

  perform log_admin_action(p_actor, 'event.correct', p_event,
    jsonb_build_object('from', v_event.winning_outcome_id, 'to', p_winner));
  select * into v_event from events where id = p_event;
  return v_event;
end $$;

-- Refunds every stake. Voiding a settled event also takes back its payouts.
create function admin_void_event(p_actor uuid, p_event uuid, p_reason text) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status in ('draft', 'voided') then raise exception 'EVENT_NOT_VOIDABLE'; end if;

  perform reverse_payouts(p_event);

  insert into ledger_entries (guest_id, type, amount, bet_id, event_id)
  select guest_id, 'bet_refund', stake, id, event_id
  from bets where event_id = p_event and status in ('open', 'won', 'lost');

  update bets set status = 'voided', payout = stake, resolved_at = clock_timestamp()
  where event_id = p_event and status in ('open', 'won', 'lost');

  update events set status = 'voided', winning_outcome_id = null, settled_at = clock_timestamp()
  where id = p_event returning * into v_event;
  perform log_admin_action(p_actor, 'event.void', p_event,
    jsonb_build_object('reason', p_reason));
  return v_event;
end $$;

create function admin_adjust_balance(
  p_actor uuid, p_guest uuid, p_amount integer, p_reason text, p_scored boolean default false
) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_amount = 0 then raise exception 'AMOUNT_REQUIRED'; end if;
  perform 1 from guests where id = p_guest for no key update;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;

  insert into ledger_entries (guest_id, type, amount, actor_id, note)
  values (p_guest,
    case when p_scored then 'adjustment_scored' else 'adjustment_unscored' end::ledger_type,
    p_amount, p_actor, p_reason);
  perform log_admin_action(p_actor, 'guest.adjust_balance', p_guest,
    jsonb_build_object('amount', p_amount, 'scored', p_scored, 'reason', p_reason));
end $$;

-- Clears the PIN so the guest can set a new one, and signs out their devices.
create function admin_reset_pin(p_actor uuid, p_guest uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  update guests set pin_hash = null, failed_pin_attempts = 0, pin_locked_until = null
  where id = p_guest;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  delete from guest_sessions where guest_id = p_guest;
  perform log_admin_action(p_actor, 'guest.reset_pin', p_guest);
end $$;

create function admin_set_guest_active(p_actor uuid, p_guest uuid, p_active boolean) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  update guests set is_active = p_active where id = p_guest;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  if not p_active then delete from guest_sessions where guest_id = p_guest; end if;
  perform log_admin_action(p_actor, 'guest.set_active', p_guest,
    jsonb_build_object('active', p_active));
end $$;

create function admin_set_betting_paused(p_actor uuid, p_paused boolean) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  update game_settings set betting_paused = p_paused;
  perform log_admin_action(p_actor, 'game.set_paused', null,
    jsonb_build_object('paused', p_paused));
end $$;

-- Freezes the leaderboard. Open and locked events must be resolved first.
create function admin_end_game(p_actor uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  if exists (select 1 from events where status in ('open', 'locked')) then
    raise exception 'UNRESOLVED_EVENTS';
  end if;
  update game_settings set ended_at = clock_timestamp();
  perform log_admin_action(p_actor, 'game.end', null);
end $$;

create function admin_reopen_game(p_actor uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  update game_settings set ended_at = null;
  perform log_admin_action(p_actor, 'game.reopen', null);
end $$;

-- Only the Next.js server, using the service role, can reach any of this.
alter table game_settings enable row level security;
alter table admins enable row level security;
alter table guests enable row level security;
alter table guest_sessions enable row level security;
alter table functions enable row level security;
alter table events enable row level security;
alter table outcomes enable row level security;
alter table bets enable row level security;
alter table ledger_entries enable row level security;
alter table admin_actions enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
