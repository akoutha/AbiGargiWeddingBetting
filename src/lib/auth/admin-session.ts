import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query } from "@/lib/db";
import { cookieOptions, sha256 } from "./session";

const ADMIN_COOKIE = "wb_admin";
const SESSION_DAYS = 14;

export type Admin = { id: string; displayName: string; isOwner: boolean };

export async function startAdminSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  await query(
    `insert into admin_sessions (token_hash, admin_id, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), adminId, SESSION_DAYS],
  );
  (await cookies()).set(ADMIN_COOKIE, token, { ...cookieOptions(SESSION_DAYS), sameSite: "strict" });
}

export async function endAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await query("delete from admin_sessions where token_hash = $1", [sha256(token)]);
  store.delete(ADMIN_COOKIE);
}

export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const [row] = await query<{ user_id: string; display_name: string; is_owner: boolean }>(
    `select a.user_id, a.display_name, a.is_owner from admin_sessions s
     join admins a on a.user_id = s.admin_id
     where s.token_hash = $1 and s.expires_at > now() and a.is_active`,
    [sha256(token)],
  );
  return row ? { id: row.user_id, displayName: row.display_name, isOwner: row.is_owner } : null;
});

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
