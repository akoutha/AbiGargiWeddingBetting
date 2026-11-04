"use client";

import { useState } from "react";

export function OutcomeRows() {
  const [rows, setRows] = useState([0, 1]);
  return (
    <fieldset className="outcome-rows">
      <legend>Outcomes</legend>
      {rows.map((row, i) => (
        <div key={row} className="outcome-row">
          <input name="label" placeholder={`Outcome ${i + 1}`} aria-label={`Outcome ${i + 1} name`} />
          <input name="odds" inputMode="decimal" placeholder="Odds" aria-label={`Outcome ${i + 1} odds`} />
          {rows.length > 2 && (
            <button type="button" className="text-button" onClick={() => setRows(rows.filter((r) => r !== row))}>Remove</button>
          )}
        </div>
      ))}
      <button type="button" className="text-button" onClick={() => setRows([...rows, Math.max(...rows) + 1])}>Add another outcome</button>
    </fieldset>
  );
}
