"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPin, isValidPin, verifyPin } from "@/lib/auth/pin";
import { endSession, grantAccess, hasAccess, requireGuest, startSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { GAME_ERRORS, gameErrorMessage } from "@/lib/game/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type FormState = { error?: string };

/** Turns database rule errors into plain messages. Anything else is logged. */
function failure(err: unknown): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : "";
  if (!(code in GAME_ERRORS)) console.error(err);
  return { ok: false, error: gameErrorMessage(code) };
}

export async function submitAccessCode(_: FormState, form: FormData): Promise<FormState> {
  if (await grantAccess(String(form.get("code") ?? ""))) redirect("/join");
  return { error: "That code doesn't match. Check your invitation or ask the wedding party." };
}

export async function createPin(guestId: string, _: FormState, form: FormData): Promise<FormState> {
  if (!(await hasAccess())) redirect("/join");
  const pin = String(form.get("pin") ?? "");
  if (!isValidPin(pin)) return { error: "Enter 4 digits." };
  if (pin !== form.get("confirm")) return { error: "Those PINs don't match. Try again." };
  try {
    await query("select guest_claim_name($1, $2)", [guestId, await hashPin(pin)]);
    await startSession(guestId);
  } catch (err) {
    return { error: failure(err).error };
  }
  redirect("/welcome");
}

export async function enterPin(guestId: string, _: FormState, form: FormData): Promise<FormState> {
  if (!(await hasAccess())) redirect("/join");
  const pin = String(form.get("pin") ?? "");
  if (!isValidPin(pin)) return { error: "Enter 4 digits." };
  try {
    const [row] = await query<{ hash: string }>("select guest_begin_pin_attempt($1) as hash", [guestId]);
    if (!(await verifyPin(pin, row.hash))) {
      return { error: "That PIN isn't right. After 5 wrong tries, this name locks for 15 minutes." };
    }
    await query("select guest_pin_succeeded($1)", [guestId]);
    await startSession(guestId);
  } catch (err) {
    return { error: failure(err).error };
  }
  redirect("/");
}

export async function switchGuest() {
  await endSession();
  redirect("/join");
}

const refreshGame = () => revalidatePath("/", "layout");

export async function placeBet(
  outcomeId: string, stake: number, odds: string, key: string,
): Promise<ActionResult> {
  const guest = await requireGuest();
  try {
    await query("select guest_place_bet($1, $2, $3, $4, $5)", [guest.id, outcomeId, stake, odds, key]);
    refreshGame();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function changeBet(
  betId: string, outcomeId: string, stake: number, odds: string, key: string,
): Promise<ActionResult> {
  const guest = await requireGuest();
  try {
    await query("select guest_change_bet($1, $2, $3, $4, $5, $6)", [
      guest.id, betId, outcomeId, stake, odds, key,
    ]);
    refreshGame();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function cancelBet(betId: string): Promise<ActionResult> {
  const guest = await requireGuest();
  try {
    await query("select guest_cancel_bet($1, $2)", [guest.id, betId]);
    refreshGame();
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
