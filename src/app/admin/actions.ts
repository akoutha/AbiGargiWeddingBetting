"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nameKey, MAX_GUEST_NAME } from "@/lib/admin/parse-guests";
import { existingGuestNames } from "@/lib/admin/queries";
import { endAdminSession, requireAdmin, startAdminSession, type Admin } from "@/lib/auth/admin-session";
import { hashSecret, verifySecret } from "@/lib/auth/secret";
import { sha256 } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { GAME_ERRORS, gameErrorMessage } from "@/lib/game/errors";

export type AdminState = { error?: string; ok?: string };

class InputError extends Error {}

function describe(err: unknown) {
  if (err instanceof InputError) return err.message;
  const { code, message } = err as { code?: string; message?: string };
  if (code === "23505") return "That name is already in use.";
  if (code === "23514") return "Check that entry. It can't be blank or below the minimum.";
  if (!message || !(message in GAME_ERRORS)) console.error(err);
  return gameErrorMessage(message ?? "");
}

/** Every admin action checks the session first, because actions are public endpoints. */
async function run(ok: string, work: (admin: Admin) => Promise<unknown>): Promise<AdminState> {
  const admin = await requireAdmin();
  try {
    await work(admin);
    revalidatePath("/", "layout");
    return { ok };
  } catch (err) {
    return { error: describe(err) };
  }
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name) || null;
const required = (form: FormData, name: string, label: string) => {
  const value = text(form, name);
  if (!value) throw new InputError(`Enter ${label}.`);
  return value;
};

function odds(value: string) {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value) || Number(value) <= 1) {
    throw new InputError("Odds must be above 1x, with up to two decimal places.");
  }
  return value;
}

function lockTime(form: FormData) {
  const value = text(form, "lock_at");
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InputError("Enter a valid lock time.");
  return date.toISOString();
}

const order = (form: FormData, name = "sort_order") => Number.parseInt(text(form, name), 10) || 0;

function password(form: FormData) {
  const value = String(form.get("password") ?? "");
  if (value.length < 10) throw new InputError("Use at least 10 characters.");
  return value;
}

function email(form: FormData) {
  const value = text(form, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value)) throw new InputError("Enter a valid email.");
  return value;
}

export async function signIn(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const [row] = await query<{ login: { id: string; password_hash: string } | null }>(
      "select admin_begin_login($1) as login", [text(form, "email")],
    );
    const pass = String(form.get("password") ?? "");
    if (!row.login || !(await verifySecret(pass, row.login.password_hash))) {
      return { error: "That email or password isn't right." };
    }
    await query("select admin_login_succeeded($1)", [row.login.id]);
    await startAdminSession(row.login.id);
  } catch (err) {
    return { error: describe(err) };
  }
  redirect("/admin");
}

export async function setupOwner(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const code = process.env.ADMIN_SETUP_CODE;
    if (!code) return { error: "Add ADMIN_SETUP_CODE to the site's settings first." };
    const matches = timingSafeEqual(
      Buffer.from(sha256(text(form, "setup_code"))), Buffer.from(sha256(code.trim())),
    );
    if (!matches) return { error: "That setup code doesn't match." };
    const [row] = await query<{ user_id: string }>(
      "select user_id from admin_create_owner($1, $2, $3)",
      [email(form), required(form, "name", "your name"), await hashSecret(password(form))],
    );
    await startAdminSession(row.user_id);
  } catch (err) {
    return { error: describe(err) };
  }
  redirect("/admin");
}

export async function signOut() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function createEvent(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  let id: string;
  try {
    const labels = form.getAll("label").map((v) => String(v).trim());
    const prices = form.getAll("odds").map((v) => String(v).trim());
    const outcomes = labels
      .map((label, i) => ({ label, odds: prices[i] }))
      .filter((o) => o.label || o.odds)
      .map((o) => {
        if (!o.label) throw new InputError("Every outcome needs a name.");
        return { label: o.label, odds: odds(o.odds) };
      });
    if (outcomes.length < 2) throw new InputError("Add at least two outcomes.");
    const [row] = await query<{ id: string }>(
      "select id from admin_create_event($1, $2, $3, $4, $5, $6)",
      [admin.id, optional(form, "function_id"), required(form, "question", "a question"),
        optional(form, "description"), lockTime(form), JSON.stringify(outcomes)],
    );
    id = row.id;
  } catch (err) {
    return { error: describe(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/events/${id}`);
}

export async function updateEvent(_: AdminState, form: FormData) {
  return run("Saved", (a) => query(
    "select admin_update_event($1, $2, $3, $4, $5, $6, $7)",
    [a.id, text(form, "id"), optional(form, "function_id"), required(form, "question", "a question"),
      optional(form, "description"), lockTime(form), order(form)],
  ));
}

const eventAction = (fn: string, ok: string) => (form: FormData) =>
  run(ok, (a) => query(`select ${fn}($1, $2)`, [a.id, text(form, "id")]));

export async function publishEvent(_: AdminState, form: FormData) {
  return eventAction("admin_publish_event", "Published. Guests can bet now.")(form);
}
export async function lockEvent(_: AdminState, form: FormData) {
  return eventAction("admin_lock_event", "Locked. Betting is closed.")(form);
}
export async function reopenEvent(_: AdminState, form: FormData) {
  return run("Reopened", (a) => query("select admin_reopen_event($1, $2, $3)", [a.id, text(form, "id"), lockTime(form)]));
}
export async function voidEvent(_: AdminState, form: FormData) {
  return run("Voided. All stakes were returned.", (a) => query(
    "select admin_void_event($1, $2, $3)",
    [a.id, text(form, "id"), required(form, "reason", "a reason")],
  ));
}

export async function deleteEvent(_: AdminState, form: FormData): Promise<AdminState> {
  const result = await eventAction("admin_delete_event", "Deleted")(form);
  if (result.error) return result;
  redirect("/admin/events");
}

export async function duplicateEvent(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  let id: string;
  try {
    const [row] = await query<{ id: string }>(
      "select id from admin_duplicate_event($1, $2)", [admin.id, text(form, "id")],
    );
    id = row.id;
  } catch (err) {
    return { error: describe(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/events/${id}`);
}

export async function setOdds(_: AdminState, form: FormData) {
  return run("Odds saved", (a) => query("select admin_set_odds($1, $2, $3)", [a.id, text(form, "id"), odds(text(form, "odds"))]));
}
export async function addOutcome(_: AdminState, form: FormData) {
  return run("Outcome added", (a) => query(
    "select admin_add_outcome($1, $2, $3, $4)",
    [a.id, text(form, "id"), required(form, "label", "a name"), odds(text(form, "odds"))],
  ));
}
export async function renameOutcome(_: AdminState, form: FormData) {
  return run("Saved", (a) => query("select admin_rename_outcome($1, $2, $3)", [a.id, text(form, "id"), required(form, "label", "a name")]));
}
export async function deleteOutcome(_: AdminState, form: FormData) {
  return run("Deleted", (a) => query("select admin_delete_outcome($1, $2)", [a.id, text(form, "id")]));
}

export async function settlementPreview(eventId: string, outcomeId: string) {
  await requireAdmin();
  const [row] = await query<{ preview: { winners: number; losers: number; total_payout: number } }>(
    "select admin_settlement_preview($1, $2) as preview", [eventId, outcomeId],
  );
  return row.preview;
}

export async function settleEvent(eventId: string, outcomeId: string, correcting: boolean) {
  const fn = correcting ? "admin_correct_event" : "admin_settle_event";
  return run(correcting ? "Result corrected" : "Settled. Payouts are complete.", (a) =>
    query(`select ${fn}($1, $2, $3)`, [a.id, eventId, outcomeId]));
}

export async function addFunction(_: AdminState, form: FormData) {
  return run("Function added", (a) => query("select admin_add_function($1, $2, $3)", [a.id, required(form, "name", "a name"), order(form)]));
}
export async function updateFunction(_: AdminState, form: FormData) {
  return run("Saved", (a) => query("select admin_update_function($1, $2, $3, $4)", [a.id, text(form, "id"), required(form, "name", "a name"), order(form)]));
}
export async function deleteFunction(_: AdminState, form: FormData) {
  return run("Deleted", (a) => query("select admin_delete_function($1, $2)", [a.id, text(form, "id")]));
}

export async function addGuest(_: AdminState, form: FormData) {
  return run("Guest added", (a) => query("select admin_add_guest($1, $2)", [a.id, required(form, "name", "a name")]));
}
export async function renameGuest(_: AdminState, form: FormData) {
  return run("Saved", (a) => query("select admin_rename_guest($1, $2, $3)", [a.id, text(form, "id"), required(form, "name", "a name")]));
}
export async function resetPin(_: AdminState, form: FormData) {
  return run("PIN reset. They'll create a new one when they next sign in.", (a) =>
    query("select admin_reset_pin($1, $2)", [a.id, text(form, "id")]));
}
export async function setGuestActive(_: AdminState, form: FormData) {
  const active = text(form, "active") === "true";
  return run(active ? "Guest reactivated" : "Guest deactivated", (a) =>
    query("select admin_set_guest_active($1, $2, $3)", [a.id, text(form, "id"), active]));
}
export async function adjustBalance(_: AdminState, form: FormData) {
  return run("Balance adjusted", (a) => {
    const amount = Number(text(form, "amount"));
    if (!Number.isInteger(amount) || amount === 0) throw new InputError("Enter a whole dollar amount, such as 100 or -50.");
    return query("select admin_adjust_balance($1, $2, $3, $4, $5)",
      [a.id, text(form, "id"), amount, required(form, "reason", "a reason"), form.get("scored") === "on"]);
  });
}

export type ImportPreview = {
  ready: string[];
  duplicates: string[];
  existing: string[];
  tooLong: string[];
};

export async function previewImport(names: string[]): Promise<ImportPreview> {
  await requireAdmin();
  const known = new Set((await existingGuestNames()).map((g) => nameKey(g.display_name)));
  const seen = new Set<string>();
  const result: ImportPreview = { ready: [], duplicates: [], existing: [], tooLong: [] };
  for (const name of names) {
    const key = nameKey(name);
    if (name.length > MAX_GUEST_NAME) result.tooLong.push(name);
    else if (known.has(key)) result.existing.push(name);
    else if (seen.has(key)) result.duplicates.push(name);
    else { seen.add(key); result.ready.push(name); }
  }
  return result;
}

export async function importGuests(names: string[]) {
  return run(`Imported ${names.length} guests`, (a) => {
    if (names.length === 0 || names.length > 2000) throw new InputError("Add between 1 and 2,000 names.");
    return query("select admin_import_guests($1, $2)", [a.id, JSON.stringify(names)]);
  });
}

export async function setPaused(_: AdminState, form: FormData) {
  const paused = text(form, "paused") === "true";
  return run(paused ? "Betting paused" : "Betting resumed", (a) => query("select admin_set_betting_paused($1, $2)", [a.id, paused]));
}
export async function endGame() {
  return run("Game ended. The leaderboard is final.", (a) => query("select admin_end_game($1)", [a.id]));
}
export async function reopenGame() {
  return run("Game reopened", (a) => query("select admin_reopen_game($1)", [a.id]));
}
export async function resetGame(_: AdminState, form: FormData) {
  return run("Everything was cleared. The game is ready for real data.", (a) =>
    query("select admin_reset_game($1, $2)", [a.id, text(form, "confirm")]));
}

export async function addAdmin(_: AdminState, form: FormData) {
  return run("Admin added", async (a) => query(
    "select admin_add_admin($1, $2, $3, $4)",
    [a.id, email(form), required(form, "name", "a name"), await hashSecret(password(form))],
  ));
}
export async function setAdminActive(_: AdminState, form: FormData) {
  return run("Saved", (a) => query("select admin_set_admin_active($1, $2, $3)", [a.id, text(form, "id"), text(form, "active") === "true"]));
}
export async function setAdminPassword(_: AdminState, form: FormData) {
  return run("Password changed", async (a) => query(
    "select admin_set_password($1, $2, $3)", [a.id, text(form, "id"), await hashSecret(password(form))],
  ));
}
