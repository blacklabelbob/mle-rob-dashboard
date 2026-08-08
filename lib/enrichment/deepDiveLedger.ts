/**
 * Q87 inc.3 — WHERE A DEEP-DIVE RUN GETS WRITTEN DOWN.
 *
 * inc.2 shipped the question (`deepDiveDue.ts`: is this org owed a deep dive?) and measured the
 * answer against prod: 4 referral targets, every one `due-unattributed` — background on the
 * record, nothing proving where it came from. That verdict exists because the caller had NO
 * provenance to hand in: `DeepDiveOptions.runs` was omitted entirely, everywhere, because there
 * was nowhere for a run to be recorded.
 *
 * This module is that place — and it is deliberately built BEFORE the pass that fires, because a
 * pass with nowhere to record itself re-creates the exact ambiguity inc.2 just measured.
 *
 * THE ONE RULE THAT MAKES THE LEDGER WORTH HAVING: it refuses, out loud, rather than accepting a
 * row it cannot stand behind. A ledger that quietly drops a malformed row, or quietly accepts a
 * run with no producer, would let `covered` be reached by an accident — which is the same
 * INCIDENT-LEDGER #22/#34 shape (silence read as a fact) one layer down from where inc.2 caught
 * it. So `parseLedger` returns BOTH the runs it accepted AND every row it rejected with the
 * reason, and no caller can get the accepted list without the rejected one being in its hand.
 *
 * APPEND-ONLY. A recorded run is never edited and never deleted here: a re-run appends. History
 * is the point — "this org was dived on 8/08 by X and again on 11/02 by Y" is a fact about the
 * record that a last-write-wins field would destroy.
 *
 * PURE (CR-3): no clock, no fs, no fetch, no Supabase. The caller reads the file, hands in the
 * JSON, hands in the day. Persistence lives in the script that calls this, never here.
 */

import type { DeepDiveRun } from "./deepDiveDue";

/** An ISO calendar day, exactly — `2026-08-08`. Not a timestamp, not a locale string. */
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RejectedRow {
  /** The row exactly as it appeared, so a human can find it in the file. */
  row: unknown;
  /** Zero-based index in the input array — the only way to point at an unnamed bad row. */
  index: number;
  /** Why it is not a run. Plain enough to paste into a flag. */
  reason: string;
}

export interface ParsedLedger {
  runs: DeepDiveRun[];
  rejected: RejectedRow[];
}

/** The on-disk shape. Versioned so a future format change is a decision, not a surprise. */
export interface LedgerFile {
  version: 1;
  /** What this file is, for whoever opens it without this module. */
  note?: string;
  runs: unknown[];
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function validateRow(row: unknown, index: number): DeepDiveRun | RejectedRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { row, index, reason: "not an object" };
  }
  const r = row as Record<string, unknown>;
  const orgId = text(r.orgId);
  const ranAt = text(r.ranAt);
  const producedBy = text(r.producedBy);

  if (!orgId) return { row, index, reason: "no orgId — a run that names no company is not evidence about any company" };
  if (!ranAt) return { row, index, reason: `no ranAt on ${orgId} — an undated run cannot be aged` };
  if (!ISO_DAY_RE.test(ranAt)) {
    return { row, index, reason: `ranAt "${ranAt}" on ${orgId} is not an ISO day (YYYY-MM-DD)` };
  }
  if (Number.isNaN(Date.parse(`${ranAt}T00:00:00Z`))) {
    return { row, index, reason: `ranAt "${ranAt}" on ${orgId} is shaped like a day but is not one` };
  }
  if (!producedBy) {
    return { row, index, reason: `no producedBy on ${orgId} — "a run with no producer is not a run" (deepDiveDue.ts)` };
  }
  return { orgId, ranAt, producedBy };
}

const isRejected = (v: DeepDiveRun | RejectedRow): v is RejectedRow =>
  Object.prototype.hasOwnProperty.call(v, "reason");

/**
 * Read a ledger. Accepts the file object or a bare array of rows; anything else is a whole-file
 * rejection rather than an exception, because a driver that crashes on a bad file tells the
 * operator less than one that names the problem and carries on with zero runs.
 */
export function parseLedger(input: unknown): ParsedLedger {
  let rows: unknown[];
  if (Array.isArray(input)) {
    rows = input;
  } else if (input && typeof input === "object" && Array.isArray((input as LedgerFile).runs)) {
    rows = (input as LedgerFile).runs;
  } else {
    return {
      runs: [],
      rejected: [{ row: input, index: -1, reason: "ledger is neither an array of runs nor an object with a runs array" }],
    };
  }

  const runs: DeepDiveRun[] = [];
  const rejected: RejectedRow[] = [];
  for (const [index, row] of rows.entries()) {
    const result = validateRow(row, index);
    if (isRejected(result)) rejected.push(result);
    else runs.push(result);
  }
  return { runs, rejected };
}

export interface RecordResult {
  ledger: LedgerFile;
  /** `appended` — written down. `duplicate` — this exact run is already on file. */
  outcome: "appended" | "duplicate";
  /** Rows already in the file that this module could not accept; carried, never silently dropped. */
  rejected: RejectedRow[];
}

const sameRun = (a: DeepDiveRun, b: DeepDiveRun) =>
  a.orgId === b.orgId && a.ranAt === b.ranAt && a.producedBy === b.producedBy;

/**
 * Append a run. Throws only on a run this module refuses to write — writing an invalid row would
 * mean the file's own reader rejects it later, which is a lie told slowly.
 *
 * A byte-identical run (same org, same day, same producer) is a no-op, so a driver that runs
 * twice in one day does not stack duplicates. A run by a DIFFERENT producer on the same day IS
 * appended — two passes did happen and the ledger says so.
 */
export function recordRun(existing: unknown, run: DeepDiveRun): RecordResult {
  const check = validateRow(run, -1);
  if (isRejected(check)) throw new Error(`refusing to record run: ${check.reason}`);

  const parsed = parseLedger(existing ?? { version: 1, runs: [] });
  const base: LedgerFile = {
    version: 1,
    note:
      existing && typeof existing === "object" && !Array.isArray(existing) && text((existing as LedgerFile).note)
        ? (existing as LedgerFile).note
        : "Deep-dive runs, append-only. A row here is the ONLY thing that lets deepDiveDue.ts say 'covered'.",
    runs: parsed.runs,
  };

  if (parsed.runs.some((r) => sameRun(r, check))) {
    return { ledger: base, outcome: "duplicate", rejected: parsed.rejected };
  }
  return {
    ledger: { ...base, runs: [...parsed.runs, check] },
    outcome: "appended",
    rejected: parsed.rejected,
  };
}

/** Stable JSON for the file — sorted by org then day so a diff shows the run, not a reshuffle. */
export function serializeLedger(ledger: LedgerFile): string {
  const runs = [...(ledger.runs as DeepDiveRun[])].sort(
    (a, b) => a.orgId.localeCompare(b.orgId) || a.ranAt.localeCompare(b.ranAt) || a.producedBy.localeCompare(b.producedBy),
  );
  return `${JSON.stringify({ ...ledger, runs }, null, 2)}\n`;
}
