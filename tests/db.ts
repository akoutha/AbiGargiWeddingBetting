import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client, Pool } from "pg";

// Runs against real Postgres, because locking and concurrency are the point.
// TEST_DATABASE_URL must be a server you can create databases on.
const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";
const nameFor = (suite: string) => `wedding_test_${suite}_${process.pid}`;
const migrationsDir = join(__dirname, "../supabase/migrations");
export const migrations = readdirSync(migrationsDir).sort().map((f) => join(migrationsDir, f));

export async function openDb(suite: string) {
  const root = new Client(baseUrl);
  await root.connect();
  await root.query(`create database ${nameFor(suite)}`);
  await root.end();

  const url = new URL(baseUrl);
  url.pathname = `/${nameFor(suite)}`;
  const pool = new Pool({ connectionString: url.toString(), max: 30 });

  // Stand-ins for what Supabase provides. Harmless on a Supabase database.
  await pool.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$`);
  await pool.query("create schema if not exists auth");
  await pool.query("create table if not exists auth.users (id uuid primary key)");
  for (const file of migrations) await pool.query(readFileSync(file, "utf8"));

  const admin = randomUUID();
  await pool.query(
    "insert into admins (user_id, display_name, email, is_owner) values ($1, 'Abishek', 'owner@example.com', true)",
    [admin],
  );
  return { pool, admin };
}

export async function closeDb(pool: Pool, suite: string) {
  await pool?.end();
  const root = new Client(baseUrl);
  await root.connect();
  await root.query(`drop database if exists ${nameFor(suite)} with (force)`);
  await root.end();
}
