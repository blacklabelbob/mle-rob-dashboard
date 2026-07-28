// Q40 leg (6) inc.16: stored picks → the shortlist the panel is handed. Pure.
//
// inc.14 decided WHEN to recommend and inc.15 put it on screen; both take
// `recommendations` as a parameter nothing supplies, so every company on prod
// correctly reads SCAN_NO_PICKS. 0027 is the store. This module is the seam
// between them, and it is separate from the loader for the same reason
// componentStateRow is separate from componentStateDb (CR-3): what a paying
// customer gets pitched is decided here, in code with tests on it, not inside a
// Supabase call where the ordering is whatever the query happened to return.
//
// THE THREE THINGS THAT CAN GO WRONG SILENTLY, and where each is stopped:
//
//   1. ORDER. The panel shows `slotCount` picks and names the rest as overflow.
//      Which ones make the cut IS the pitch. An unordered read means two loads of
//      the same record can pitch different automations with nobody editing
//      anything — so the sort here is total: rank, then recorded_at, then pick_id.
//
//   2. WITHDRAWN PICKS. Taking a recommendation back is a decision with a date.
//      A withdrawn row that leaks through is a pitch nobody currently stands
//      behind, so it is filtered here rather than by whoever writes the query.
//
//   3. UNUSABLE ROWS. A row with no id or no label cannot be rendered. Dropping it
//      quietly would shorten a customer's shortlist invisibly, so drops are
//      RETURNED and counted (the no-silent-caps rule), never swallowed.

import type { AutomationPick } from "./aimForNext";

/** One row of `phase_scan_picks` (0027), in the shape Postgres holds it. */
export interface ScanPickRow {
  customer_id: string;
  pick_id: string;
  label: string;
  why: string | null;
  rank: number | null;
  recorded_by: string | null;
  recorded_at: string | null;
  withdrawn_at: string | null;
  source: string | null;
}

export type ScanPickSkipReason = "no_pick_id" | "no_label" | "duplicate_pick_id";

export interface SkippedScanPick {
  pickId: string;
  reason: ScanPickSkipReason;
}

export interface ScanPicksResult {
  /** Ready for `buildBlueprint({ automationPicks })`. Ordered, live picks only. */
  picks: AutomationPick[];
  /** Rows that were withdrawn — excluded on purpose, not a fault. */
  withdrawn: number;
  /** Rows that could not be shown. Named so a gap is never invisible. */
  skipped: SkippedScanPick[];
}

function trimmed(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The shortlist for one customer, from their stored rows.
 *
 * `rank` missing sorts as 0 rather than last: an importer that forgets the column
 * should produce a shortlist ordered by when the picks were recorded, not one
 * whose unranked entries are pushed past the slot cut and reported as overflow
 * the customer will never be shown.
 *
 * Duplicate `pick_id` is impossible under 0027's unique index, so a duplicate here
 * means the rows did not come from that table (a fixture, a merged read). The
 * first wins and the second is REPORTED — silently keeping one of two rows that
 * disagree is how a stale label survives a correction.
 */
export function scanPicksFromRows(rows: ScanPickRow[] | null | undefined): ScanPicksResult {
  const skipped: SkippedScanPick[] = [];
  let withdrawn = 0;
  const seen = new Set<string>();

  const usable = (rows ?? []).filter((row) => {
    const pickId = trimmed(row?.pick_id);
    if (!pickId) {
      skipped.push({ pickId: "", reason: "no_pick_id" });
      return false;
    }
    // Withdrawn is checked before label so a taken-back pick is never also
    // reported as a broken row — it is not broken, it is retired.
    if (trimmed(row.withdrawn_at)) {
      withdrawn += 1;
      return false;
    }
    if (!trimmed(row.label)) {
      skipped.push({ pickId, reason: "no_label" });
      return false;
    }
    if (seen.has(pickId)) {
      skipped.push({ pickId, reason: "duplicate_pick_id" });
      return false;
    }
    seen.add(pickId);
    return true;
  });

  usable.sort((a, b) => {
    const byRank = (a.rank ?? 0) - (b.rank ?? 0);
    if (byRank !== 0) return byRank;
    const byDate = trimmed(a.recorded_at).localeCompare(trimmed(b.recorded_at));
    if (byDate !== 0) return byDate;
    return trimmed(a.pick_id).localeCompare(trimmed(b.pick_id));
  });

  return {
    picks: usable.map((row) => {
      const why = trimmed(row.why);
      return {
        id: trimmed(row.pick_id),
        label: trimmed(row.label),
        // Absent as a key, not an empty string: `why` is "one line of why it was
        // picked for THIS customer", and an empty line rendered under a pick reads
        // as a reason nobody wrote.
        ...(why ? { why } : {}),
      };
    }),
    withdrawn,
    skipped,
  };
}
