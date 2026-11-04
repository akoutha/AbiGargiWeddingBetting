"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importGuests, previewImport, type ImportPreview } from "@/app/admin/actions";
import { parseGuestNames } from "@/lib/admin/parse-guests";

export function ImportGuests() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const check = (value: string) => {
    setMessage("");
    setError("");
    start(async () => {
      try {
        setPreview(await previewImport(parseGuestNames(value)));
      } catch {
        setError("We couldn't check that list. Check your connection and try again.");
      }
    });
  };

  async function readFile(file?: File) {
    if (!file) return;
    const value = await file.text();
    setText(value);
    check(value);
  }

  function confirm() {
    if (!preview) return;
    start(async () => {
      try {
        const result = await importGuests(preview.ready);
        if (result.error) setError(result.error);
        else {
          setMessage(result.ok ?? "");
          setPreview(null);
          setText("");
          router.refresh();
        }
      } catch {
        setError("We couldn't confirm the import. Check the guest list before trying again.");
      }
    });
  }

  return (
    <section className="panel admin-form">
      <label htmlFor="guest-file">Upload a CSV file</label>
      <input id="guest-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
      <label htmlFor="guest-names">Or paste names, one per line</label>
      <textarea id="guest-names" rows={8} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
      <div className="actions">
        <button type="button" className="button secondary" disabled={!text.trim() || pending} onClick={() => check(text)}>Check names</button>
      </div>
      {preview && (
        <div className="import-preview">
          <p className="preview">{preview.ready.length} ready to import</p>
          <Skipped title="Already on the guest list" names={preview.existing} />
          <Skipped title="Repeated in this list" names={preview.duplicates} />
          <Skipped title="Longer than 80 characters" names={preview.tooLong} />
          {(preview.existing.length + preview.duplicates.length + preview.tooLong.length) > 0 && (
            <p>Skipped names won&apos;t be imported. If two guests share a name, change one in your list, such as &quot;Raj Patel (Bride&apos;s uncle)&quot;.</p>
          )}
          <div className="actions">
            <button type="button" className="button" disabled={pending || preview.ready.length === 0} onClick={confirm}>
              {pending ? "Importing..." : `Import ${preview.ready.length} guests`}
            </button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </section>
  );
}

function Skipped({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <details>
      <summary>{title}: {names.length}</summary>
      <ul className="plain-list">{names.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}</ul>
    </details>
  );
}
