// Q63 leg (5) inc.1: the write door for measured Phase 2 returns. Pure — decides
// what may be stored.
//
// `blueprint.ts:136` states the gap in its own comment: "There is no store for
// these yet, so this is absent today and the guarantee reports AWAITING_DATA".
// That is why EVERY customer on prod reads *"Hours saved and revenue since Phase 2
// started have not been measured yet"* — not because nobody measured, but because
// there is nowhere to put it. `phase2Guarantee` and `computePhase2Roi` are both
// built and tested; the running ROI is one missing table away, and this module is
// that table's judgement, kept out of the carrier per CR-3 for the same reason
// `scanPicksWrite` is kept out of `scanPicksDb`.
//
// A MEASUREMENT IS A CLAIM ABOUT MONEY ROB HAS PUT HIS NAME TO. The number this
// row produces is what tells a paying customer whether the 3-month guarantee is in
// surplus or shortfall — i.e. whether Rob owes them. Every refusal below exists
// because storing the row instead would print a figure over something nobody
// actually measured.
//
//   • ALL THREE COMPONENTS OR NONE. Hours, rate and revenue are refused as a set,
//     never merged into whatever was stored last. A row carrying June's hours and
//     July's revenue computes a ratio describing no period that ever existed, and
//     it is indistinguishable, on the page, from a measurement someone took.
//
//   • THE REVENUE BASIS IS REQUIRED AND STORED — IT IS NOT DEFAULTED. Rob's Open
//     Question A (`revenueSincePhase2Start`: top-line vs attributable) is still
//     unanswered, and defaulting would answer it for him silently, in a column,
//     under a number he shows customers. Requiring the basis means every stored
//     measurement says WHICH question it answers, so Rob's eventual ruling becomes
//     a filter over honest rows rather than a re-measurement of ambiguous ones.
//     This is the whole reason this leg could be built while that question is open.
//
//   • ZERO IS A MEASUREMENT; ABSENT IS NOT. "We saved 0 hours" is a finding a rep
//     may legitimately record. A missing field is the absence of one, and the two
//     must never collapse — `phase2Guarantee` exists precisely to keep
//     never-measured from rendering as a 100% shortfall.
//
//   • NEGATIVE REVENUE IS ALLOWED; NEGATIVE HOURS AND RATES ARE NOT. Deliberately
//     the SAME rule as `phase2Guarantee.usableReturns`, not a second opinion: a
//     refund month is real money and the engine allows it, while negative hours
//     saved or a negative wage are arithmetic that cannot describe any month. If
//     this door were stricter, a stored row would render as AWAITING_DATA — a
//     measurement someone took, reported as never taken.
//
//   • HOURS AND RATE ARE STORED SEPARATELY, NEVER PRE-MULTIPLIED. The product is
//     the engine's to compute (CR-3). A stored `laborValue` would be a second copy
//     of Rob's formula, and the copy is the one that goes stale.
//
//   • A MEASUREMENT WITHOUT A DATE IS REFUSED. `measured_at` is what lets a stale
//     figure be seen as stale; without it, March's reading renders as today's
//     forever, and the freshest-wins ordering has nothing to order by.
//
//   • ATTRIBUTION IS REQUIRED. A figure driving a money guarantee that cannot say
//     who produced it cannot be defended when the customer asks.

import type { Phase2Returns } from "./phase2Guarantee";

/** How `revenueSincePhase2Start` was counted. Stored; never inferred. */
export type RevenueBasis = "top_line" | "attributed";

export const REVENUE_BASES: readonly RevenueBasis[] = ["top_line", "attributed"];

/** One measurement as a caller submits it. */
export interface Phase2ReturnsSubmission {
  customerId: string;
  laborHoursSaved: number;
  laborCostPerHour: number;
  revenueSincePhase2Start: number;
  /** Which revenue question this number answers. Required — see the header. */
  revenueBasis: RevenueBasis;
  /** ISO instant the measurement describes. Required. */
  measuredAt: string;
  /** Who measured. Required. */
  measuredBy: string;
  /** Where it came from (admin UI, import). Optional, stored as given. */
  source?: string | null;
  /** Free-text note from the measurer. Optional. */
  note?: string | null;
}

/** A row ready for upsert against `phase2_returns_identity` (customer, measured_at). */
export interface Phase2ReturnsWriteRow {
  customer_id: string;
  labor_hours_saved: number;
  labor_cost_per_hour: number;
  revenue_since_phase2_start: number;
  revenue_basis: RevenueBasis;
  measured_at: string;
  measured_by: string;
  source: string | null;
  note: string | null;
}

export type Phase2ReturnsRefusal =
  | "no_customer_id"
  | "no_measured_by"
  | "no_measured_at"
  | "bad_measured_at"
  | "no_revenue_basis"
  | "bad_revenue_basis"
  | "bad_labor_hours_saved"
  | "bad_labor_cost_per_hour"
  | "bad_revenue";

export interface Phase2ReturnsWritePlan {
  /** The row to upsert. Absent whenever `refusals` is non-empty — all-or-nothing. */
  row?: Phase2ReturnsWriteRow;
  refusals: { field: string; reason: Phase2ReturnsRefusal }[];
}

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The same predicate `phase2Guarantee` applies on the way OUT, applied on the way
 * IN — so a row this door accepts is a row that door will compute from.
 */
function usableNumber(v: unknown, { allowNegative = false } = {}): v is number {
  return typeof v === "number" && Number.isFinite(v) && (allowNegative || v >= 0);
}

/** ISO-parseable and normalised, so two callers' formats sort against each other. */
function isoInstant(raw: string): string | null {
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * A submitted measurement → the row that may be stored, or the reasons it may not.
 *
 * ALL-OR-NOTHING, because a partial measurement is the one outcome nobody can see:
 * two of three components stored against a third left at whatever was there before
 * produces a ratio that looks measured and describes nothing.
 *
 * Every refusal is collected rather than thrown on the first — a human fixing an
 * entry wants the whole list, not one field per round trip.
 */
export function planPhase2ReturnsWrite(
  submission: Phase2ReturnsSubmission,
): Phase2ReturnsWritePlan {
  const refusals: Phase2ReturnsWritePlan["refusals"] = [];

  const customerId = trimmed(submission?.customerId);
  if (!customerId) refusals.push({ field: "customerId", reason: "no_customer_id" });

  const measuredBy = trimmed(submission?.measuredBy);
  if (!measuredBy) refusals.push({ field: "measuredBy", reason: "no_measured_by" });

  const rawMeasuredAt = trimmed(submission?.measuredAt);
  let measuredAt: string | null = null;
  if (!rawMeasuredAt) {
    refusals.push({ field: "measuredAt", reason: "no_measured_at" });
  } else {
    measuredAt = isoInstant(rawMeasuredAt);
    if (!measuredAt) refusals.push({ field: "measuredAt", reason: "bad_measured_at" });
  }

  const rawBasis = trimmed(submission?.revenueBasis);
  if (!rawBasis) {
    refusals.push({ field: "revenueBasis", reason: "no_revenue_basis" });
  } else if (!REVENUE_BASES.includes(rawBasis as RevenueBasis)) {
    // An unrecognised basis is refused, never coerced to a known one: the whole
    // point of the column is that the row says which question it answers.
    refusals.push({ field: "revenueBasis", reason: "bad_revenue_basis" });
  }

  if (!usableNumber(submission?.laborHoursSaved)) {
    refusals.push({ field: "laborHoursSaved", reason: "bad_labor_hours_saved" });
  }
  if (!usableNumber(submission?.laborCostPerHour)) {
    refusals.push({ field: "laborCostPerHour", reason: "bad_labor_cost_per_hour" });
  }
  if (!usableNumber(submission?.revenueSincePhase2Start, { allowNegative: true })) {
    refusals.push({ field: "revenueSincePhase2Start", reason: "bad_revenue" });
  }

  if (refusals.length > 0) return { refusals };

  return {
    refusals: [],
    row: {
      customer_id: customerId,
      labor_hours_saved: submission.laborHoursSaved,
      labor_cost_per_hour: submission.laborCostPerHour,
      revenue_since_phase2_start: submission.revenueSincePhase2Start,
      revenue_basis: rawBasis as RevenueBasis,
      measured_at: measuredAt as string,
      measured_by: measuredBy,
      source: trimmed(submission?.source) || null,
      note: trimmed(submission?.note) || null,
    },
  };
}

/**
 * A stored row → the shape `blueprint`/`phase2Guarantee` already accept.
 *
 * The seam is deliberately one-way and lossy: `revenue_basis`, `measured_by` and
 * `measured_at` do NOT cross into the engine, because the engine's answer must not
 * vary by who measured or how revenue was counted — that is a display and audit
 * concern, and mixing it into the arithmetic is how a formula acquires a second
 * meaning. The page reads the row for provenance; the engine reads only numbers.
 */
export function toPhase2Returns(row: Phase2ReturnsWriteRow): Phase2Returns {
  return {
    laborHoursSaved: row.labor_hours_saved,
    laborCostPerHour: row.labor_cost_per_hour,
    revenueSincePhase2Start: row.revenue_since_phase2_start,
  };
}
