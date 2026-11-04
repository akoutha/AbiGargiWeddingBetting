import "server-only";
import { Pool, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  return new Pool({
    connectionString,
    // Each Vercel function holds few connections. Supabase's pooler shares them.
    max: isLocal ? 10 : 3,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  globalForDb.pool ??= createPool();
  return (await globalForDb.pool.query<T>(sql, params)).rows;
}
