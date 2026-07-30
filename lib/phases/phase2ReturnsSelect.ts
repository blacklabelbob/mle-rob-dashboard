// Q63 leg (5) inc.4: the freshest-wins selector. Pure — decides WHICH stored
// measurement drives a customer's ROI guarantee.
//
// inc.2 shipped a read that deliberately does NOT order and does NOT filter, and
// said why in its own header: ordering in SQL would create a second ordering
// authority that can silently disagree with the tested one, and a
// `superseded_at is null` filter would make "this measurement was retracted"
// indistinguishable from "this measurement never happened". This file is the
// authority that read left out. The row it picks IS the number on the page.
//
// THE RULES, AND WHY EACH ONE EXISTS:
//
//   • FRESHEST BY `measured_at`, NEVER BY WRITE TIME. `measured_at` is the instant
//     the measurement DESCRIBES; `created_at`/`updated_at` are when someone typed
//     it. A March reading entered late would otherwise outrank July's and the page
//     would report a quarter-old figure as current — silently, and correctly
//     ordered by the wrong clock.
//
//   • RETRACTED ROWS ARE NEVER SELECTED, ALWAYS REPORTED. `superseded_at` is the
//     retraction verb inc.3 built. Selecting one would resurrect a reading someone
//     deliberately pulled; dropping it without a word would make a customer we
//     measured-then-retracted read identically to one we never measured. It is set
//     aside WITH its reason, so the two stay different sentences.
//
//   • UNREADABLE IS REFUSED, NEVER COERCED — AND THE STALENESS IT CAUSES IS
//     ANNOUNCED. A row whose numbers came back null (inc.2 never defaults them to
//     0, because 0 hours saved is a real measurement the engine reads as a total
//     shortfall) cannot be computed from. But quietly falling through to an older
//     readable row would print a stale figure with no sign that a newer one exists,
//     so `newerUnusable` says so and the surface can.
//
//   • THE READABILITY TEST IS THE WRITE DOOR'S TEST, NOT A SECOND OPINION.
//     Negative revenue allowed, negative hours and rates not; basis required and
//     never defaulted; attribution required. A row `planPhase2ReturnsWrite`
//     accepted is a row this selects, or the two doors disagree and a measurement
//     someone took renders as never taken.
//
//   • TWO DIFFERENT NUMBERS ON THE SAME INSTANT SELECT NOTHING. inc.3's upsert on
//     `(customer_id, measured_at)` makes this unreachable through the app, so its
//     existence means someone wrote SQL by hand. Picking either one would put a
//     number under a money guarantee that a coin flip chose. Identical duplicates
//     are not ambiguous — same numbers, same answer.
//
//   • A ROW FOR ANOTHER CUSTOMER IS REFUSED WHEN WE KNOW WHOSE PAGE THIS IS. The
//     carrier filters by `customer_id`, so this can only fire if a caller hands the
//     selector a mixed list — and one customer's returns computing another's
//     guarantee is the worst outcome in this leg.
//
// CR-3: pure and stateless. No clock read, no database, no `asOf` needed — freshest
// is relative to the rows, not to now.

import type { Phase2Returns, Phase2ReturnsProvenance } from "./phase2Guarantee";
import type { Phase2ReturnsRow } from "./phase2ReturnsDb";
import { REVENUE_BASES, type RevenueBasis } from "./phase2ReturnsWrite";

/** Why a stored row was set aside. Every excluded row carries one. */
export type Phase2ReturnsExclusion =
  | "retracted"
  | "unreadable"
  | "ambiguous_instant"
  | "wrong_customer";

export interface Phase2ReturnsExcluded {
  /** The row's `measured_at` as stored — `null` when that is what made it unreadable. */
  measuredAt: string | null;
  reason: Phase2ReturnsExclusion;
}

export interface Phase2ReturnsSelection {
  /** The numbers the engine computes from. Absent = nothing selectable. */
  returns?: Phase2Returns;
  /** Provenance of the selected row — display and audit only; never arithmetic. */
  measuredAt?: string;
  measuredBy?: string;
  revenueBasis?: RevenueBasis;
  source?: string | null;
  note?: string | null;
  /** Rows on file that were not selected, each with why. Never silently dropped. */
  excluded: Phase2ReturnsExcluded[];
  /**
   * A measurement NEWER than the selected one exists and could not be used
   * (unreadable, or two contradictory rows on one instant). The selected figure is
   * therefore stale in a way the date alone does not reveal.
   */
  newerUnusable: boolean;
  /** Rows handed to the selector, retracted and unreadable included. */
  considered: number;
}

/**
 * The four provenance facts the ROI sentence needs, lifted off a selection.
 *
 * Explicit rather than passing the whole selection through: `excluded` and
 * `considered` are audit detail that has no business inside a money guarantee's
 * status object, and structural assignability would carry them there silently.
 *
 * A selection with no `returns` yields `undefined` — there is no figure, so there
 * is no figure's provenance, and an object of nulls would read as "measured, by
 * nobody, on no basis".
 */
export function provenanceOf(
  selection: Phase2ReturnsSelection,
): Phase2ReturnsProvenance | undefined {
  if (!selection.returns) return undefined;
  return {
    measuredAt: selection.measuredAt ?? null,
    measuredBy: selection.measuredBy ?? null,
    revenueBasis: selection.revenueBasis,
    newerUnusable: selection.newerUnusable,
  };
}

/** A row that passed every readability rule, with its instant normalised. */
interface UsableRow {
  instantMs: number;
  measuredAt: string;
  measuredBy: string;
  revenueBasis: RevenueBasis;
  returns: Phase2Returns;
  source: string | null;
  note: string | null;
}

/**
 * The write door's number predicate, applied on the way out.
 *
 * `null` never becomes 0 here for the same reason inc.2 refuses to coerce it: a
 * column that cannot be read is not a customer who saved nothing.
 */
function usableNumber(v: number | null, { allowNegative = false } = {}): v is number {
  return typeof v === "number" && Number.isFinite(v) && (allowNegative || v >= 0);
}

function isBasis(v: unknown): v is RevenueBasis {
  return typeof v === "string" && REVENUE_BASES.includes(v as RevenueBasis);
}

/** A stored row → the usable shape, or `null` if any rule refuses it. */
function readRow(row: Phase2ReturnsRow): UsableRow | null {
  if (!row.measured_at) return null;
  const ms = Date.parse(row.measured_at);
  if (Number.isNaN(ms)) return null;
  // Attribution is required on the way in; a row that cannot say who produced it
  // cannot be defended when the customer asks, so it is not defended here either.
  if (!row.measured_by) return null;
  if (!isBasis(row.revenue_basis)) return null;
  if (!usableNumber(row.labor_hours_saved)) return null;
  if (!usableNumber(row.labor_cost_per_hour)) return null;
  if (!usableNumber(row.revenue_since_phase2_start, { allowNegative: true })) return null;
  return {
    instantMs: ms,
    measuredAt: row.measured_at,
    measuredBy: row.measured_by,
    revenueBasis: row.revenue_basis,
    returns: {
      laborHoursSaved: row.labor_hours_saved,
      laborCostPerHour: row.labor_cost_per_hour,
      revenueSincePhase2Start: row.revenue_since_phase2_start,
    },
    source: row.source,
    note: row.note,
  };
}

/** Two readable rows on the same instant agree only if all three numbers match. */
function sameNumbers(a: UsableRow, b: UsableRow): boolean {
  return (
    a.returns.laborHoursSaved === b.returns.laborHoursSaved &&
    a.returns.laborCostPerHour === b.returns.laborCostPerHour &&
    a.returns.revenueSincePhase2Start === b.returns.revenueSincePhase2Start
  );
}

/**
 * Every stored measurement for one customer → the one that drives the guarantee.
 *
 * Feed `selection.returns` straight to `phase2Guarantee`: absent means AWAITING_DATA
 * and that is the honest answer, but `excluded` and `newerUnusable` are what let a
 * surface say WHY — retracted, unreadable, or contradicted — instead of repeating
 * "not measured yet" about a customer we measured.
 */
export function selectPhase2Returns(
  rows: readonly Phase2ReturnsRow[] | null | undefined,
  opts: { customerId?: string } = {},
): Phase2ReturnsSelection {
  const all = Array.isArray(rows) ? rows : [];
  const excluded: Phase2ReturnsExcluded[] = [];
  const usable: UsableRow[] = [];
  const expected = typeof opts.customerId === "string" ? opts.customerId.trim() : "";

  for (const row of all) {
    if (expected && row.customer_id !== expected) {
      excluded.push({ measuredAt: row.measured_at, reason: "wrong_customer" });
      continue;
    }
    // Retraction is checked BEFORE readability: a retracted row reported as
    // "unreadable" would send someone hunting a data defect for a deliberate act.
    if (row.superseded_at) {
      excluded.push({ measuredAt: row.measured_at, reason: "retracted" });
      continue;
    }
    const read = readRow(row);
    if (!read) {
      excluded.push({ measuredAt: row.measured_at, reason: "unreadable" });
      continue;
    }
    usable.push(read);
  }

  // Freshest first. The comparison is on parsed instants, never on the raw strings:
  // `2026-07-01T00:00:00Z` and `2026-07-01T00:00:00.000+00:00` are the same moment
  // and sort differently as text.
  usable.sort((a, b) => b.instantMs - a.instantMs);

  let chosen: UsableRow | undefined;
  let ambiguousMs: number | null = null;
  for (let i = 0; i < usable.length; i += 1) {
    const candidate = usable[i];
    const ties = usable.filter((r) => r.instantMs === candidate.instantMs);
    if (ties.length > 1 && ties.some((r) => !sameNumbers(r, candidate))) {
      // Contradiction on one instant: set the whole instant aside rather than pick.
      for (const tie of ties) {
        excluded.push({ measuredAt: tie.measuredAt, reason: "ambiguous_instant" });
      }
      ambiguousMs ??= candidate.instantMs;
      // Skip the rest of this instant and keep looking at older ones.
      while (i + 1 < usable.length && usable[i + 1].instantMs === candidate.instantMs) i += 1;
      continue;
    }
    chosen = candidate;
    break;
  }

  // A newer row we could not use is what makes the chosen figure quietly stale.
  const newerUnusable = chosen
    ? excluded.some(
        (e) =>
          (e.reason === "unreadable" || e.reason === "ambiguous_instant") &&
          isNewerThan(e.measuredAt, chosen.instantMs),
      ) || (ambiguousMs !== null && ambiguousMs > chosen.instantMs)
    : false;

  if (!chosen) {
    return { excluded, newerUnusable: false, considered: all.length };
  }

  return {
    returns: chosen.returns,
    measuredAt: chosen.measuredAt,
    measuredBy: chosen.measuredBy,
    revenueBasis: chosen.revenueBasis,
    source: chosen.source,
    note: chosen.note,
    excluded,
    newerUnusable,
    considered: all.length,
  };
}

/**
 * Whether an excluded row's date is newer than the selected instant.
 *
 * An unparseable or missing date answers `false` — it is not evidence of a newer
 * measurement, and treating it as one would flag every readable figure as stale on
 * the strength of a row whose date nobody can read.
 */
function isNewerThan(measuredAt: string | null, instantMs: number): boolean {
  if (!measuredAt) return false;
  const ms = Date.parse(measuredAt);
  return !Number.isNaN(ms) && ms > instantMs;
}
