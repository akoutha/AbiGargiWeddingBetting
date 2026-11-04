"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { createPin, enterPin, submitAccessCode } from "@/app/actions";

export function AccessCodeForm() {
  const [state, action, pending] = useActionState(submitAccessCode, {});
  return (
    <form action={action} className="join-form">
      <label htmlFor="code">Wedding code</label>
      <input id="code" name="code" autoComplete="off" autoCapitalize="characters" required />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Checking..." : "Continue"}</button>
    </form>
  );
}

export function GuestPicker({ guests }: { guests: { id: string; display_name: string }[] }) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? guests.filter((g) => g.display_name.toLowerCase().includes(term)) : guests;
  }, [guests, search]);

  return (
    <div className="join-form">
      <label htmlFor="guest-search">Your name</label>
      <input
        id="guest-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Start typing"
        autoComplete="off"
      />
      <ul className="guest-list">
        {matches.map((g) => (
          <li key={g.id}><Link href={`/join/${g.id}`}>{g.display_name}</Link></li>
        ))}
      </ul>
      {matches.length === 0 && (
        <p className="on-color">Can&apos;t find your name? Ask someone in the wedding party to add you.</p>
      )}
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
  const [state, action, pending] = useActionState(
    (isNew ? createPin : enterPin).bind(null, guestId),
    {},
  );
  return (
    <form action={action} className="join-form">
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
