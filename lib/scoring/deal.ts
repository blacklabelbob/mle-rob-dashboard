// Deal priority score (PRD Task 2.4) — scoring-pattern rule (~/.claude/rules/scoring-pattern.md):
// pure + stateless, time comes in as `asOf` (never Date.now()), one weight table
// declared up front, per-signal 0–100 ladders, explainable breakdown per run.
//
// Composite answers "which deal deserves attention next" — it is NOT a win
// probability. Terminal deals (paid, lost) are flagged so consumers can shelve
// them regardless of composite.
//
// Weight table (sums to 1.0):
//   stage      0.30  pipeline momentum — further along = closer to money (Task 1.6 DRAFT ladder)
//   freshness  0.25  days since last dated event vs asOf — stale deals die (Rob: "time kills everything")
//   value      0.20  quoted/deal $ — bigger checks outrank smaller at equal momentum
//   referral   0.15  referral-sourced — the network thesis: warm intros close (PRD Phase M1)
//   coverage   0.10  record completeness — unworkable records score down until filled

import type { Deal, DealStage } from "@/lib/types";

export interface SignalScore {
  signal: "stage" | "freshness" | "value" | "referral" | "coverage";
  raw: number; // 0–100 off the signal's ladder
  weight: number;
  weighted: number; // raw × weight
  evidence: string;
}

export type DealGrade = "A" | "B" | "C" | "D" | "F";

export interface DealScore {
  dealId: string;
  score: number; // 0–100, 1-decimal
  grade: DealGrade;
  terminal: boolean; // paid | lost — shelve regardless of score
  breakdown: SignalScore[];
}

export const WEIGHTS = {
  stage: 0.3,
  freshness: 0.25,
  value: 0.2,
  referral: 0.15,
  coverage: 0.1,
} as const;

// Stage ladder: momentum toward money. stalled/lost sit below new_lead on
// purpose — a dead-stopped deal is worth less attention than a fresh one.
export const STAGE_LADDER: Record<DealStage, number> = {
  lost: 0,
  new_lead: 10,
  stalled: 15,
  contacted: 20,
  meeting_booked: 35,
  meeting_held: 45,
  quote_sent: 55,
  negotiating: 65,
  signed: 80,
  invoiced: 90,
  delivering: 95,
  paid: 100,
};

const TERMINAL_STAGES: ReadonlySet<DealStage> = new Set(["paid", "lost"]);

// Freshness ladder: days since the most recent dated event (keyDates, falling
// back to createdAt when no key date exists).
const FRESHNESS_LADDER: ReadonlyArray<[maxDays: number, raw: number]> = [
  [7, 100],
  [14, 85],
  [30, 60],
  [60, 35],
  [90, 15],
  [Infinity, 5],
];

// Value ladder: quoted/deal dollars. 0/undefined scores 0 raw — an unquoted
// deal earns its priority from momentum, not imagined dollars.
const VALUE_LADDER: ReadonlyArray<[minValue: number, raw: number]> = [
  [25_000, 100],
  [10_000, 85],
  [5_000, 70],
  [1_000, 50],
  [1, 30], // any positive value beats none
];

const GRADE_BANDS: ReadonlyArray<[minScore: number, grade: DealGrade]> = [
  [80, "A"],
  [65, "B"],
  [50, "C"],
  [35, "D"],
  [0, "F"],
];

const MS_PER_DAY = 86_400_000;

function lastEventDate(deal: Deal): { iso: string; source: string } | null {
  const dated: Array<{ iso: string; source: string }> = [];
  for (const [field, iso] of Object.entries(deal.keyDates)) {
    if (typeof iso === "string" && !Number.isNaN(Date.parse(iso))) {
      dated.push({ iso, source: `keyDates.${field}` });
    }
  }
  if (dated.length === 0) {
    if (!Number.isNaN(Date.parse(deal.createdAt))) {
      return { iso: deal.createdAt, source: "createdAt" };
    }
    return null;
  }
  dated.sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso));
  return dated[0];
}

function scoreStage(deal: Deal): SignalScore {
  const raw = STAGE_LADDER[deal.stage];
  return {
    signal: "stage",
    raw,
    weight: WEIGHTS.stage,
    weighted: raw * WEIGHTS.stage,
    evidence: `stage=${deal.stage}`,
  };
}

function scoreFreshness(deal: Deal, asOf: string): SignalScore {
  const last = lastEventDate(deal);
  if (!last) {
    return {
      signal: "freshness",
      raw: 0,
      weight: WEIGHTS.freshness,
      weighted: 0,
      evidence: "no parseable dated events",
    };
  }
  const days = Math.max(0, (Date.parse(asOf) - Date.parse(last.iso)) / MS_PER_DAY);
  const [, raw] = FRESHNESS_LADDER.find(([max]) => days <= max)!;
  return {
    signal: "freshness",
    raw,
    weight: WEIGHTS.freshness,
    weighted: raw * WEIGHTS.freshness,
    evidence: `${Math.floor(days)}d since ${last.source}=${last.iso}`,
  };
}

function scoreValue(deal: Deal): SignalScore {
  const value = deal.value ?? 0;
  const rung = VALUE_LADDER.find(([min]) => value >= min);
  const raw = rung ? rung[1] : 0;
  return {
    signal: "value",
    raw,
    weight: WEIGHTS.value,
    weighted: raw * WEIGHTS.value,
    evidence: value > 0 ? `value=$${value}` : "no deal value recorded",
  };
}

function scoreReferral(deal: Deal): SignalScore {
  const raw = deal.referralSourced ? 100 : 30;
  return {
    signal: "referral",
    raw,
    weight: WEIGHTS.referral,
    weighted: raw * WEIGHTS.referral,
    evidence: deal.referralSourced ? "referral-sourced" : "not referral-sourced",
  };
}

// Coverage: 25 points per workability field present.
const COVERAGE_FIELDS: ReadonlyArray<[label: string, present: (d: Deal) => boolean]> = [
  ["value", (d) => (d.value ?? 0) > 0],
  ["vertical", (d) => Boolean(d.verticalId)],
  ["owner", (d) => Boolean(d.ownerId)],
  ["notes", (d) => Boolean(d.notes?.trim())],
];

function scoreCoverage(deal: Deal): SignalScore {
  const present = COVERAGE_FIELDS.filter(([, has]) => has(deal)).map(([label]) => label);
  const raw = present.length * 25;
  return {
    signal: "coverage",
    raw,
    weight: WEIGHTS.coverage,
    weighted: raw * WEIGHTS.coverage,
    evidence: present.length > 0 ? `has ${present.join(", ")}` : "no workability fields set",
  };
}

export function gradeFor(score: number): DealGrade {
  return GRADE_BANDS.find(([min]) => score >= min)![1];
}

export function scoreDeal(deal: Deal, asOf: string): DealScore {
  if (Number.isNaN(Date.parse(asOf))) {
    throw new Error(`scoreDeal: asOf is not a parseable ISO date: ${JSON.stringify(asOf)}`);
  }
  const breakdown = [
    scoreStage(deal),
    scoreFreshness(deal, asOf),
    scoreValue(deal),
    scoreReferral(deal),
    scoreCoverage(deal),
  ];
  const score = Math.round(breakdown.reduce((sum, s) => sum + s.weighted, 0) * 10) / 10;
  return {
    dealId: deal.id,
    score,
    grade: gradeFor(score),
    terminal: TERMINAL_STAGES.has(deal.stage),
    breakdown,
  };
}
