-- Admin accounts, sessions, and the editing tools behind the admin panel.
-- Admins sign in with an email and password stored here, so the site needs
-- only its database connection.

alter table admins drop constraint admins_user_id_fkey;
alter table admins alter column user_id set default gen_random_uuid();
alter table admins
  add column email text,
  add column password_hash text,
  add column failed_logins integer not null default 0,
  add column login_locked_until timestamptz;
create unique index admins_email_key on admins (lower(email));

create table admin_sessions (
  token_hash text primary key,
  admin_id uuid not null references admins (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index admin_sessions_admin_idx on admin_sessions (admin_id);
alter table admin_sessions enable row level security;

create function assert_owner(p_actor uuid) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from admins where user_id = p_actor and is_active and is_owner) then
    raise exception 'NOT_OWNER';
  end if;
end $$;

-- Creates the first account. Refused once any admin exists.
create function admin_create_owner(p_email text, p_name text, p_hash text) returns admins
language plpgsql set search_path = public as $$
declare v_admin admins;
begin
  lock table admins in exclusive mode;
  if exists (select 1 from admins) then raise exception 'SETUP_ALREADY_DONE'; end if;
  insert into admins (email, display_name, password_hash, is_owner)
  values (lower(trim(p_email)), p_name, p_hash, true)
  returning * into v_admin;
  return v_admin;
end $$;

-- Reserves the attempt before the password is checked. Unknown emails return
-- null, and the caller shows the same message either way.
create function admin_begin_login(p_email text) returns jsonb
language plpgsql set search_path = public as $$
declare v_admin admins;
begin
  select * into v_admin from admins
  where lower(email) = lower(trim(p_email)) and is_active for no key update;
  if not found then return null; end if;
  if v_admin.login_locked_until > clock_timestamp() then raise exception 'LOGIN_LOCKED'; end if;

  update admins set
    failed_logins = case when failed_logins + 1 >= 5 then 0 else failed_logins + 1 end,
    login_locked_until = case when failed_logins + 1 >= 5
      then clock_timestamp() + interval '15 minutes' end
  where user_id = v_admin.user_id;
  return jsonb_build_object('id', v_admin.user_id, 'password_hash', v_admin.password_hash);
end $$;

create function admin_login_succeeded(p_admin uuid) returns void
language sql set search_path = public as $$
  update admins set failed_logins = 0, login_locked_until = null where user_id = p_admin;
$$;

create function admin_add_admin(p_actor uuid, p_email text, p_name text, p_hash text) returns admins
language plpgsql set search_path = public as $$
declare v_admin admins;
begin
  perform assert_owner(p_actor);
  insert into admins (email, display_name, password_hash)
  values (lower(trim(p_email)), p_name, p_hash)
  returning * into v_admin;
  perform log_admin_action(p_actor, 'admin.add', v_admin.user_id, jsonb_build_object('email', v_admin.email));
  return v_admin;
end $$;

create function admin_set_admin_active(p_actor uuid, p_admin uuid, p_active boolean) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_owner(p_actor);
  if p_actor = p_admin then raise exception 'CANNOT_CHANGE_SELF'; end if;
  update admins set is_active = p_active where user_id = p_admin;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  if not p_active then delete from admin_sessions where admin_id = p_admin; end if;
  perform log_admin_action(p_actor, 'admin.set_active', p_admin, jsonb_build_object('active', p_active));
end $$;

-- Signs the admin out everywhere, including a device someone else may hold.
create function admin_set_password(p_actor uuid, p_admin uuid, p_hash text) returns void
language plpgsql set search_path = public as $$
begin
  if p_actor <> p_admin then perform assert_owner(p_actor); end if;
  perform assert_admin(p_actor);
  update admins set password_hash = p_hash, failed_logins = 0, login_locked_until = null
  where user_id = p_admin;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;
  delete from admin_sessions where admin_id = p_admin;
  perform log_admin_action(p_actor, 'admin.set_password', p_admin);
end $$;

create function admin_update_event(
  p_actor uuid, p_event uuid, p_function uuid, p_question text, p_description text,
  p_lock_at timestamptz, p_sort_order integer
) returns events
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);

  if p_lock_at is distinct from v_event.lock_at then
    if v_event.status not in ('draft', 'open') then raise exception 'EVENT_LOCKED'; end if;
    if p_lock_at <= clock_timestamp() then raise exception 'LOCK_TIME_PASSED'; end if;
  end if;

  update events set function_id = p_function, question = p_question, description = p_description,
    lock_at = p_lock_at, sort_order = p_sort_order
  where id = p_event returning * into v_event;
  perform log_admin_action(p_actor, 'event.update', p_event, jsonb_build_object('question', p_question));
  return v_event;
end $$;

create function admin_delete_event(p_actor uuid, p_event uuid) returns void
language plpgsql set search_path = public as $$
declare v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status <> 'draft' then raise exception 'EVENT_NOT_DRAFT'; end if;
  delete from events where id = p_event;
  perform log_admin_action(p_actor, 'event.delete', p_event,
    jsonb_build_object('question', v_event.question));
end $$;

create function admin_duplicate_event(p_actor uuid, p_event uuid) returns events
language plpgsql set search_path = public as $$
declare v_copy events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  insert into events (function_id, question, description, sort_order)
  select function_id, question || ' (copy)', description, sort_order from events where id = p_event
  returning * into v_copy;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  insert into outcomes (event_id, label, odds, sort_order)
  select v_copy.id, label, odds, sort_order from outcomes where event_id = p_event;
  perform log_admin_action(p_actor, 'event.duplicate', v_copy.id, jsonb_build_object('from', p_event));
  return v_copy;
end $$;

create function admin_add_outcome(p_actor uuid, p_event uuid, p_label text, p_odds numeric)
returns outcomes
language plpgsql set search_path = public as $$
declare
  v_event events;
  v_outcome outcomes;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  v_event := lock_event_for_admin(p_event);
  if v_event.status not in ('draft', 'open') or event_is_past_lock(v_event) then
    raise exception 'EVENT_LOCKED';
  end if;
  insert into outcomes (event_id, label, odds, sort_order)
  select p_event, p_label, p_odds, coalesce(max(sort_order), 0) + 1
  from outcomes where event_id = p_event
  returning * into v_outcome;
  perform log_admin_action(p_actor, 'outcome.add', v_outcome.id, jsonb_build_object('label', p_label));
  return v_outcome;
end $$;

-- A label can't change under guests who already bet on it.
create function admin_rename_outcome(p_actor uuid, p_outcome uuid, p_label text) returns outcomes
language plpgsql set search_path = public as $$
declare
  v_outcome outcomes;
  v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  select * into v_outcome from outcomes where id = p_outcome;
  if not found then raise exception 'OUTCOME_NOT_FOUND'; end if;
  v_event := lock_event_for_admin(v_outcome.event_id);
  if exists (select 1 from bets where outcome_id = p_outcome) then
    raise exception 'OUTCOME_HAS_BETS';
  end if;
  update outcomes set label = p_label where id = p_outcome returning * into v_outcome;
  perform log_admin_action(p_actor, 'outcome.rename', p_outcome, jsonb_build_object('label', p_label));
  return v_outcome;
end $$;

create function admin_delete_outcome(p_actor uuid, p_outcome uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_outcome outcomes;
  v_event events;
begin
  perform assert_admin(p_actor);
  perform assert_game_running();
  select * into v_outcome from outcomes where id = p_outcome;
  if not found then raise exception 'OUTCOME_NOT_FOUND'; end if;
  v_event := lock_event_for_admin(v_outcome.event_id);
  if exists (select 1 from bets where outcome_id = p_outcome) then
    raise exception 'OUTCOME_HAS_BETS';
  end if;
  if v_event.status <> 'draft'
    and (select count(*) from outcomes where event_id = v_outcome.event_id) <= 2 then
    raise exception 'NEEDS_TWO_OUTCOMES';
  end if;
  delete from outcomes where id = p_outcome;
  perform log_admin_action(p_actor, 'outcome.delete', p_outcome,
    jsonb_build_object('label', v_outcome.label));
end $$;

create function admin_add_function(p_actor uuid, p_name text, p_sort_order integer) returns functions
language plpgsql set search_path = public as $$
declare v_function functions;
begin
  perform assert_admin(p_actor);
  insert into functions (name, sort_order) values (p_name, p_sort_order) returning * into v_function;
  perform log_admin_action(p_actor, 'function.add', v_function.id, jsonb_build_object('name', p_name));
  return v_function;
end $$;

create function admin_update_function(p_actor uuid, p_function uuid, p_name text, p_sort_order integer)
returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  update functions set name = p_name, sort_order = p_sort_order where id = p_function;
  if not found then raise exception 'FUNCTION_NOT_FOUND'; end if;
  perform log_admin_action(p_actor, 'function.update', p_function, jsonb_build_object('name', p_name));
end $$;

-- Its events stay and become ungrouped.
create function admin_delete_function(p_actor uuid, p_function uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  delete from functions where id = p_function;
  if not found then raise exception 'FUNCTION_NOT_FOUND'; end if;
  perform log_admin_action(p_actor, 'function.delete', p_function);
end $$;

create function admin_add_guest(p_actor uuid, p_name text) returns guests
language plpgsql set search_path = public as $$
declare v_guest guests;
begin
  perform assert_admin(p_actor);
  insert into guests (display_name) values (trim(p_name)) returning * into v_guest;
  perform log_admin_action(p_actor, 'guest.add', v_guest.id, jsonb_build_object('name', v_guest.display_name));
  return v_guest;
end $$;

-- All names go in together, or none do.
create function admin_import_guests(p_actor uuid, p_names jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_count integer;
begin
  perform assert_admin(p_actor);
  insert into guests (display_name)
  select trim(value) from jsonb_array_elements_text(p_names);
  get diagnostics v_count = row_count;
  perform log_admin_action(p_actor, 'guest.import', null, jsonb_build_object('count', v_count));
  return v_count;
end $$;

create function admin_rename_guest(p_actor uuid, p_guest uuid, p_name text) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_admin(p_actor);
  update guests set display_name = trim(p_name) where id = p_guest;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  perform log_admin_action(p_actor, 'guest.rename', p_guest, jsonb_build_object('name', p_name));
end $$;

-- Clears every guest, event, bet, and log entry before the real game. Admin
-- accounts stay. Truncate bypasses the append-only triggers on purpose, so
-- this is limited to the owner and needs the word RESET.
create function admin_reset_game(p_actor uuid, p_confirm text) returns void
language plpgsql set search_path = public as $$
begin
  perform assert_owner(p_actor);
  if p_confirm is distinct from 'RESET' then raise exception 'RESET_NOT_CONFIRMED'; end if;
  truncate guest_sessions, ledger_entries, bets, outcomes, events, functions, guests, admin_actions;
  update game_settings set betting_paused = false, ended_at = null;
  perform log_admin_action(p_actor, 'game.reset', null);
end $$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
