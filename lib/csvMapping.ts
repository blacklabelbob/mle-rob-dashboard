// Task 4.4 (Q35): field-mapping template for Rob's REAL lists — pure (CR-3).
// Rob's actual CSVs arrive with headers like "First Name,Last Name,Company,
// Cell Phone,Email Address", which the strict Task-4.3 planner rightly
// rejects. This module rewrites such a file into the canonical
// PEOPLE_CSV_COLUMNS format (alias table + First/Last combine) and then runs
// the UNCHANGED, already-proven planImport on the result — so every dedup /
// validation guarantee of Task 4.3 carries over by construction.
//
// Zero silent drops, columns included: every original header is accounted
// for in `mapping` (used) or `ignored` (reported to the UI before commit).
// Data rows are rewritten strictly 1:1, so the plan's line numbers still
// point at lines in Rob's original file.

import { Person } from "./types";
import { parseCsv, csvEscape, PEOPLE_CSV_COLUMNS, PeopleCsvColumn } from "./csv";
import { planImport, ImportPlan } from "./csvImport";
import { appendMachineNote } from "./notes";

// alias (normalized: lowercase, alnum only) → canonical column. Canonical
// names map to themselves via CANONICAL below, so a Task-4.3 export passes
// through untouched. "stage" is deliberately NOT aliased to status — real
// pipeline stages ("Contacted") aren't lit/warm/unlit and would just turn
// 50 rows into 50 errors; better an explicit ignored-column report.
const HEADER_ALIASES: Record<string, PeopleCsvColumn> = {
  fullname: "name",
  contactname: "name",
  contact: "name",
  company: "business",
  companyname: "business",
  organization: "business",
  org: "business",
  account: "business",
  businessname: "business",
  title: "role",
  jobtitle: "role",
  position: "role",
  phonenumber: "phone",
  cell: "phone",
  cellphone: "phone",
  cellnumber: "phone",
  mobile: "phone",
  mobilephone: "phone",
  telephone: "phone",
  tel: "phone",
  emailaddress: "email",
  mail: "email",
  url: "website",
  web: "website",
  site: "website",
  homepage: "website",
  vertical: "verticalId",
  industry: "verticalId",
  referredby: "referredById",
  referrer: "referredById",
  note: "notes",
  comments: "notes",
  description: "notes",
};

const FIRST_NAME = new Set(["firstname", "first", "givenname"]);
const LAST_NAME = new Set(["lastname", "last", "surname", "familyname"]);

const CANONICAL = new Map<string, PeopleCsvColumn>(
  PEOPLE_CSV_COLUMNS.map((c) => [c.toLowerCase(), c]),
);

function norm(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface MappedCsv {
  csv: string; // canonical-format CSV, ready for planImport
  mapping: Record<string, string>; // original header → canonical column it fed
  ignored: string[]; // original headers with no mapping — reported, never silent
}

/** Rewrite an arbitrary-header people CSV into canonical PEOPLE_CSV_COLUMNS
 * format. First/Last name columns combine into `name` (an explicit name
 * column wins if both exist); when two columns map to the same canonical
 * field, the first wins and later ones are reported as ignored. */
export function mapRealCsv(csvText: string): MappedCsv {
  const rows = parseCsv(csvText);
  if (!rows.length) return { csv: csvText, mapping: {}, ignored: [] };

  const header = rows[0].map((h) => h.trim());
  const mapping: Record<string, string> = {};
  const ignored: string[] = [];
  const colFor = new Map<PeopleCsvColumn, number>(); // canonical → source index
  let firstIdx = -1;
  let lastIdx = -1;

  header.forEach((h, i) => {
    const n = norm(h);
    const canonical = CANONICAL.get(n) ?? HEADER_ALIASES[n];
    if (canonical) {
      if (colFor.has(canonical)) {
        ignored.push(h); // second column feeding the same field — first wins
      } else {
        colFor.set(canonical, i);
        mapping[h] = canonical;
      }
      return;
    }
    if (FIRST_NAME.has(n) && firstIdx === -1) {
      firstIdx = i;
      return; // mapping entry decided below, once we know if `name` exists
    }
    if (LAST_NAME.has(n) && lastIdx === -1) {
      lastIdx = i;
      return;
    }
    ignored.push(h);
  });

  // First/Last combine only when there is no explicit name column.
  const combineName = !colFor.has("name") && (firstIdx !== -1 || lastIdx !== -1);
  if (firstIdx !== -1) {
    if (combineName) mapping[header[firstIdx]] = "name";
    else ignored.push(header[firstIdx]);
  }
  if (lastIdx !== -1) {
    if (combineName) mapping[header[lastIdx]] = "name";
    else ignored.push(header[lastIdx]);
  }

  const outCols = PEOPLE_CSV_COLUMNS.filter(
    (c) => colFor.has(c) || (c === "name" && combineName),
  );
  const lines: string[] = [outCols.join(",")];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((cell) => cell.trim() === "")) {
      lines.push(""); // keep blank lines so plan line numbers stay honest
      continue;
    }
    const cells = outCols.map((c) => {
      if (c === "name" && combineName) {
        const first = firstIdx === -1 ? "" : (row[firstIdx] ?? "").trim();
        const last = lastIdx === -1 ? "" : (row[lastIdx] ?? "").trim();
        return csvEscape([first, last].filter(Boolean).join(" "));
      }
      const i = colFor.get(c)!;
      return csvEscape((row[i] ?? "").trim());
    });
    lines.push(cells.join(","));
  }
  return { csv: lines.join("\r\n") + "\r\n", mapping, ignored };
}

export interface RealImportPlan extends ImportPlan {
  mapping: Record<string, string>;
  ignoredColumns: string[];
}

/** Task 4.4 pipeline: map Rob's real-list headers → run the Task-4.3
 * planner → optionally stamp each clean insert with an import tag (lands in
 * notes as `[import: <tag>]`, so every imported row stays attributable).
 * The stamp is its own notes block via appendMachineNote (Q43 punch #4) —
 * previously appended mid-line, where the splitter couldn't file it as
 * machine text and it rendered inside the human Notes box. */
export function planRealImport(
  csvText: string,
  existing: Person[],
  opts: { tag?: string } = {},
): RealImportPlan {
  const mapped = mapRealCsv(csvText);
  const plan = planImport(mapped.csv, existing);
  const tag = opts.tag?.trim();
  if (tag) {
    for (const p of plan.inserts) {
      p.notes = appendMachineNote(p.notes, `[import: ${tag}]`);
    }
  }
  return { ...plan, mapping: mapped.mapping, ignoredColumns: mapped.ignored };
}
