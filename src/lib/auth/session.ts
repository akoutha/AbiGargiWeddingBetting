import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query } from "@/lib/db";

const SESSION_COOKIE = "wb_session";
const ACCESS_COOKIE = "wb_access";
const SESSION_DAYS = 60;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const cookieOptions = (days: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: days * 24 * 60 * 60,
});

const normalizeCode = (code: string) => code.trim().toUpperCase();

function accessToken() {
  const code = process.env.WEDDING_ACCESS_CODE;
  if (!code) throw new Error("Missing WEDDING_ACCESS_CODE");
  return sha256(`wedding-access:${normalizeCode(code)}`);
}

/** Checks the shared code and remembers it on this device. */
export async function grantAccess(code: string) {
  const given = Buffer.from(sha256(`wedding-access:${normalizeCode(code)}`));
  if (!timingSafeEqual(given, Buffer.from(accessToken()))) return false;
  (await cookies()).set(ACCESS_COOKIE, accessToken(), cookieOptions(SESSION_DAYS));
  return true;
}

export async function hasAccess() {
  return (await cookies()).get(ACCESS_COOKIE)?.value === accessToken();
}

export async function startSession(guestId: string) {
  const token = randomBytes(32).toString("base64url");
  await query(
    `insert into guest_sessions (token_hash, guest_id, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), guestId, SESSION_DAYS],
  );
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS));
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from guest_sessions where token_hash = $1", [sha256(token)]);
  store.delete(SESSION_COOKIE);
}

export type Guest = { id: string; displayName: string };

export const currentGuest = cache(async (): Promise<Guest | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await query<{ id: string; display_name: string }>(
    `select g.id, g.display_name from guest_sessions s
     join guests g on g.id = s.guest_id
     where s.token_hash = $1 and s.expires_at > now() and g.is_active`,
    [sha256(token)],
  );
  return row ? { id: row.id, displayName: row.display_name } : null;
});

export async function requireGuest() {
  const guest = await currentGuest();
  if (!guest) redirect("/join");
  return guest;
}
