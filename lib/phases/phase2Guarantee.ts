// Q40 leg (5) — the Phase 2 ROI guarantee, as the Blueprint's own state.
//
// Rob's arithmetic lives in `lib/roi/phase2.ts` (Q63) and is NOT repeated here.
// This module answers the question that comes BEFORE the arithmetic and that the
// engine cannot answer, because the engine only sees numbers:
//
//     may we show this customer an ROI figure at all today?
//
// That is a judgement about a PROMISE — "3-month ROI guarantee" is money Rob has
// put his name to — so it is pure, tested, and stated once here rather than
// improvised by whichever screen renders it.
//
// The four honest answers:
//   NOT_STARTED    → the clock has not begun (no Phase 2 advance date on file)
//   NO_TARGET      → the clock is running but the Phase 2 investment is unknown,
//                    and the investment IS the target (Rob: "Phase 2 Investment =
//                    ROI Target"). No investment, no target, no percentage.
//   AWAITING_DATA  → clock + target known, but nobody has measured the returns.
//   MEASUREMENT_UNAVAILABLE
//                  → clock + target known, and we DO NOT KNOW whether the returns
//                    were measured, because the store could not be read. This is
//                    a fifth answer, not a flavour of AWAITING_DATA: "nobody has
//                    measured you yet" is a claim about the customer, and we are
//                    not entitled to make it on the strength of our own outage.
//   RUNNING        → everything known; the engine computes, this reports.
//
// THE DEFECT THIS FILE EXISTS TO PREVENT: handing the engine zeros for an
// unmeasured customer. `computePhase2Roi` would dutifully return roiPct = -1 and
// status "shortfall" — a RED number on the record of a paying customer, claiming
// they are 100% behind on a guarantee, produced entirely by the absence of data.
// "We have not measured yet" and "you have returned nothing" are different
// sentences, and only one of them is true. Never-measured is never a shortfall.
//
// CR-3: pure and stateless — `asOf` is a parameter, never a clock read.

import {
  computePhase2Roi,
  PHASE_2_GUARANTEE_DAYS,
  type Phase2RoiResult,
} from "@/lib/roi/phase2";
import { PHASE_2_ROI_GUARANTEE_MONTHS } from "./components";

export type Phase2GuaranteeState =
  | "NOT_STARTED"
  | "NO_TARGET"
  | "AWAITING_DATA"
  | "MEASUREMENT_UNAVAILABLE"
  | "RUNNING";

/** What Phase 2 has actually returned. Absent = never measured, NOT zero. */
export interface Phase2Returns {
  laborHoursSaved: number;
  laborCostPerHour: number;
  revenueSincePhase2Start: number;
}

export interface Phase2GuaranteeInput {
  /** ISO date the customer advanced to Phase 2. Absent = the clock never started. */
  startedAt?: string;
  /** Phase 2 investment = the ROI target. Absent = we do not know, not zero. */
  investment?: number;
  /** Measured returns. Absent = nobody has measured; see the header. */
  returns?: Phase2Returns;
  /**
   * The returns store was asked and did not answer (`loadPhase2Returns` →
   * `unavailable`). Consulted ONLY where the absence of returns would otherwise
   * be reported as AWAITING_DATA — an absence we cannot vouch for.
   *
   * PINNED: a usable measurement in hand outranks this flag. A stale-but-real
   * row is evidence; a failed read is not evidence of its absence. So if
   * `returns` is usable we compute, whatever this says.
   */
  returnsUnavailable?: boolean;
  /**
   * WHERE the measured returns came from — `selectPhase2Returns`'s decision about
   * the row it chose, minus the numbers themselves.
   *
   * This exists because Open Question A is OPEN: `revenueSincePhase2Start` is
   * either top-line revenue or revenue *attributed* to Phase 2, and those are two
   * different claims about the same customer against the same money guarantee.
   * A `+37% surplus` computed on top-line and a `+37% surplus` computed on
   * attributed revenue print identically today, which means the screen shows a
   * number whose meaning it does not state (spec §4 point 4, house rule 10).
   *
   * Absent = the caller did not supply it. That is reported as "basis not
   * recorded", NEVER assumed to be either basis: guessing here would answer Rob's
   * open question silently, in a sentence, under a figure he shows customers.
   */
  returnsProvenance?: Phase2ReturnsProvenance;
  /** Evaluation time, ISO. Always passed in — never read from the clock here. */
  asOf: string;
  /** Overridable because Rob said the formula may change. */
  guaranteeDays?: number;
}

/**
 * The provenance of the figure the guarantee computed on. Field-for-field a subset
 * of `Phase2ReturnsSelection` so the loader can hand its own selection straight in
 * without a translation layer that could drift.
 */
export interface Phase2ReturnsProvenance {
  /** ISO instant the human says the measurement describes. */
  measuredAt?: string | null;
  /** Who recorded it. */
  measuredBy?: string | null;
  /** Which revenue question the figure answers. Absent = unrecorded, not assumed. */
  revenueBasis?: "top_line" | "attributed";
  /**
   * The selector rejected a NEWER row it could not use (unreadable, or two rows
   * claiming the same instant). The figure below is therefore real but possibly
   * superseded — and silence about that is how a stale number passes as current.
   */
  newerUnusable?: boolean;
}

export interface Phase2GuaranteeStatus {
  state: Phase2GuaranteeState;
  months: number;
  guaranteeDays: number;
  startedAt?: string;
  /** Whole days into the window. Only present once the clock is running. */
  daysElapsed?: number;
  investment?: number;
  /** The engine's result, verbatim. Present ONLY in RUNNING. */
  roi?: Phase2RoiResult;
  /**
   * Where the RUNNING figure came from, echoed so a surface can render it
   * structurally instead of parsing `line`. Present ONLY in RUNNING, and only when
   * the caller supplied it.
   */
  provenance?: Phase2ReturnsProvenance;
  /** Plain line the tracker renders; never assembled in a component. */
  line: string;
}

const MS_PER_DAY = 86_400_000;

/** Calendar-date based, so a late-evening timestamp cannot read as a day earlier. */
function daysBetween(a: string, b: string): number | null {
  const from = Date.parse(dateOnly(a));
  const to = Date.parse(dateOnly(b));
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

function dateOnly(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? `${m[1]}T00:00:00Z` : iso;
}

function usableNumber(v: unknown, { allowNegative = false } = {}): v is number {
  return typeof v === "number" && Number.isFinite(v) && (allowNegative || v >= 0);
}

function usableReturns(r: Phase2Returns | undefined): r is Phase2Returns {
  return (
    !!r &&
    usableNumber(r.laborHoursSaved) &&
    usableNumber(r.laborCostPerHour) &&
    // Revenue may legitimately be negative (a refund month) — the engine allows it.
    usableNumber(r.revenueSincePhase2Start, { allowNegative: true })
  );
}

const LABEL = `${PHASE_2_ROI_GUARANTEE_MONTHS}-month ROI guarantee`;

export function phase2Guarantee(input: Phase2GuaranteeInput): Phase2GuaranteeStatus {
  const guaranteeDays = input.guaranteeDays ?? PHASE_2_GUARANTEE_DAYS;
  const base = { months: PHASE_2_ROI_GUARANTEE_MONTHS, guaranteeDays };

  if (!input.startedAt) {
    return {
      ...base,
      state: "NOT_STARTED",
      line: `${LABEL} — not started (begins when the customer advances to Phase 2)`,
    };
  }

  const elapsed = daysBetween(input.startedAt, input.asOf);
  if (elapsed === null) {
    // Same rule as the refund window: an unreadable start date is reported as
    // unreadable. Falling back to "today" would invent a day-0 guarantee.
    return {
      ...base,
      state: "NOT_STARTED",
      startedAt: input.startedAt,
      line: `${LABEL} — Phase 2 start date unreadable, state unknown`,
    };
  }
  if (elapsed < 0) {
    // A start date in the future is a scheduled advance, not a running clock.
    return {
      ...base,
      state: "NOT_STARTED",
      startedAt: input.startedAt,
      line: `${LABEL} — starts ${dayLabel(input.startedAt)}, not running yet`,
    };
  }

  const started = { ...base, startedAt: input.startedAt, daysElapsed: elapsed };

  if (!usableNumber(input.investment)) {
    return {
      ...started,
      state: "NO_TARGET",
      line: `${LABEL} — running (day ${elapsed} of ${guaranteeDays}), but the Phase 2 investment is not on file, and the investment IS the target. No figure is shown.`,
    };
  }

  if (!usableReturns(input.returns)) {
    if (input.returnsUnavailable) {
      // Our outage, stated as ours. Not a shortfall (no figure is computed) and
      // not "not measured yet" (that would blame the customer for our read).
      return {
        ...started,
        state: "MEASUREMENT_UNAVAILABLE",
        investment: input.investment,
        line: `${LABEL} — running (day ${elapsed} of ${guaranteeDays}). The recorded return measurements could not be read just now, so no ROI is shown. This is a problem on our side, not a shortfall, and not a statement that nothing has been measured.`,
      };
    }
    return {
      ...started,
      state: "AWAITING_DATA",
      investment: input.investment,
      line: `${LABEL} — running (day ${elapsed} of ${guaranteeDays}). Hours saved and revenue since Phase 2 started have not been measured yet, so no ROI is shown — this is not a shortfall.`,
    };
  }

  const roi = computePhase2Roi({
    investment: input.investment,
    daysElapsed: elapsed,
    laborHoursSaved: input.returns.laborHoursSaved,
    laborCostPerHour: input.returns.laborCostPerHour,
    revenueSincePhase2Start: input.returns.revenueSincePhase2Start,
    guaranteeDays,
  });

  return {
    ...started,
    state: "RUNNING",
    investment: input.investment,
    roi,
    ...(input.returnsProvenance ? { provenance: input.returnsProvenance } : {}),
    line:
      roiLine(roi, elapsed, guaranteeDays) +
      provenanceSentence(roi, input.returnsProvenance),
  };
}

/**
 * The second sentence: what the figure was computed ON.
 *
 * Appended rather than woven in so the ROI sentence stays byte-identical to what it
 * has always been — the number's wording is what the tests and Rob's eye are pinned
 * to, and this increment adds context to it, not a rewrite of it.
 *
 * Nothing is appended when no percentage was shown (day 0): there is no figure to
 * qualify, and a basis note under "nothing is owed back yet" reads as though a
 * measurement drove a result it did not drive.
 */
function provenanceSentence(
  roi: Phase2RoiResult,
  p: Phase2ReturnsProvenance | undefined,
): string {
  if (roi.targetToDateIsZero) return "";
  const parts = [`Computed on ${basisPhrase(p?.revenueBasis)}`];
  const day = p?.measuredAt ? dateOnly(p.measuredAt) : null;
  if (day && !Number.isNaN(Date.parse(day))) {
    parts.push(`measured ${dayLabel(p!.measuredAt!)}`);
  } else if (p?.measuredAt) {
    // A stored instant we cannot read is said out loud. Dropping it would present
    // an undated figure as though it had never claimed a date at all.
    parts.push("measurement date unreadable");
  }
  if (p?.measuredBy) parts.push(`by ${p.measuredBy}`);
  let s = ` ${parts.join(", ")}.`;
  if (p?.newerUnusable) {
    s +=
      " A more recent measurement exists that we could not use, so this figure may already be out of date.";
  }
  return s;
}

/**
 * Rob's open question, spoken in the sentence rather than resolved by it.
 *
 * "revenue" alone is the wording that hides the ambiguity, so it is the one phrase
 * this never uses.
 */
function basisPhrase(basis: Phase2ReturnsProvenance["revenueBasis"]): string {
  if (basis === "top_line") return "hours saved + TOTAL top-line revenue since Phase 2 started";
  if (basis === "attributed") return "hours saved + revenue ATTRIBUTED to Phase 2";
  return "hours saved + revenue whose basis was not recorded (top-line vs attributed unknown)";
}

function roiLine(roi: Phase2RoiResult, elapsed: number, guaranteeDays: number): string {
  const where = roi.beyondGuaranteeWindow
    ? `past the full ${guaranteeDays} days`
    : `day ${elapsed} of ${guaranteeDays}`;
  if (roi.targetToDateIsZero) {
    // Day 0: there is nothing to be behind on yet, so no percentage exists.
    return `${LABEL} — ${where}. Nothing is owed back yet, so no ROI percentage is shown.`;
  }
  const pct = `${roi.roiPct !== null && roi.roiPct >= 0 ? "+" : ""}${Math.round((roi.roiPct ?? 0) * 100)}%`;
  const dollars = `${roi.roiDollars >= 0 ? "+" : "−"}$${Math.abs(Math.round(roi.roiDollars)).toLocaleString("en-US")}`;
  const word =
    roi.status === "surplus" ? "surplus" : roi.status === "shortfall" ? "shortfall" : "on target";
  return `${LABEL} — ${where}: ${pct} (${dollars}) ${word} against the pro-rated target.`;
}

function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}
