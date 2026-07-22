// Task 4.3 (Q34): CSV import/export — pure helpers (CR-3).
// Routes do store I/O only; every format/ordering decision lives here.
// Export drops "(DEMO)" rows (same convention as lib/stats.isDemo and
// lib/search.toHits — demo records never leave the app) and orders
// name A→Z with id tiebreak, so two exports of the same data are
// byte-identical (scoring-pattern §3).

import { Person } from "./types";
import { isDemo } from "./stats";

// Header order for people/org exports. parseCsv + headerIndex (import half,
// inc.2) read this same list, so export→import round-trips by construction.
export const PEOPLE_CSV_COLUMNS = [
  "id",
  "kind",
  "name",
  "business",
  "role",
  "verticalId",
  "phone",
  "email",
  "website",
  "referredById",
  "relationship",
  "status",
  "notes",
] as const;

export type PeopleCsvColumn = (typeof PEOPLE_CSV_COLUMNS)[number];

/** RFC 4180 escape: quote when the value contains a comma, quote, or newline;
 * double interior quotes. Empty/undefined → empty field. */
export function csvEscape(value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function personToRow(p: Person): string {
  const cells: Record<PeopleCsvColumn, string | undefined> = {
    id: p.id,
    kind: p.entityKind === "company" ? "company" : "person",
    name: p.name,
    business: p.business,
    role: p.role,
    verticalId: p.verticalId,
    phone: p.phone,
    email: p.email,
    website: p.website,
    referredById: p.referredById,
    relationship: p.relationship,
    status: p.status,
    notes: p.notes,
  };
  return PEOPLE_CSV_COLUMNS.map((c) => csvEscape(cells[c])).join(",");
}

/** Serialize people (real records only — demo rows dropped, see header note)
 * to a CSV string with header row. CRLF line endings per RFC 4180 so Excel
 * opens it clean on every platform. */
export function peopleToCsv(people: Person[]): string {
  const rows = people
    .filter((p) => !isDemo(p))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(personToRow);
  return [PEOPLE_CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** RFC 4180 parser: quoted fields, doubled interior quotes, commas/newlines
 * inside quotes, LF or CRLF endings. Returns raw rows of strings — header
 * mapping/validation is the import half's job (inc.2). Trailing blank line
 * (from the canonical trailing CRLF) is dropped; interior blank lines are
 * kept so import can report them by line number instead of silently skipping. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop a single trailing empty row produced by the canonical trailing newline.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") rows.pop();
  return rows;
}
