"use client";

import { useEffect, useState } from "react";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Shows a time in the viewer's time zone. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

/** Lets the admin pick a local time and submits it as an exact moment. */
export function LockTimeField({ value, label = "Lock time (optional)" }: { value?: string | null; label?: string }) {
  const [local, setLocal] = useState("");
  // The time zone is only known in the browser, so this can't render on the server.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLocal(value ? toLocalInput(value) : ""), [value]);
  return (
    <>
      <label htmlFor="lock_time">{label}</label>
      <input id="lock_time" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name="lock_at" value={local ? new Date(local).toISOString() : ""} />
      <button type="button" className="text-button" onClick={() => setLocal("")}>Clear lock time</button>
    </>
  );
}
