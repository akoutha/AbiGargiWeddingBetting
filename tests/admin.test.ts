import { randomUUID } from "node:crypto";
import { parseGuestNames } from "../src/lib/admin/parse-guests";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, openDb } from "./db";

let pool: Pool;
let owner: string;

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
const call = async (fn: string, ...args: unknown[]) => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await q(`select * from ${fn}(${placeholders})`, args))[0];
};
const fails = (p: Promise<unknown>, code: string) => expect(p).rejects.toThrow(code);

const draft = (question = "Who cries first?") =>
  call("admin_create_event", owner, null, question, null, null,
    JSON.stringify([{ label: "A", odds: 2 }, { label: "B", odds: 3 }]));
const outcomesOf = async (event: string) =>
  (await q("select id from outcomes where event_id = $1 order by sort_order", [event])).map((r) => r.id as string);
async function delegate(email = `${randomUUID()}@example.com`) {
  return (await call("admin_add_admin", owner, email, "Helper", "hash")).user_id as string;
}

beforeAll(async () => {
  ({ pool, admin: owner } = await openDb("admin"));
});
afterAll(async () => {
  await closeDb(pool, "admin");
});

describe("admin accounts", () => {
  it("refuses a second owner setup", async () => {
    await fails(call("admin_create_owner", "x@example.com", "X", "hash"), "SETUP_ALREADY_DONE");
  });

  it("lets only the owner manage admins and reset the game", async () => {
    const helper = await delegate();
    await fails(call("admin_add_admin", helper, "y@example.com", "Y", "hash"), "NOT_OWNER");
    await fails(call("admin_set_password", helper, owner, "hash"), "NOT_OWNER");
    await fails(call("admin_reset_game", helper, "RESET"), "NOT_OWNER");
    await call("admin_set_password", helper, helper, "new-hash");
  });

  it("removes access and sessions when deactivated", async () => {
    const helper = await delegate();
    const e = await draft();
    await q(
      "insert into admin_sessions (token_hash, admin_id, expires_at) values ($1, $2, now() + interval '1 day')",
      [randomUUID(), helper],
    );
    await call("admin_set_admin_active", owner, helper, false);
    expect(await q("select 1 from admin_sessions where admin_id = $1", [helper])).toHaveLength(0);
    await fails(call("admin_publish_event", helper, e.id), "NOT_ADMIN");
    await fails(call("admin_set_admin_active", owner, owner, false), "CANNOT_CHANGE_SELF");
  });

  it("locks sign-in after five tries, even in parallel", async () => {
    const email = `${randomUUID()}@example.com`;
    const helper = await delegate(email);
    const tries = await Promise.allSettled(
      Array.from({ length: 12 }, () => call("admin_begin_login", email.toUpperCase())),
    );
    expect(tries.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    await fails(call("admin_begin_login", email), "LOGIN_LOCKED");
    await call("admin_set_password", owner, helper, "hash-2");
    expect((await call("admin_begin_login", email)).admin_begin_login.id).toBe(helper);
  });

  it("returns nothing for an unknown email", async () => {
    expect((await call("admin_begin_login", "nobody@example.com")).admin_begin_login).toBeNull();
  });
});

describe("editing events", () => {
  it("duplicates an event into a fresh draft", async () => {
    const e = await draft();
    await call("admin_publish_event", owner, e.id);
    const copy = await call("admin_duplicate_event", owner, e.id);
    expect(copy.status).toBe("draft");
    expect(copy.question).toBe("Who cries first? (copy)");
    expect(await outcomesOf(copy.id)).toHaveLength(2);
  });

  it("deletes drafts only", async () => {
    const e = await draft();
    await call("admin_publish_event", owner, e.id);
    await fails(call("admin_delete_event", owner, e.id), "EVENT_NOT_DRAFT");
    const d = await draft();
    await call("admin_delete_event", owner, d.id);
    expect(await q("select 1 from events where id = $1", [d.id])).toHaveLength(0);
  });

  it("protects outcomes that have bets and requires two on live events", async () => {
    const [g] = await q("insert into guests (display_name) values ($1) returning id", [randomUUID()]);
    const e = await draft();
    await call("admin_publish_event", owner, e.id);
    const [a, b] = await outcomesOf(e.id);
    await call("guest_place_bet", g.id, a, 100, 2, randomUUID());
    await fails(call("admin_rename_outcome", owner, a, "New"), "OUTCOME_HAS_BETS");
    await fails(call("admin_delete_outcome", owner, a), "OUTCOME_HAS_BETS");
    await fails(call("admin_delete_outcome", owner, b), "NEEDS_TWO_OUTCOMES");
    await call("admin_add_outcome", owner, e.id, "C", 4);
    await call("admin_delete_outcome", owner, b);
  });

  it("rejects a past lock time, and won't move the lock on a locked event", async () => {
    const e = await draft();
    const update = (lockAt: Date | null) =>
      call("admin_update_event", owner, e.id, null, "Who cries first?", null, lockAt, 0);
    await fails(update(new Date(Date.now() - 1000)), "LOCK_TIME_PASSED");
    await call("admin_publish_event", owner, e.id);
    await call("admin_lock_event", owner, e.id);
    await fails(update(new Date(Date.now() + 100000)), "EVENT_LOCKED");
    await update(null);
  });
});

describe("guests", () => {
  it("imports all names with $1,000 each, or none on a duplicate", async () => {
    const a = randomUUID();
    const b = randomUUID();
    expect((await call("admin_import_guests", owner, JSON.stringify([` ${a} `, b]))).admin_import_guests).toBe(2);
    const [row] = await q(
      "select available_balance from guest_balances where display_name = $1", [a],
    );
    expect(row.available_balance).toBe(1000);

    const c = randomUUID();
    await expect(call("admin_import_guests", owner, JSON.stringify([c, a.toUpperCase()]))).rejects.toThrow();
    expect(await q("select 1 from guests where display_name = $1", [c])).toHaveLength(0);
  });
});

describe("reset", () => {
  it("needs the word RESET, then clears the game but keeps admins", async () => {
    await fails(call("admin_reset_game", owner, "reset"), "RESET_NOT_CONFIRMED");
    await call("admin_reset_game", owner, "RESET");
    for (const table of ["guests", "events", "bets", "ledger_entries", "functions"]) {
      expect(await q(`select 1 from ${table}`)).toHaveLength(0);
    }
    expect(await q("select 1 from admins where user_id = $1", [owner])).toHaveLength(1);
    expect((await q("select action from admin_actions")).map((r) => r.action)).toEqual(["game.reset"]);
  });
});

describe("parsing guest lists", () => {
  it("reads pasted names, CSV columns, and quoted commas", () => {
    expect(parseGuestNames("Priya Sharma\n\n  Rohan   Mehta \r\n")).toEqual(["Priya Sharma", "Rohan Mehta"]);
    expect(parseGuestNames("﻿side,display_name\nBride,Priya\nGroom,Rohan")).toEqual(["Priya", "Rohan"]);
    expect(parseGuestNames('name\n"Sharma, Priya"\n"Raj ""RJ"" Patel"')).toEqual(["Sharma, Priya", 'Raj "RJ" Patel']);
  });
});
