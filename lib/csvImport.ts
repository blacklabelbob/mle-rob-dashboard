// Task 4.3 (Q34) import half: CSV → validated insert plan, pure (CR-3).
// The route does store I/O only; every parse/validate/dedup decision lives
// here so the same input always yields the same plan.
//
// Core promise (PRD Task 4.3 DoD): dupes are FLAGGED, never silently
// created. Every incoming row is checked against the live ledger AND the
// other rows in the same file with the Task 3.5/4.2 matcher
// (exact-after-normalization on email/phone/name — deliberately no fuzzy
// matching, same rationale as lib/dedup/match.ts). An id collision with an
// existing record is also a dupe (import never overwrites — edits belong to
// the record pages, and money/signed fields never enter via CSV at all:
// PEOPLE_CSV_COLUMNS simply has no such column).

import { Person } from "./types";
import { isDemo } from "./stats";
import { parseCsv, PEOPLE_CSV_COLUMNS, PeopleCsvColumn } from "./csv";
import { findDuplicatePairs, DedupRecord } from "./dedup/match";
import { handleFor, isRecordId, nextPersonId, slugifyHandle } from "./recordId";

export interface ImportError {
  line: number; // 1-based line in the file (header = line 1)
  reason: string;
}

export interface ImportDupe {
  line: number;
  name: string;
  matchId: string; // the record it collides with (existing or earlier row)
  matchWhere: "ledger" | "file"; // live data vs earlier line in the same CSV
  signals: string[]; // "id-exact" | matcher signals
  evidence: string[];
}

export interface ImportPlan {
  inserts: Person[]; // clean rows, ready for upsertPerson
  dupes: ImportDupe[]; // flagged, never inserted
  errors: ImportError[]; // structural problems, never inserted
}

// Q70 inc.10 — the THIRD create path, and the last one still minting names as ids.
//
// This file used to own a private `nextId()` that was `slugify(name)` with a `-2` suffix on
// collision: the exact scheme 0031 renumbered every row out of, and `dana-reyes-2` by a
// third name. Identity now comes from lib/recordId.ts like every other writer.
//
// THE DESIGN CALL Q70 inc.9 FILED RATHER THAN GUESS — what does a CSV's `id` column mean?
// It means whichever of the two it can only be:
//
//   `P-1043` / `C-2007`  → an ID. Record-shaped, so it can only have come from this scheme.
//   `caleb-green`        → a HANDLE. After 0031 no row's id is a slug, so a slug in an id
//                          column is a pre-0031 export, a bookmark, or a human typing the
//                          name they see in a URL. Honouring it as an id would re-open the
//                          defect through the one door left unlocked.
//
// A supplied handle still gets matched against the ledger for the dupe check (that is the
// point of keeping `legacy_slug` forever), and is then CARRIED as the row's handle while the
// id itself is minted as a record number. Nothing is silently dropped, nothing overwrites.
//
// Same rule for `referredById`: a CSV that says `caleb-green` refers to whichever row now
// answers to that handle. Before this, such a file failed the whole line as an unknown
// referrer — correct-looking data, rejected, because the ledger had been renumbered under it.

/** Where a supplied id-column value lands, and what it already collides with. */
function resolveSupplied(value: string, byId: Set<string>, byHandle: Map<string, string>) {
  if (isRecordId(value)) {
    return { asId: value, asHandle: undefined, collidesWith: byId.has(value) ? value : undefined };
  }
  const handle = slugifyHandle(value);
  return { asId: undefined, asHandle: handle, collidesWith: byHandle.get(handle) };
}

function rowIsBlank(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

const VALID_STATUS = new Set(["lit", "warm", "unlit"]);

export function planImport(csvText: string, existing: Person[]): ImportPlan {
  const plan: ImportPlan = { inserts: [], dupes: [], errors: [] };
  const rows = parseCsv(csvText);
  if (!rows.length) {
    plan.errors.push({ line: 1, reason: "empty file" });
    return plan;
  }

  // Header: any subset/order of the export columns, but "name" must be there.
  const header = rows[0].map((h) => h.trim());
  const known = new Set<string>(PEOPLE_CSV_COLUMNS);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length) {
    plan.errors.push({
      line: 1,
      reason: `unknown column(s): ${unknown.join(", ")} — expected a subset of: ${PEOPLE_CSV_COLUMNS.join(", ")}`,
    });
    return plan;
  }
  const col = new Map<PeopleCsvColumn, number>();
  header.forEach((h, i) => col.set(h as PeopleCsvColumn, i));
  if (!col.has("name")) {
    plan.errors.push({ line: 1, reason: 'header is missing the required "name" column' });
    return plan;
  }
  const cell = (row: string[], c: PeopleCsvColumn): string => {
    const i = col.get(c);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  // Ids already taken: EVERY existing id (demo included — an id clash is an
  // id clash) plus ids minted for earlier rows of this file.
  const taken = new Set(existing.map((p) => p.id));
  const existingIds = new Set(taken);
  // Handles are tracked SEPARATELY and seeded from `legacySlug ?? id` — a pre-0031 row
  // carries its handle in its id. De-duplicating a handle against the id set is the defect
  // inc.4/inc.9 kept finding: post-0031 those hold `P-####`, so a name-handle checked
  // against them can never collide and the de-duplication dies into a unique violation.
  const takenHandles = new Map<string, string>(
    existing.map((p) => [p.legacySlug ?? p.id, p.id] as const),
  );
  const existingHandles = new Map(takenHandles);
  // A referrer may be named by either shape, for as long as old exports exist — forever.
  const referrerByRef = new Map<string, string>(existing.map((p) => [p.id, p.id] as const));
  for (const [handle, id] of takenHandles) referrerByRef.set(handle, id);

  interface Candidate {
    line: number;
    person: Person;
  }
  const candidates: Candidate[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const row = rows[r];
    if (rowIsBlank(row)) {
      plan.errors.push({ line, reason: "blank line" });
      continue;
    }
    if (row.length !== header.length) {
      plan.errors.push({
        line,
        reason: `expected ${header.length} column(s), got ${row.length}`,
      });
      continue;
    }
    const name = cell(row, "name");
    if (!name) {
      plan.errors.push({ line, reason: 'missing required "name"' });
      continue;
    }
    const givenId = cell(row, "id");
    const supplied = givenId ? resolveSupplied(givenId, taken, takenHandles) : undefined;
    if (supplied?.collidesWith) {
      // Import never overwrites: an existing record is a duplicate, not an edit. Whether
      // the file named it by record number or by the handle it used to be called, it is
      // the same row, and it is already here.
      const onLedger = supplied.asId
        ? existingIds.has(supplied.asId)
        : existingHandles.has(supplied.asHandle!);
      plan.dupes.push({
        line,
        name,
        matchId: supplied.collidesWith,
        matchWhere: onLedger ? "ledger" : "file",
        signals: ["id-exact"],
        evidence: [
          `${supplied.asId ? "id" : "handle"} "${givenId}" ${
            onLedger ? "already exists on the ledger" : "appears earlier in this file"
          }`,
        ],
      });
      continue;
    }
    const status = cell(row, "status");
    if (status && !VALID_STATUS.has(status)) {
      plan.errors.push({
        line,
        reason: `invalid status "${status}" — expected lit, warm, or unlit`,
      });
      continue;
    }
    const referredByRef = cell(row, "referredById");
    const referredById = referredByRef ? referrerByRef.get(referredByRef) : undefined;
    if (referredByRef && !referredById) {
      // Dangling referrer would be a broken graph edge (and an FK reject in
      // split mode) — report it instead of silently dropping the link.
      plan.errors.push({
        line,
        reason: `unknown referredById "${referredByRef}" — not on the ledger or earlier in this file`,
      });
      continue;
    }
    // The id is always a record number; a supplied slug becomes the row's handle instead.
    const id = supplied?.asId ?? nextPersonId(taken);
    const legacySlug = supplied?.asHandle ?? handleFor(name, "imported", takenHandles.keys());
    taken.add(id);
    takenHandles.set(legacySlug, id);
    referrerByRef.set(id, id);
    referrerByRef.set(legacySlug, id);
    const opt = (c: PeopleCsvColumn): string | undefined => cell(row, c) || undefined;
    candidates.push({
      line,
      person: {
        id,
        legacySlug,
        name,
        entityKind: cell(row, "kind") === "company" ? "company" : "person",
        business: opt("business"),
        role: opt("role"),
        verticalId: cell(row, "verticalId"),
        phone: opt("phone"),
        email: opt("email"),
        website: opt("website"),
        referredById: referredById || undefined,
        relationship: opt("relationship"),
        notes: opt("notes"),
        status: (status || "unlit") as Person["status"],
        signed: false,
        keyDates: {},
        phaseOne: "not-started",
      },
    });
  }

  // Matcher pass: candidates vs the real ledger (demo rows excluded — a
  // collision with seeded demo data is not a real dupe) and vs each other.
  const ledger: DedupRecord[] = existing
    .filter((p) => !isDemo(p))
    .map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone }));
  const candidateById = new Map(candidates.map((c) => [c.person.id, c]));
  const pairs = findDuplicatePairs([
    ...ledger,
    ...candidates.map((c) => ({
      id: c.person.id,
      name: c.person.name,
      email: c.person.email,
      phone: c.person.phone,
    })),
  ]);
  const flagged = new Set<string>();
  for (const pair of pairs) {
    const a = candidateById.get(pair.aId);
    const b = candidateById.get(pair.bId);
    if (!a && !b) continue; // two ledger rows — the dedup queue's business, not ours
    // Candidate↔ledger: flag the candidate. Candidate↔candidate: keep the
    // earlier line, flag the later one.
    const drop = a && b ? (a.line > b.line ? a : b) : (a ?? b)!;
    const keptId = drop === a ? pair.bId : pair.aId;
    if (flagged.has(drop.person.id)) continue;
    flagged.add(drop.person.id);
    plan.dupes.push({
      line: drop.line,
      name: drop.person.name,
      matchId: keptId,
      matchWhere: candidateById.has(keptId) ? "file" : "ledger",
      signals: pair.signals,
      evidence: pair.evidence,
    });
  }
  plan.inserts = candidates.filter((c) => !flagged.has(c.person.id)).map((c) => c.person);
  plan.dupes.sort((a, b) => a.line - b.line);
  return plan;
}
