import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GAME_ERRORS } from "../src/lib/game/errors";

import { closeDb, migrations, openDb } from "./db";

let pool: Pool;
let admin: string;

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
const call = async (fn: string, ...args: unknown[]) => {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await q(`select * from ${fn}(${placeholders})`, args))[0];
};

async function guest(name = `Guest ${randomUUID()}`) {
  const [g] = await q(
    "insert into guests (display_name, joined_at) values ($1, now()) returning id",
    [name],
  );
  return g.id as string;
}

async function openEvent(odds = [3, 2], lockAt: Date | null = null) {
  const outcomes = odds.map((o, i) => ({ label: `Outcome ${i}`, odds: o }));
  const event = await call(
    "admin_create_event", admin, null, "Who cries first?", null, lockAt, JSON.stringify(outcomes),
  );
  await call("admin_publish_event", admin, event.id);
  const rows = await q("select id from outcomes where event_id = $1 order by sort_order", [event.id]);
  return { id: event.id as string, outcomes: rows.map((r) => r.id as string) };
}

const bet = (g: string, outcome: string, stake: number, odds: number, key = randomUUID()) =>
  call("guest_place_bet", g, outcome, stake, odds, key);

async function balance(g: string) {
  const [row] = await q("select * from guest_balances where guest_id = $1", [g]);
  return {
    available: row.available_balance as number,
    total: row.total_balance as number,
    earnings: row.earnings as number,
  };
}

const fails = (p: Promise<unknown>, code: string) => expect(p).rejects.toThrow(code);

beforeAll(async () => {
  ({ pool, admin } = await openDb("game"));
});

afterAll(async () => {
  await closeDb(pool, "game");
});

beforeEach(async () => {
  await q("update game_settings set betting_paused = false, ended_at = null");
});

describe("starting balance", () => {
  it("gives every guest $1,000, including late arrivals", async () => {
    await openEvent();
    expect(await balance(await guest())).toEqual({ available: 1000, total: 1000, earnings: 0 });
  });
});

describe("placing bets", () => {
  it("holds the stake without changing total balance or earnings", async () => {
    const g = await guest();
    const e = await openEvent();
    await bet(g, e.outcomes[0], 100, 3);
    expect(await balance(g)).toEqual({ available: 900, total: 1000, earnings: 0 });
  });

  it("enforces the minimum, the balance, and one bet per event", async () => {
    const g = await guest();
    const e = await openEvent();
    await fails(bet(g, e.outcomes[0], 9, 3), "STAKE_TOO_LOW");
    await fails(bet(g, e.outcomes[0], 1001, 3), "INSUFFICIENT_BALANCE");
    await bet(g, e.outcomes[0], 1000, 3);
    await fails(bet(g, e.outcomes[1], 10, 2), "ALREADY_BET");
  });

  it("creates one bet from a retried submission", async () => {
    const g = await guest();
    const e = await openEvent();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => bet(g, e.outcomes[0], 100, 3, key)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await balance(g)).available).toBe(900);
  });

  it("keeps only one bet from a double tap with different keys", async () => {
    const g = await guest();
    const e = await openEvent();
    const results = await Promise.allSettled([
      bet(g, e.outcomes[0], 100, 3),
      bet(g, e.outcomes[0], 100, 3),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await balance(g)).available).toBe(900);
  });

  it("cannot overspend across simultaneous bets", async () => {
    const g = await guest();
    const events = await Promise.all(Array.from({ length: 12 }, () => openEvent()));
    await Promise.allSettled(events.map((e) => bet(g, e.outcomes[0], 300, 3)));
    const b = await balance(g);
    expect(b.available).toBe(100);
    expect(b.total).toBe(1000);
  });

  it("requires confirmation when odds change, and keeps earlier odds", async () => {
    const early = await guest();
    const late = await guest();
    const e = await openEvent();
    await bet(early, e.outcomes[0], 100, 3);
    await call("admin_set_odds", admin, e.outcomes[0], 5);
    await fails(bet(late, e.outcomes[0], 100, 3), "ODDS_CHANGED");
    await bet(late, e.outcomes[0], 100, 5);

    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);
    expect((await balance(early)).total).toBe(1200);
    expect((await balance(late)).total).toBe(1400);
  });

  it("rejects bets after a manual lock, past a lock time, and while paused", async () => {
    const g = await guest();
    const locked = await openEvent();
    await call("admin_lock_event", admin, locked.id);
    await fails(bet(g, locked.outcomes[0], 100, 3), "EVENT_LOCKED");

    const timed = await openEvent([3, 2], new Date(Date.now() + 150));
    await new Promise((r) => setTimeout(r, 300));
    await fails(bet(g, timed.outcomes[0], 100, 3), "EVENT_LOCKED");

    const open = await openEvent();
    await call("admin_set_betting_paused", admin, true);
    await fails(bet(g, open.outcomes[0], 100, 3), "BETTING_PAUSED");
    expect((await balance(g)).available).toBe(1000);
  });

  it("rejects bets from deactivated guests", async () => {
    const g = await guest();
    const e = await openEvent();
    await call("admin_set_guest_active", admin, g, false);
    await fails(bet(g, e.outcomes[0], 100, 3), "GUEST_INACTIVE");
  });
});

describe("changing and cancelling bets", () => {
  it("swaps a bet at current odds without losing money", async () => {
    const g = await guest();
    const e = await openEvent();
    const first = await bet(g, e.outcomes[0], 100, 3);
    const second = await call("guest_change_bet", g, first.id, e.outcomes[1], 250, 2, randomUUID());
    expect(Number(second.locked_odds)).toBe(2);
    expect((await balance(g)).available).toBe(750);
    expect((await q("select status from bets where id = $1", [first.id]))[0].status).toBe("cancelled");
  });

  it("leaves the original bet alone when a change is rejected", async () => {
    const g = await guest();
    const e = await openEvent();
    const first = await bet(g, e.outcomes[0], 100, 3);
    await fails(
      call("guest_change_bet", g, first.id, e.outcomes[1], 5000, 2, randomUUID()),
      "INSUFFICIENT_BALANCE",
    );
    expect((await balance(g)).available).toBe(900);
    expect((await q("select status from bets where id = $1", [first.id]))[0].status).toBe("open");
  });

  it("can bet on the full balance when changing an all-in bet", async () => {
    const g = await guest();
    const e = await openEvent();
    const first = await bet(g, e.outcomes[0], 1000, 3);
    await call("guest_change_bet", g, first.id, e.outcomes[1], 1000, 2, randomUUID());
    expect((await balance(g)).available).toBe(0);
  });

  it("refunds a cancel once, then allows a new bet", async () => {
    const g = await guest();
    const e = await openEvent();
    const first = await bet(g, e.outcomes[0], 100, 3);
    await Promise.all([
      call("guest_cancel_bet", g, first.id),
      call("guest_cancel_bet", g, first.id),
    ]);
    expect((await balance(g)).available).toBe(1000);
    await bet(g, e.outcomes[1], 100, 2);
  });

  it("freezes bets once the event locks", async () => {
    const g = await guest();
    const e = await openEvent();
    const first = await bet(g, e.outcomes[0], 100, 3);
    await call("admin_lock_event", admin, e.id);
    await fails(call("guest_cancel_bet", g, first.id), "EVENT_LOCKED");
    await fails(
      call("guest_change_bet", g, first.id, e.outcomes[1], 100, 2, randomUUID()),
      "EVENT_LOCKED",
    );
  });

  it("does not let a guest touch someone else's bet", async () => {
    const owner = await guest();
    const other = await guest();
    const e = await openEvent();
    const first = await bet(owner, e.outcomes[0], 100, 3);
    await fails(call("guest_cancel_bet", other, first.id), "BET_NOT_FOUND");
  });
});

describe("settlement", () => {
  it("matches the worked example in PRODUCT.md", async () => {
    const winner = await guest();
    const loser = await guest();
    const e = await openEvent();
    await bet(winner, e.outcomes[0], 100, 3);
    await bet(loser, e.outcomes[1], 100, 2);
    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);
    expect(await balance(winner)).toEqual({ available: 1200, total: 1200, earnings: 200 });
    expect(await balance(loser)).toEqual({ available: 900, total: 900, earnings: -100 });
  });

  it("rounds payouts to the nearest dollar", async () => {
    const g = await guest();
    const e = await openEvent([1.25, 2]);
    await bet(g, e.outcomes[0], 99, 1.25);
    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);
    expect((await balance(g)).available).toBe(901 + 124);
  });

  it("previews the settlement accurately", async () => {
    const a = await guest();
    const b = await guest();
    const e = await openEvent();
    await bet(a, e.outcomes[0], 100, 3);
    await bet(b, e.outcomes[1], 50, 2);
    await call("admin_lock_event", admin, e.id);
    const [row] = await q("select admin_settlement_preview($1, $2) as p", [e.id, e.outcomes[0]]);
    expect(row.p).toEqual({ winners: 1, losers: 1, total_payout: 300 });
  });

  it("requires a lock, and settles an event past its lock time", async () => {
    const e = await openEvent();
    await fails(call("admin_settle_event", admin, e.id, e.outcomes[0]), "EVENT_NOT_LOCKED");

    const timed = await openEvent([3, 2], new Date(Date.now() + 150));
    await new Promise((r) => setTimeout(r, 300));
    const settled = await call("admin_settle_event", admin, timed.id, timed.outcomes[0]);
    expect(settled.status).toBe("settled");
  });

  it("pays only once under simultaneous settle clicks", async () => {
    const g = await guest();
    const e = await openEvent();
    await bet(g, e.outcomes[0], 100, 3);
    await call("admin_lock_event", admin, e.id);
    await Promise.allSettled(
      Array.from({ length: 6 }, () => call("admin_settle_event", admin, e.id, e.outcomes[0])),
    );
    expect((await balance(g)).available).toBe(1200);
  });

  it("rejects a winner from another event", async () => {
    const e = await openEvent();
    const other = await openEvent();
    await call("admin_lock_event", admin, e.id);
    await fails(call("admin_settle_event", admin, e.id, other.outcomes[0]), "OUTCOME_NOT_FOUND");
  });

  it("settles when nobody picked the winner", async () => {
    const g = await guest();
    const e = await openEvent();
    await bet(g, e.outcomes[1], 100, 2);
    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);
    expect((await balance(g)).total).toBe(900);
  });

  it("stays consistent when bets race a lock and settlement, without deadlocks", async () => {
    const guests = await Promise.all(Array.from({ length: 20 }, () => guest()));
    const e = await openEvent();
    const bets = guests.map((g) => bet(g, e.outcomes[0], 100, 3));
    const lockAndSettle = call("admin_lock_event", admin, e.id).then(() =>
      call("admin_settle_event", admin, e.id, e.outcomes[0]),
    );
    const results = await Promise.allSettled([...bets, lockAndSettle]);

    for (const r of results) {
      if (r.status === "rejected") expect(String(r.reason)).toContain("EVENT_LOCKED");
    }
    expect(results.at(-1)?.status).toBe("fulfilled");
    const accepted = results.slice(0, -1).filter((r) => r.status === "fulfilled").length;
    const totals = await Promise.all(guests.map(balance));
    expect(totals.filter((t) => t.total === 1200)).toHaveLength(accepted);
    expect(totals.filter((t) => t.total === 1000)).toHaveLength(guests.length - accepted);
  });
});

describe("corrections and voids", () => {
  it("corrects a wrong result, and back again", async () => {
    const a = await guest();
    const b = await guest();
    const e = await openEvent();
    await bet(a, e.outcomes[0], 100, 3);
    await bet(b, e.outcomes[1], 100, 2);
    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);

    await call("admin_correct_event", admin, e.id, e.outcomes[1]);
    expect((await balance(a)).total).toBe(900);
    expect((await balance(b)).total).toBe(1100);

    await call("admin_correct_event", admin, e.id, e.outcomes[0]);
    expect((await balance(a)).total).toBe(1200);
    expect((await balance(b)).total).toBe(900);
  });

  it("allows a negative balance after a correction and blocks betting until it recovers", async () => {
    const g = await guest();
    const first = await openEvent();
    const next = await openEvent();
    const third = await openEvent();
    await bet(g, first.outcomes[0], 1000, 3);
    await call("admin_lock_event", admin, first.id);
    await call("admin_settle_event", admin, first.id, first.outcomes[0]);
    await bet(g, next.outcomes[0], 3000, 3);

    await call("admin_correct_event", admin, first.id, first.outcomes[1]);
    expect((await balance(g)).available).toBe(-3000);
    await fails(bet(g, third.outcomes[0], 10, 3), "INSUFFICIENT_BALANCE");
  });

  it("refunds everyone when an open or settled event is voided", async () => {
    const a = await guest();
    const b = await guest();
    const open = await openEvent();
    await bet(a, open.outcomes[0], 100, 3);
    await call("admin_void_event", admin, open.id, "Didn't happen");
    expect((await balance(a)).available).toBe(1000);

    const settled = await openEvent();
    await bet(a, settled.outcomes[0], 100, 3);
    await bet(b, settled.outcomes[1], 100, 2);
    await call("admin_lock_event", admin, settled.id);
    await call("admin_settle_event", admin, settled.id, settled.outcomes[0]);
    await call("admin_void_event", admin, settled.id, "Disputed");
    expect(await balance(a)).toEqual({ available: 1000, total: 1000, earnings: 0 });
    expect(await balance(b)).toEqual({ available: 1000, total: 1000, earnings: 0 });
  });

  it("does not void twice or settle a voided event", async () => {
    const g = await guest();
    const e = await openEvent();
    await bet(g, e.outcomes[0], 100, 3);
    await call("admin_void_event", admin, e.id, "Rain");
    await fails(call("admin_void_event", admin, e.id, "Rain"), "EVENT_NOT_VOIDABLE");
    await fails(call("admin_settle_event", admin, e.id, e.outcomes[0]), "EVENT_ALREADY_RESOLVED");
    expect((await balance(g)).available).toBe(1000);
  });
});

describe("leaderboard and adjustments", () => {
  it("ranks by earnings and gives ties the same rank", async () => {
    await q("update guests set is_active = false");
    const a = await guest();
    const b = await guest();
    const c = await guest();
    const e = await openEvent();
    await bet(a, e.outcomes[0], 100, 3);
    await bet(c, e.outcomes[1], 100, 2);
    await call("admin_lock_event", admin, e.id);
    await call("admin_settle_event", admin, e.id, e.outcomes[0]);

    const rows = await q("select guest_id, rank from leaderboard order by rank");
    expect(rows.map((r) => [r.guest_id, r.rank])).toEqual([[a, 1], [b, 2], [c, 3]]);

    await call("admin_adjust_balance", admin, c, 100, "Tie test", true);
    const ranks = await q("select guest_id, rank from leaderboard where guest_id in ($1, $2)", [b, c]);
    expect(ranks.map((r) => r.rank)).toEqual([2, 2]);
  });

  it("scores only scored adjustments, requires a reason, and logs them", async () => {
    const g = await guest();
    await call("admin_adjust_balance", admin, g, 500, "Late arrival top-up");
    expect(await balance(g)).toEqual({ available: 1500, total: 1500, earnings: 0 });
    await call("admin_adjust_balance", admin, g, 50, "Best dancer", true);
    expect((await balance(g)).earnings).toBe(50);
    await fails(call("admin_adjust_balance", admin, g, 50, " "), "REASON_REQUIRED");
    const log = await q(
      "select actor_id from admin_actions where action = 'guest.adjust_balance' and target_id = $1",
      [g],
    );
    expect(log).toEqual([{ actor_id: admin }, { actor_id: admin }]);
  });
});

describe("game controls", () => {
  it("won't end with unresolved events, then freezes money", async () => {
    const g = await guest();
    const e = await openEvent();
    await fails(call("admin_end_game", admin), "UNRESOLVED_EVENTS");
    await q("update events set status = 'voided' where status in ('open', 'locked')");
    await call("admin_end_game", admin);
    await fails(bet(g, e.outcomes[0], 100, 3), "GAME_ENDED");
    await fails(call("admin_adjust_balance", admin, g, 50, "Late"), "GAME_ENDED");
    await call("admin_reopen_game", admin);
  });
});

describe("sign-in", () => {
  it("lets one person claim a name", async () => {
    const [g] = await q("insert into guests (display_name) values ($1) returning id", [randomUUID()]);
    await call("guest_claim_name", g.id, "hash-a");
    await fails(call("guest_claim_name", g.id, "hash-b"), "NAME_ALREADY_CLAIMED");
  });

  it("locks out after five tries, even in parallel, until an admin resets", async () => {
    const [g] = await q("insert into guests (display_name) values ($1) returning id", [randomUUID()]);
    await call("guest_claim_name", g.id, "hash-a");
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => call("guest_begin_pin_attempt", g.id)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    await fails(call("guest_begin_pin_attempt", g.id), "PIN_LOCKED");

    await call("admin_reset_pin", admin, g.id);
    await call("guest_claim_name", g.id, "hash-b");
    await call("guest_begin_pin_attempt", g.id);
  });
});

describe("protection", () => {
  it("blocks browser roles from data and functions", async () => {
    const client = await pool.connect();
    try {
      await client.query("set role anon");
      await fails(client.query("select * from guests"), "permission denied");
      await fails(client.query("select * from leaderboard"), "permission denied");
      await fails(
        client.query("select admin_end_game($1)", [admin]),
        "permission denied",
      );
      await client.query("set role authenticated");
      await fails(client.query("select * from ledger_entries"), "permission denied");
    } finally {
      await client.query("reset role");
      client.release();
    }
  });

  it("refuses admin actions from non-admins", async () => {
    const e = await openEvent();
    await fails(call("admin_lock_event", randomUUID(), e.id), "NOT_ADMIN");
  });

  it("does not allow ledger or log history to change", async () => {
    await guest();
    await fails(q("update ledger_entries set amount = 999999"), "HISTORY_IS_READ_ONLY");
    await fails(q("delete from ledger_entries"), "HISTORY_IS_READ_ONLY");
    await fails(q("delete from admin_actions"), "HISTORY_IS_READ_ONLY");
  });

  it("does not allow deleting an outcome with bets", async () => {
    const g = await guest();
    const e = await openEvent();
    await bet(g, e.outcomes[0], 100, 3);
    await expect(q("delete from outcomes where id = $1", [e.outcomes[0]])).rejects.toThrow();
  });
});

describe("error messages", () => {
  it("has a message for every code the database raises", () => {
    const sql = migrations.map((f) => readFileSync(f, "utf8")).join("\n");
    const codes = [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(20);
    for (const code of codes) expect(GAME_ERRORS).toHaveProperty(code);
  });
});

describe("ledger integrity", () => {
  it("reconciles every available balance with bet records after all the above", async () => {
    const rows = await q(`
      select g.id,
        coalesce((select sum(amount) from ledger_entries l where l.guest_id = g.id), 0) as ledger,
        coalesce((select sum(amount) from ledger_entries l
          where l.guest_id = g.id and l.type in
            ('starting_grant', 'adjustment_unscored', 'adjustment_scored')), 0)
        - coalesce((select sum(stake) from bets b
            where b.guest_id = g.id and b.status in ('open', 'won', 'lost')), 0)
        + coalesce((select sum(payout) from bets b
            where b.guest_id = g.id and b.status = 'won'), 0) as expected
      from guests g`);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) expect(r.ledger).toBe(r.expected);
  });
});
