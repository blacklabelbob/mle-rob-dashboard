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

export type Phase2GuaranteeState = "NOT_STARTED" | "NO_TARGET" | "AWAITING_DATA" | "RUNNING";

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
  /** Evaluation time, ISO. Always passed in — never read from the clock here. */
  asOf: string;
  /** Overridable because Rob said the formula may change. */
  guaranteeDays?: number;
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
    line: roiLine(roi, elapsed, guaranteeDays),
  };
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
