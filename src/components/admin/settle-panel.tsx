"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleEvent, settlementPreview } from "@/app/admin/actions";
import { money } from "@/lib/game/format";

type Preview = { winners: number; losers: number; total_payout: number };
type Props = {
  eventId: string;
  outcomes: { id: string; label: string }[];
  currentWinner: string | null;
};

export function SettlePanel({ eventId, outcomes, currentWinner }: Props) {
  const router = useRouter();
  const correcting = currentWinner !== null;
  const [winner, setWinner] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const choices = outcomes.filter((o) => o.id !== currentWinner);

  function choose(id: string) {
    setWinner(id);
    setPreview(null);
    setError("");
    start(async () => {
      try {
        setPreview(await settlementPreview(eventId, id));
      } catch {
        setError("We couldn't load the totals. Check your connection and try again.");
      }
    });
  }

  function confirm() {
    setError("");
    start(async () => {
      try {
        const result = await settleEvent(eventId, winner, correcting);
        if (result.error) setError(result.error);
        router.refresh();
      } catch {
        setError("We couldn't confirm that. Refresh the page to check the result before trying again.");
      }
    });
  }

  return (
    <section className="panel">
      <h2>{correcting ? "Correct the result" : "Settle this event"}</h2>
      {correcting && <p>This reverses the current payouts and pays the new winners. A guest who already spent those winnings can go negative.</p>}
      <fieldset>
        <legend>{correcting ? "New winning outcome" : "Winning outcome"}</legend>
        {choices.map((o) => (
          <label key={o.id} className="choice">
            <input type="radio" name="winner" checked={winner === o.id} onChange={() => choose(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {preview && (
        <p className="preview">
          {preview.winners} {preview.winners === 1 ? "winner" : "winners"}, {preview.losers}{" "}
          {preview.losers === 1 ? "loser" : "losers"}, {money(preview.total_payout)} paid out
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="button" disabled={!preview || pending} onClick={confirm}>
          {pending ? "One moment..." : correcting ? "Confirm correction" : "Confirm result"}
        </button>
      </div>
    </section>
  );
}
