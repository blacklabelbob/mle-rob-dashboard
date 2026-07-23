// PRD Task MC.13 (base 9.2): "Needs Action Today" — the Rob/ops EVALUATORS
// for the MC.3 rule table (lib/tasks/needsActionRules.ts). Pure per CR-3:
// nothing here reads the clock — callers pass `now` + `today` exactly like
// whoDoITouchToday. demo-* rows never surface (Q4 precedent). Evaluation is
// mechanical against the table: each rule's trigger text names the fields
// this file reads, and the gate test pins the rule↔evaluator pairing so the
// table can't grow a rule this file silently ignores.
//
// Reconciliation with Task 2.6 (rep endpoint), executed not just flagged:
// NA-4 followup_lag does NOT re-implement aging — it calls todayRules'
// stageAgingItems and keeps the contacted rung (one threshold table, one
// evaluator, two consumers). NA-2 is blocked on MC.9 (no bookings data) and
// is REPORTED as blocked rather than silently absent — the widget must show
// honest coverage, never fake completeness.

import type { Activity, Deal } from "../types";
import {
  NEEDS_ACTION_RULES,
  type NeedsActionRuleId,
} from "./needsActionRules";
import { STAGE_AGING_DAYS, stageAgingItems } from "./todayRules";

export type NeedsActionItem = {
  ruleId: NeedsActionRuleId;
  dealId: string;
  personId?: string;
  orgId?: string;
  reason: string; // deterministic — two runs on the same input match exactly
};

export type NeedsActionBlocked = {
  ruleId: NeedsActionRuleId;
  reason: string;
};

export type NeedsActionResult = {
  items: NeedsActionItem[];
  blocked: NeedsActionBlocked[]; // rules that CANNOT evaluate yet (honest coverage)
};

const HOUR_MS = 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDemo = (id: string | undefined) => !!id && id.startsWith("demo-");
const isDemoDeal = (d: Deal) =>
  isDemo(d.id) || isDemo(d.personId) || isDemo(d.orgId);

const sla = (id: NeedsActionRuleId) =>
  NEEDS_ACTION_RULES.find((r) => r.id === id)!.slaHours;

function hoursSince(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return NaN;
  return (now.getTime() - t) / HOUR_MS;
}

// Stage-entry time per the table: latest status_change anchored to the deal
// (Task 4.7 audit trail), else deals.updatedAt as the documented proxy.
export function stageEntryAt(deal: Deal, activities: Activity[]): string {
  let latest: string | undefined;
  for (const a of activities) {
    if (a.type !== "status_change" || a.dealId !== deal.id) continue;
    if (!latest || a.occurredAt > latest) latest = a.occurredAt;
  }
  return latest ?? deal.updatedAt;
}

// NA-1 — new_lead_untouched: new_lead deal >24h old with no activity
// anchored to it since creation (fieldsRead: activities.dealId — the table's
// anchor, deliberately narrow; a person-anchored touch that skips the deal
// still leaves the DEAL untouched).
export function newLeadUntouchedItems(
  deals: Deal[],
  activities: Activity[],
  now: Date
): NeedsActionItem[] {
  const items: NeedsActionItem[] = [];
  const slaHours = sla("new_lead_untouched");
  for (const d of deals) {
    if (d.stage !== "new_lead" || isDemoDeal(d)) continue;
    const age = hoursSince(d.createdAt, now);
    if (!Number.isFinite(age) || age <= slaHours) continue;
    const touched = activities.some(
      (a) => a.dealId === d.id && a.occurredAt >= d.createdAt
    );
    if (touched) continue;
    items.push({
      ruleId: "new_lead_untouched",
      dealId: d.id,
      personId: d.personId,
      orgId: d.orgId,
      reason: `"${d.name}" is a ${Math.floor(age)}h-old new lead with no first touch (SLA ${slaHours}h)`,
    });
  }
  return items;
}

// NA-3 — proposal_lag: meeting_held deal whose stage entry is >48h old and
// still no proposal (stage would be quote_sent if one went out).
// NA-5 — signed_not_invoiced: signed deal aged >24h (the ladder moves
// invoiced deals to stage "invoiced", so aged signed IS un-invoiced; CSV
// cross-check rides MC.9 per the G3 verdict).
function stageLagItems(
  ruleId: "proposal_lag" | "signed_not_invoiced",
  stage: Deal["stage"],
  owed: string,
  deals: Deal[],
  activities: Activity[],
  now: Date
): NeedsActionItem[] {
  const items: NeedsActionItem[] = [];
  const slaHours = sla(ruleId);
  for (const d of deals) {
    if (d.stage !== stage || isDemoDeal(d)) continue;
    const hours = hoursSince(stageEntryAt(d, activities), now);
    if (!Number.isFinite(hours) || hours <= slaHours) continue;
    items.push({
      ruleId,
      dealId: d.id,
      personId: d.personId,
      orgId: d.orgId,
      reason: `"${d.name}" has sat in ${stage} ${Math.floor(hours)}h without ${owed} (SLA ${slaHours}h)`,
    });
  }
  return items;
}

// NA-4 — followup_lag: the contacted rung of todayRules stage_aging,
// re-surfaced for Rob. NOT re-implemented — same evaluator, second consumer.
export function followupLagItems(deals: Deal[], today: string): NeedsActionItem[] {
  const contactedIds = new Set(
    deals.filter((d) => d.stage === "contacted").map((d) => d.id)
  );
  return stageAgingItems(deals, today)
    .filter((i) => !!i.dealId && contactedIds.has(i.dealId))
    .map((i) => ({
      ruleId: "followup_lag" as const,
      dealId: i.dealId!,
      personId: i.personId,
      orgId: i.orgId,
      reason: i.reason,
    }));
}

// Composite, deterministically ordered: table order NA-1 → NA-3 → NA-4 →
// NA-5, stable by dealId within each rule. NA-2 reports as blocked.
export function evaluateNeedsAction(
  input: { deals: Deal[]; activities: Activity[] },
  today: string,
  now: Date
): NeedsActionResult {
  if (!ISO_DATE.test(today)) {
    throw new Error(`evaluateNeedsAction: invalid today "${today}"`);
  }
  const rank: Record<NeedsActionRuleId, number> = {
    new_lead_untouched: 0,
    discovery_reminder_missing: 1,
    proposal_lag: 2,
    followup_lag: 3,
    signed_not_invoiced: 4,
  };
  const items = [
    ...newLeadUntouchedItems(input.deals, input.activities, now),
    ...stageLagItems(
      "proposal_lag",
      "meeting_held",
      "a proposal",
      input.deals,
      input.activities,
      now
    ),
    ...followupLagItems(input.deals, today),
    ...stageLagItems(
      "signed_not_invoiced",
      "signed",
      "an invoice",
      input.deals,
      input.activities,
      now
    ),
  ].sort(
    (a, b) => rank[a.ruleId] - rank[b.ruleId] || a.dealId.localeCompare(b.dealId)
  );
  const blocked: NeedsActionBlocked[] = NEEDS_ACTION_RULES.filter(
    (r) => r.coverage === "blocked_on_ingestion"
  ).map((r) => ({ ruleId: r.id, reason: r.coverageNote }));
  return { items, blocked };
}

// Every rule in the table is either evaluated above or reported blocked —
// pinned by the gate test so the table can't grow a silently-ignored rule.
export const EVALUATED_RULE_IDS: readonly NeedsActionRuleId[] = [
  "new_lead_untouched",
  "proposal_lag",
  "followup_lag",
  "signed_not_invoiced",
];

// followup_lag's SLA stays derived (table) AND its evaluator stays todayRules'
// (here) — assert the rung exists so neither derivation can silently orphan.
void STAGE_AGING_DAYS.contacted!;
