// Phase 2 ROI — the recommended-automation catalogue.
//
// Rob (dump 2026-07-25): "list the top recommended automations underneath… look at the
// specifics of the automation, figure out what type of employee would likely normally
// handle that task, what their hourly rate is in the region the business is in."
//
// WHY THIS FILE EXISTS (2026-07-25, Q63 mount): the seed list was born inside
// docs/plans/PHASE2-ROI-ESTIMATOR.html as a literal in a <script> block. Mounting the
// estimator in the app needed the same nine rows, and copying them into a React component
// would have made THREE copies of a money-facing table. So the list moved here, and the
// standalone page is now the copy that gets guarded (see
// lib/__tests__/phase2RoiEstimatorParity.test.ts) rather than the origin.
//
// Pure per CR-3: data + pure builders only. No clock, no network, no React, no Next.

import { rateFor, findRole, REGION_LABELS, type RateRegion } from "./laborRates";
import type { AutomationEstimateInput } from "./phase2";

/** A seeded automation, before a region is chosen and before any operator override. */
export interface SeedAutomation {
  id: string;
  name: string;
  /** What it actually does — the hours/role estimate is derived FROM this. */
  what: string;
  /** BLS SOC code of the role this displaces. Must exist in LABOR_ROLES. */
  soc: string;
  /** Hours a human would otherwise spend on this per week. */
  hoursPerWeek: number;
  /**
   * Revenue lift per month. **Seeded at 0 on every row, on purpose.**
   * The labor half is defensible from published BLS wages; the revenue half is
   * judgement. Nothing is claimed until a human types it or opts in via `suggest`.
   */
  revenueLiftPerMonth: 0;
  /** The opt-in "conservative estimate" an operator can load with one click. */
  suggest: number;
  /** Why those hours and that lift — shown in the UI so no number is unexplained. */
  why: string;
}

/**
 * The nine automations an MLE Phase 2 actually ships. Totals **31.5 h/wk (≈0.8 FTE)** —
 * deliberately under one full-time head, because the first tuning pass seeded 58 h/wk and
 * produced a day-30 read of **+477%**, which is the number a client stops believing.
 * That total is pinned by a test; raising it is a decision, not a typo.
 */
export const SEED_AUTOMATIONS: readonly SeedAutomation[] = [
  {
    id: "recep",
    name: "24/7 AI receptionist",
    what: "answers every inbound call, books the job",
    soc: "434171",
    hoursPerWeek: 7,
    revenueLiftPerMonth: 0,
    suggest: 1200,
    why: "~1 after-hours job/mo that would have gone to voicemail",
  },
  {
    id: "mctb",
    name: "Missed-call text-back",
    what: "instant SMS on any missed call, speed-to-lead",
    soc: "434051",
    hoursPerWeek: 2,
    revenueLiftPerMonth: 0,
    suggest: 800,
    why: "recovers a share of missed calls that never call back",
  },
  {
    id: "chat",
    name: "Website AI chat agent",
    what: "qualifies and books visitors who would leave",
    soc: "434051",
    hoursPerWeek: 4,
    revenueLiftPerMonth: 0,
    suggest: 600,
    why: "conservative: a fraction of one job/mo from web traffic",
  },
  {
    id: "intake",
    name: "Lead intake → CRM",
    what: "every form/call/DM lands as a record, no typing",
    soc: "436014",
    hoursPerWeek: 3,
    revenueLiftPerMonth: 0,
    suggest: 0,
    why: "time only — no revenue claimed",
  },
  {
    id: "quote",
    name: "Quote follow-up sequence",
    what: "chases every unaccepted estimate on a cadence",
    soc: "414012",
    hoursPerWeek: 4,
    revenueLiftPerMonth: 0,
    suggest: 900,
    why: "re-closes a small share of dormant estimates",
  },
  {
    id: "review",
    name: "Review request engine",
    what: "asks at the right moment, routes the unhappy ones",
    soc: "273031",
    hoursPerWeek: 1.5,
    revenueLiftPerMonth: 0,
    suggest: 300,
    why: "indirect — rating lift feeding inbound",
  },
  {
    id: "social",
    name: "Automated social posting",
    what: "daily posts per profile, no human in the loop",
    soc: "273031",
    hoursPerWeek: 5,
    revenueLiftPerMonth: 0,
    suggest: 0,
    why: "time only — attribution too weak to claim revenue",
  },
  {
    id: "invoice",
    name: "Invoice send + payment chase",
    what: "issues, reminds, reconciles paid state",
    soc: "433031",
    hoursPerWeek: 3,
    revenueLiftPerMonth: 0,
    suggest: 0,
    why: "cash timing, not new revenue",
  },
  {
    id: "remind",
    name: "Appointment reminders",
    what: "cuts no-shows on booked jobs",
    soc: "435032",
    hoursPerWeek: 2,
    revenueLiftPerMonth: 0,
    suggest: 400,
    why: "recovered no-shows only",
  },
] as const;

/** Operator edits layered over a seed row. Absent keys keep the seeded value. */
export interface AutomationOverride {
  hoursPerWeek?: number;
  revenueLiftPerMonth?: number;
  /** Deselecting an automation drops it from the estimate entirely. */
  enabled?: boolean;
}

/** What the estimator persists per company. Small on purpose — the catalogue is code. */
export interface Phase2Estimate {
  /** Rob's "Est Investment" field. */
  estInvestment: number;
  /** Rob's editable "days so far in Phase 2". */
  daysElapsed: number;
  /** Which BLS wage region to price labour at. */
  region: Exclude<RateRegion, "custom">;
  /** Overridable because Rob said the formula may change. Omitted = 91. */
  guaranteeDays?: number;
  /** Per-automation operator edits, keyed by seed id. */
  overrides?: Record<string, AutomationOverride>;
  /** ISO timestamp of the last save. Supplied by the caller — this module has no clock. */
  updatedAt?: string;
}

/**
 * Starting point for a company that has never been estimated.
 *
 * These are the **standalone artifact's** defaults, not the spec's §2a worked example
 * ($12,000 / 60 h — a different scenario used to pin the arithmetic). They must match
 * docs/plans/PHASE2-ROI-ESTIMATOR.html or the same company reads +11.6% on the page Rob
 * sends a client and −15.3% on the record he opens in the dashboard. Pinned by a test.
 *
 * $9,100 is $100/day across the 91-day window — a round per-day target, which is why the
 * artifact anchors there.
 */
export const DEFAULT_PHASE2_ESTIMATE: Phase2Estimate = {
  estInvestment: 9100,
  daysElapsed: 30,
  region: "naples",
};

/** A built row plus the provenance the UI must show (rule 10: no number without a source). */
export interface BuiltAutomation extends AutomationEstimateInput {
  /** True when BLS publishes no figure at the requested level and we stepped out. */
  fellBack: boolean;
  /** The opt-in conservative revenue figure for this row. */
  suggest: number;
  /** False when the operator deselected it (excluded from the estimate). */
  enabled: boolean;
}

/**
 * Resolve the seed catalogue against a wage region and the operator's overrides.
 *
 * Fallback is **explicit, never silent**: `rateFor` reports the level it actually used, and
 * `fellBack` is carried through so the UI can say "national figure — BLS publishes no Naples
 * number for Telemarketers" instead of presenting a national rate as though it were local.
 *
 * A seed row whose SOC is missing from LABOR_ROLES is DROPPED rather than priced at zero —
 * a silent $0/hr would understate the client's savings and look like a working number.
 */
export function buildAutomations(
  region: Exclude<RateRegion, "custom">,
  overrides: Record<string, AutomationOverride> = {},
): BuiltAutomation[] {
  const built: BuiltAutomation[] = [];
  for (const seed of SEED_AUTOMATIONS) {
    const resolved = rateFor(seed.soc, region);
    const role = findRole(seed.soc);
    if (!resolved || !role) continue;
    const o = overrides[seed.id] ?? {};
    built.push({
      id: seed.id,
      name: seed.name,
      what: seed.what,
      role: role.title,
      soc: seed.soc,
      hourlyRate: resolved.rate,
      rateRegionLabel: REGION_LABELS[resolved.usedRegion],
      rateSource: role.source,
      humanHoursPerWeek: o.hoursPerWeek ?? seed.hoursPerWeek,
      revenueLiftPerMonth: o.revenueLiftPerMonth ?? seed.revenueLiftPerMonth,
      basis: seed.why,
      fellBack: resolved.fellBack,
      suggest: seed.suggest,
      enabled: o.enabled ?? true,
    });
  }
  return built;
}

/** The rows that actually feed `estimatePhase2Roi` — deselected automations excluded. */
export function enabledAutomations(built: BuiltAutomation[]): AutomationEstimateInput[] {
  return built.filter((a) => a.enabled);
}

/** Seeded weekly hours across the catalogue. Pinned by a test at 31.5. */
export function seededHoursPerWeek(): number {
  return SEED_AUTOMATIONS.reduce((s, a) => s + a.hoursPerWeek, 0);
}
