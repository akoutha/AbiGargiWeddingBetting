/** Plain-language messages for the error codes raised by the database functions. */
export const GAME_ERRORS = {
  ALREADY_BET: "You already have a bet on this event. Change it from My Bets.",
  AMOUNT_REQUIRED: "Enter an amount other than $0.",
  BET_NOT_FOUND: "We couldn't find that bet.",
  BET_NOT_OPEN: "This bet can no longer be changed.",
  BETTING_PAUSED: "Betting is paused for a moment. Please try again shortly.",
  EVENT_ALREADY_RESOLVED: "This event already has a final result.",
  EVENT_LOCKED: "Betting on this event has closed.",
  EVENT_NOT_DRAFT: "Only draft events can be published.",
  EVENT_NOT_FOUND: "We couldn't find that event.",
  EVENT_NOT_LOCKED: "Lock this event first.",
  EVENT_NOT_OPEN: "Only open events can be locked.",
  EVENT_NOT_SETTLED: "Only settled events can be corrected.",
  EVENT_NOT_VOIDABLE: "This event can't be voided.",
  GAME_ENDED: "The game has ended.",
  GUEST_INACTIVE: "This guest is no longer active. Please ask an admin for help.",
  GUEST_NOT_FOUND: "We couldn't find that guest.",
  HISTORY_IS_READ_ONLY: "Past records can't be changed.",
  INSUFFICIENT_BALANCE: "You don't have enough money for this bet.",
  LOCK_TIME_PASSED: "Choose a lock time in the future.",
  NAME_ALREADY_CLAIMED: "This name has already been claimed. Ask an admin for help if it's yours.",
  NEEDS_TWO_OUTCOMES: "Add at least two outcomes first.",
  NOT_ADMIN: "You don't have admin access.",
  ODDS_CHANGED: "The odds just changed. Please review them and confirm again.",
  OUTCOME_NOT_FOUND: "We couldn't find that outcome.",
  PIN_LOCKED: "Too many wrong tries. Wait 15 minutes or ask an admin to reset your PIN.",
  PIN_NOT_SET: "This name doesn't have a PIN yet.",
  REASON_REQUIRED: "Enter a reason.",
  SAME_WINNER: "That outcome is already the winner.",
  STAKE_TOO_LOW: "The minimum bet is $10.",
  UNRESOLVED_EVENTS: "Settle or void every open and locked event first.",
} as const;

export type GameErrorCode = keyof typeof GAME_ERRORS;

export function gameErrorMessage(code: string): string {
  return code in GAME_ERRORS
    ? GAME_ERRORS[code as GameErrorCode]
    : "Something went wrong. Please try again.";
}
