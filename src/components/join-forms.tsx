"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPin, enterPin, searchGuests, submitAccessCode } from "@/app/actions";
import { useFormAction } from "@/components/use-form-action";

export function AccessCodeForm() {
  const { state, pending, ref, onSubmit } = useFormAction(submitAccessCode);
  return (
    <form ref={ref} onSubmit={onSubmit} className="join-form">
      <label htmlFor="code">Wedding code</label>
      <input id="code" name="code" autoComplete="off" autoCapitalize="characters" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Checking..." : "Continue"}</button>
    </form>
  );
}

type GuestMatch = { id: string; display_name: string };

export function GuestPicker() {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<GuestMatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const term = search.trim();
    const request = ++latest.current;
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const found = await searchGuests(term);
        if (request === latest.current) { setMatches(found); setFailed(false); }
      } catch {
        if (request === latest.current) setFailed(true);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const searching = search.trim().length >= 2;

  return (
    <div className="join-form">
      <label htmlFor="guest-search">Your name</label>
      <input
        id="guest-search"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setMatches(null); }}
        placeholder="Type at least 2 letters"
        autoComplete="off"
      />
      {searching && matches && matches.length > 0 && (
        <ul className="guest-list">
          {matches.map((g) => (
            <li key={g.id}><Link href={`/join/${g.id}`}>{g.display_name}</Link></li>
          ))}
        </ul>
      )}
      {searching && matches?.length === 0 && (
        <p>We can&apos;t find that name. Try another spelling, or ask someone in the wedding party to add you.</p>
      )}
      {failed && <p role="alert">Search isn&apos;t working. Check your connection and try again.</p>}
    </div>
  );
}

const pinProps = {
  inputMode: "numeric" as const,
  pattern: "[0-9]{4}",
  maxLength: 4,
  required: true,
  type: "password",
};

export function PinForm({ guestId, isNew }: { guestId: string; isNew: boolean }) {
  const { state, pending, ref, onSubmit } = useFormAction((isNew ? createPin : enterPin).bind(null, guestId));
  return (
    <form ref={ref} onSubmit={onSubmit} className="join-form">
      <label htmlFor="pin">{isNew ? "New PIN" : "PIN"}</label>
      <input id="pin" name="pin" autoComplete={isNew ? "new-password" : "current-password"} {...pinProps} />
      {isNew && (
        <>
          <label htmlFor="confirm">Enter it again</label>
          <input id="confirm" name="confirm" autoComplete="new-password" {...pinProps} />
        </>
      )}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>
        {pending ? "One moment..." : isNew ? "Create PIN" : "Sign in"}
      </button>
    </form>
  );
}
