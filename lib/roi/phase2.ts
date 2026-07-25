// Phase 2 ROI engine — Rob's formula, 2026-07-25.
// Source dump: docs/plans/sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md (verbatim)
// Spec + worked example: docs/plans/PHASE2-ROI-ENGINE-SPEC.md
//
// Rob, verbatim:
//   "Phase 2 Investment = ROI Target
//    ROI Target To date = Productivity Savings To Date (# of labor hours saved since start
//    of Phase 2 * Labor Cost per hr) + Total Revenue since start of Phase 2) / Phase 2
//    Investment (divided by 91 days x the number of days since the start of Phase 2)
//    = Answer -1  <-- this is to express it as a %. I also want it expressed as a $"
//   "When displaying the running ROI it always has to be factored based on how far we are
//    into Phase 2. Surplus will be Great, Shortfall will be -Red"
//
// So the target is PRO-RATED: on day 30 of 91 the client is only owed 30/91 of the
// investment back. That single rule is why this module exists as code and not as a
// spreadsheet — it is the difference between "you're behind" and "you're ahead".
//
// Pure per CR-3: no clock, no network, no Next imports, no I/O. Every result is a
// function of its arguments alone. THIS FILE IS THE SOURCE OF TRUTH for the arithmetic;
// any UI (route, artifact, PDF) mirrors it and must not re-derive it.
//
// NOTE (Rob, same message): "We might change this formula later" — the shape is
// deliberately parameterised (guaranteeDays) rather than hard-coded at every call site.

/** Phase 2's guarantee window: a 3-month ROI guarantee = 91 days (BUILD-QUEUE Q40). */
export const PHASE_2_GUARANTEE_DAYS = 91;

/** Average days per month (365.25/12) — used to pro-rate monthly revenue estimates. */
export const DAYS_PER_MONTH = 30.4375;

export type RoiStatus = "surplus" | "on_target" | "shortfall";

export interface Phase2RoiInput {
  /** What the client pays for Phase 2. Rob: "Phase 2 Investment = ROI Target". */
  investment: number;
  /** Days since Phase 2 started. */
  daysElapsed: number;
  /** Labor hours saved since Phase 2 started. */
  laborHoursSaved: number;
  /** Loaded labor cost per hour for the role those hours came from. */
  laborCostPerHour: number;
  /**
   * Revenue since Phase 2 started, ATTRIBUTABLE to the Phase 2 work.
   * ⚠️ OPEN WITH ROB (flagged, not silently decided): his wording is "Total Revenue since
   * start of Phase 2". Total top-line revenue would credit Phase 2 with sales it did not
   * cause and would make the guarantee trivially easy to clear. This engine takes whatever
   * number it is handed — the UI labels it and the spec records the question.
   */
  revenueSincePhase2Start: number;
  /** Defaults to 91. Overridable because Rob said the formula may change. */
  guaranteeDays?: number;
}

export interface Phase2RoiResult {
  guaranteeDays: number;
  daysElapsed: number;
  /** How far into the window, 0–1 (capped at 1). */
  progress: number;
  /** hours × rate */
  productivitySavings: number;
  revenue: number;
  /** productivitySavings + revenue — what Phase 2 has actually returned so far. */
  valueDelivered: number;
  /** investment ÷ guaranteeDays */
  perDayTarget: number;
  /** The pro-rated target: perDayTarget × daysElapsed (never above the full investment). */
  targetToDate: number;
  /** valueDelivered ÷ targetToDate − 1. `null` on day 0, where the ratio is undefined. */
  roiPct: number | null;
  /** valueDelivered − targetToDate. Always defined — this is the $ Rob asked for. */
  roiDollars: number;
  status: RoiStatus;
  /** True past day 91 — the target stops growing, so read the number accordingly. */
  beyondGuaranteeWindow: boolean;
  /** True on day 0: there is nothing to be behind on yet, so no % is shown. */
  targetToDateIsZero: boolean;
}

function assertFinite(name: string, v: number, { allowNegative = false } = {}): void {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be a finite number (got ${v})`);
  if (!allowNegative && v < 0) throw new RangeError(`${name} must be >= 0 (got ${v})`);
}

/**
 * The running ROI. Everything the UI renders comes from here — the % (green surplus /
 * red shortfall), the $, and the pro-rated target it is measured against.
 */
export function computePhase2Roi(input: Phase2RoiInput): Phase2RoiResult {
  const guaranteeDays = input.guaranteeDays ?? PHASE_2_GUARANTEE_DAYS;
  assertFinite("investment", input.investment);
  assertFinite("daysElapsed", input.daysElapsed);
  assertFinite("laborHoursSaved", input.laborHoursSaved);
  assertFinite("laborCostPerHour", input.laborCostPerHour);
  // Revenue may legitimately be negative (refund/chargeback month) — allowed on purpose.
  assertFinite("revenueSincePhase2Start", input.revenueSincePhase2Start, { allowNegative: true });
  if (!(guaranteeDays > 0)) throw new RangeError(`guaranteeDays must be > 0 (got ${guaranteeDays})`);

  const beyondGuaranteeWindow = input.daysElapsed > guaranteeDays;
  const effectiveDays = Math.min(input.daysElapsed, guaranteeDays);

  const productivitySavings = input.laborHoursSaved * input.laborCostPerHour;
  const revenue = input.revenueSincePhase2Start;
  const valueDelivered = productivitySavings + revenue;

  const perDayTarget = input.investment / guaranteeDays;
  const targetToDate = perDayTarget * effectiveDays;

  const targetToDateIsZero = targetToDate === 0;
  const roiPct = targetToDateIsZero ? null : valueDelivered / targetToDate - 1;
  const roiDollars = valueDelivered - targetToDate;

  const status: RoiStatus = roiDollars > 0 ? "surplus" : roiDollars < 0 ? "shortfall" : "on_target";

  return {
    guaranteeDays,
    daysElapsed: input.daysElapsed,
    progress: Math.min(effectiveDays / guaranteeDays, 1),
    productivitySavings,
    revenue,
    valueDelivered,
    perDayTarget,
    targetToDate,
    roiPct,
    roiDollars,
    status,
    beyondGuaranteeWindow,
    targetToDateIsZero,
  };
}

// ---------------------------------------------------------------------------
// The ESTIMATOR — Rob: "when we're first calculating them, have a field where we can
// input any amount of investment called Est Investment, then an input field where you can
// change the number of days so far in Phase 2 which will change all the numbers, list the
// top recommended automations underneath… And for the Estimated section I want you do that
// for each one of the automations recommended. Then show a summary."
// ---------------------------------------------------------------------------

export interface AutomationEstimateInput {
  id: string;
  name: string;
  /** What it actually does — this is what the role/hours estimate is derived FROM. */
  what: string;
  /** The employee who would otherwise do this task (SOC title). */
  role: string;
  /** BLS SOC code backing `hourlyRate`. */
  soc: string;
  /** Regional median hourly wage for that role. */
  hourlyRate: number;
  /** Region label the rate came from, so the UI can show metro vs state vs national. */
  rateRegionLabel: string;
  /** BLS source URL for the rate. */
  rateSource: string;
  /** Hours a human would spend on this task per week (the automation runs 24/7). */
  humanHoursPerWeek: number;
  /** Estimated ADDITIONAL revenue per month attributable to automating it. */
  revenueLiftPerMonth: number;
  /** Why those hours and that lift — shown in the UI so no number is unexplained. */
  basis?: string;
}

export interface AutomationEstimateResult extends AutomationEstimateInput {
  hoursSavedToDate: number;
  laborValueToDate: number;
  revenueToDate: number;
  valueToDate: number;
  /** This automation's value ÷ the pro-rated target — "it covers X% of what's owed". */
  shareOfTargetToDate: number | null;
}

export interface EstimatorInput {
  /** Rob's "Est Investment" field. */
  estInvestment: number;
  /** Rob's editable "days so far in Phase 2" field — every number below moves with it. */
  daysElapsed: number;
  automations: AutomationEstimateInput[];
  guaranteeDays?: number;
}

export interface EstimatorResult {
  perAutomation: AutomationEstimateResult[];
  /** Rob's "Then show a summary" — the same engine, run on the totals. */
  summary: Phase2RoiResult;
  totals: {
    hoursSavedToDate: number;
    laborValueToDate: number;
    revenueToDate: number;
    valueToDate: number;
    /** Blended $/hr across the automations — sanity check on the mix. */
    blendedHourlyRate: number | null;
  };
}

/** Days → hours for a per-week figure. Deliberately not rounded to whole weeks. */
export function hoursToDate(hoursPerWeek: number, daysElapsed: number): number {
  return (hoursPerWeek / 7) * daysElapsed;
}

/** Monthly revenue figure pro-rated to the days elapsed. */
export function revenueToDate(perMonth: number, daysElapsed: number): number {
  return (perMonth / DAYS_PER_MONTH) * daysElapsed;
}

export function estimatePhase2Roi(input: EstimatorInput): EstimatorResult {
  const guaranteeDays = input.guaranteeDays ?? PHASE_2_GUARANTEE_DAYS;
  assertFinite("estInvestment", input.estInvestment);
  assertFinite("daysElapsed", input.daysElapsed);

  const effectiveDays = Math.min(input.daysElapsed, guaranteeDays);
  const perDayTarget = input.estInvestment / guaranteeDays;
  const targetToDate = perDayTarget * effectiveDays;

  const perAutomation: AutomationEstimateResult[] = input.automations.map((a) => {
    assertFinite(`${a.id}.hourlyRate`, a.hourlyRate);
    assertFinite(`${a.id}.humanHoursPerWeek`, a.humanHoursPerWeek);
    assertFinite(`${a.id}.revenueLiftPerMonth`, a.revenueLiftPerMonth, { allowNegative: true });
    const h = hoursToDate(a.humanHoursPerWeek, input.daysElapsed);
    const labor = h * a.hourlyRate;
    const rev = revenueToDate(a.revenueLiftPerMonth, input.daysElapsed);
    const value = labor + rev;
    return {
      ...a,
      hoursSavedToDate: h,
      laborValueToDate: labor,
      revenueToDate: rev,
      valueToDate: value,
      shareOfTargetToDate: targetToDate === 0 ? null : value / targetToDate,
    };
  });

  const hoursSavedToDate = perAutomation.reduce((s, a) => s + a.hoursSavedToDate, 0);
  const laborValueToDate = perAutomation.reduce((s, a) => s + a.laborValueToDate, 0);
  const revTotal = perAutomation.reduce((s, a) => s + a.revenueToDate, 0);

  // The summary runs the SAME engine as the live/actuals view — one formula, two inputs.
  // Labor is passed as (total hours × blended rate) so the summary reproduces the
  // per-automation labor total exactly rather than re-deriving it from one rate.
  const blendedHourlyRate = hoursSavedToDate === 0 ? null : laborValueToDate / hoursSavedToDate;
  const summary = computePhase2Roi({
    investment: input.estInvestment,
    daysElapsed: input.daysElapsed,
    laborHoursSaved: hoursSavedToDate,
    laborCostPerHour: blendedHourlyRate ?? 0,
    revenueSincePhase2Start: revTotal,
    guaranteeDays,
  });

  return {
    perAutomation,
    summary,
    totals: {
      hoursSavedToDate,
      laborValueToDate,
      revenueToDate: revTotal,
      valueToDate: laborValueToDate + revTotal,
      blendedHourlyRate,
    },
  };
}

/** Display helper: Rob wants the % green on surplus, red on shortfall. */
export function roiTone(status: RoiStatus): "green" | "red" | "neutral" {
  return status === "surplus" ? "green" : status === "shortfall" ? "red" : "neutral";
}
