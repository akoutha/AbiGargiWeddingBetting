"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBet, changeBet, placeBet, type ActionResult } from "@/app/actions";
import { money, multiplier, payoutFor } from "@/lib/game/format";
import type { GuestBet, Outcome } from "@/lib/game/queries";

type Props = {
  outcomes: Outcome[];
  bet: GuestBet | null;
  available: number;
  minBet: number;
  paused: boolean;
};

function newKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const CONNECTION_ERROR =
  "We couldn't confirm that. Check your connection and try again. You won't be charged twice.";

export function BetSlip({ outcomes, bet, available, minBet, paused }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [outcomeId, setOutcomeId] = useState(bet?.outcome_id ?? "");
  const [stakeText, setStakeText] = useState(bet ? String(bet.stake) : "");
  const [reviewing, setReviewing] = useState(false);
  const [reviewedOdds, setReviewedOdds] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState("");
  const [pending, startTransition] = useTransition();
  const keyRef = useRef("");

  const outcome = outcomes.find((o) => o.id === outcomeId);
  const stake = Number(stakeText);
  const max = available + (bet?.stake ?? 0);
  const validStake = Number.isInteger(stake) && stake >= minBet && stake <= max;
  const oddsMoved = reviewing && outcome && reviewedOdds !== outcome.odds;

  useEffect(() => {
    if (placed) {
      const timer = setTimeout(() => setPlaced(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [placed]);

  function run(action: () => Promise<ActionResult>, done: string) {
    setError("");
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action();
      } catch {
        setError(CONNECTION_ERROR);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      setPlaced(done);
      setReviewing(false);
      setEditing(false);
      setConfirmCancel(false);
      router.refresh();
    });
  }

  function startReview() {
    keyRef.current = newKey();
    setReviewedOdds(outcome?.odds ?? null);
    setError("");
    setReviewing(true);
  }

  function submit() {
    if (!outcome) return;
    const key = keyRef.current;
    if (bet) run(() => changeBet(bet.id, outcome.id, stake, outcome.odds, key), "Bet changed");
    else run(() => placeBet(outcome.id, stake, outcome.odds, key), "Bet placed");
  }

  if (bet && !editing) {
    return (
      <section aria-label="Your bet">
        {placed && <p className="success" role="status">{placed}</p>}
        <div className="your-bet">
          <h2>Your bet</h2>
          <p className="your-bet-pick">{bet.outcome_label}</p>
          <p>{money(bet.stake)} at {multiplier(bet.locked_odds)} wins {money(payoutFor(bet.stake, bet.locked_odds))}</p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirmCancel ? (
          <div className="row">
            <button className="button" disabled={pending}
              onClick={() => run(() => cancelBet(bet.id), "Bet cancelled")}>
              {pending ? "Cancelling..." : `Cancel bet and return ${money(bet.stake)}`}
            </button>
            <button className="button secondary" onClick={() => setConfirmCancel(false)}>Keep bet</button>
          </div>
        ) : (
          <div className="row">
            <button className="button" disabled={paused} onClick={() => {
              setOutcomeId(bet.outcome_id);
              setStakeText(String(bet.stake));
              setEditing(true);
            }}>Change bet</button>
            <button className="button secondary" onClick={() => setConfirmCancel(true)}>Cancel bet</button>
          </div>
        )}
      </section>
    );
  }

  if (reviewing && outcome) {
    return (
      <section aria-label="Review your bet" className="review">
        <h2>Review your bet</h2>
        {oddsMoved && (
          <p className="notice" role="alert">
            The odds changed from {multiplier(reviewedOdds!)} to {multiplier(outcome.odds)}. Check the new payout below.
          </p>
        )}
        <dl>
          <div><dt>Your pick</dt><dd>{outcome.label}</dd></div>
          <div><dt>Your bet</dt><dd>{money(stake)}</dd></div>
          <div><dt>Odds</dt><dd>{multiplier(outcome.odds)}</dd></div>
          <div><dt>You win</dt><dd>{money(payoutFor(stake, outcome.odds))}</dd></div>
        </dl>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="row">
          <button className="button" disabled={pending} onClick={() => {
            if (oddsMoved) { setReviewedOdds(outcome.odds); setError(""); }
            else submit();
          }}>
            {pending ? "Placing..." : oddsMoved ? "Accept new odds" : bet ? "Change bet" : "Place bet"}
          </button>
          <button className="button secondary" disabled={pending} onClick={() => setReviewing(false)}>Go back</button>
        </div>
      </section>
    );
  }

  if (max < minBet) {
    return <p className="notice">You need at least {money(minBet)} to bet. Win a bet to keep playing.</p>;
  }

  return (
    <form className="slip" onSubmit={(e) => { e.preventDefault(); if (outcome && validStake) startReview(); }}>
      {placed && <p className="success" role="status">{placed}</p>}
      <fieldset>
        <legend>What will happen?</legend>
        {outcomes.map((o) => (
          <label key={o.id} className="choice">
            <input type="radio" name="outcome" value={o.id} checked={o.id === outcomeId}
              onChange={() => setOutcomeId(o.id)} />
            <span>{o.label}</span>
            <strong>{multiplier(o.odds)}</strong>
          </label>
        ))}
      </fieldset>

      <label htmlFor="stake" className="field-label">How much?</label>
      <div className="stake">
        <span aria-hidden="true">$</span>
        <input id="stake" inputMode="numeric" value={stakeText} autoComplete="off"
          onChange={(e) => setStakeText(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="quick">
        {[50, 100].filter((v) => v <= max).map((v) => (
          <button type="button" key={v} onClick={() => setStakeText(String(v))}>{money(v)}</button>
        ))}
        <button type="button" onClick={() => setStakeText(String(max))}>All in ({money(max)})</button>
      </div>

      <p className="preview" aria-live="polite">
        {!stakeText ? `Minimum bet ${money(minBet)}`
          : stake > max ? `You have ${money(max)} to bet`
          : stake < minBet ? `Minimum bet ${money(minBet)}`
          : !outcome ? "Choose what will happen"
          : `Bet ${money(stake)}, win ${money(payoutFor(stake, outcome.odds))}`}
      </p>
      <div className="row">
        <button className="button" disabled={!outcome || !validStake || paused}>Review bet</button>
        {editing && <button type="button" className="button secondary" onClick={() => setEditing(false)}>Keep bet</button>}
      </div>
    </form>
  );
}
