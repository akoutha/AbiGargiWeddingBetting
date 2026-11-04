export const MAX_GUEST_NAME = 80;

function parseRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cells.push(cell); cell = ""; }
    else cell += c;
  }
  cells.push(cell);
  return cells.map((v) => v.trim());
}

/** Reads a CSV file or pasted names. Uses the display_name or name column if there is one. */
export function parseGuestNames(text: string) {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).map(parseRow);
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  const column = header.findIndex((h) => h === "display_name" || h === "name");
  const hasHeader = column !== -1;
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => row[hasHeader ? column : 0] ?? "")
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export const nameKey = (name: string) => name.trim().toLowerCase();
