// PRD Task MC.3 (base 7.4): "Needs Action Today" — the Rob/ops SLA rule set.
// This is the RULE TABLE as code per CR-3 (docs/plans/NEEDS-ACTION-SPEC.md
// narrates; it never re-states an SLA). Definitions only — evaluators land
// with MC.13 (the Rob/ops widget). Reconciled with Task 1.7's rep-facing
// todayRules per the 2026-07-21 merge ledger: one threshold table, two
// consumers — followup_lag derives its SLA from STAGE_AGING_DAYS instead of
// inventing a parallel number.

import { STAGE_AGING_DAYS } from "./todayRules";

export type NeedsActionRuleId =
  | "new_lead_untouched"
  | "discovery_reminder_missing"
  | "proposal_lag"
  | "followup_lag"
  | "signed_not_invoiced";

export type NeedsActionCoverage =
  | "covered_by_today_rules" // already fires on the rep worklist; MC.13 re-surfaces for Rob
  | "evaluator_pending" // fields exist today; evaluator is MC.13 work
  | "blocked_on_ingestion"; // source data not in the CRM yet (MC.9)

export type NeedsActionRule = {
  id: NeedsActionRuleId;
  trigger: string; // exact condition, in terms of real fields
  actionOwed: string;
  slaHours: number;
  fieldsRead: string[]; // table.column, as they exist in lib/types.ts / stores
  coverage: NeedsActionCoverage;
  coverageNote: string;
};

// contacted rung is the canonical follow-up threshold (Task 1.7). Non-null
// asserted deliberately: the test pins it so a todayRules edit can't silently
// orphan this derivation.
const FOLLOWUP_DAYS = STAGE_AGING_DAYS.contacted!;

export const NEEDS_ACTION_RULES: readonly NeedsActionRule[] = [
  {
    id: "new_lead_untouched",
    trigger:
      'deal.stage === "new_lead" AND no activity anchored to the deal since deals.createdAt AND age > 24h',
    actionOwed: "First touch (call or email) logged against the deal",
    slaHours: 24,
    fieldsRead: [
      "deals.stage",
      "deals.createdAt",
      "activities.dealId",
      "activities.occurredAt",
    ],
    coverage: "evaluator_pending",
    coverageNote:
      "Fields exist today; todayRules has no new_lead rung (stage_aging starts at contacted). Evaluator is MC.13 work.",
  },
  {
    id: "discovery_reminder_missing",
    trigger:
      "booked discovery meeting starts within 24h AND no reminder activity logged on the same anchor",
    actionOwed: "Send the 24h-prior discovery reminder",
    slaHours: 24,
    fieldsRead: [
      "bookings.startsAt (Cal.com — table does not exist yet)",
      "activities.dealId",
      "activities.occurredAt",
    ],
    coverage: "blocked_on_ingestion",
    coverageNote:
      "No bookings data in the CRM until MC.9's Cal.com ingestion lands; deals.stage === meeting_booked has no start-time field.",
  },
  {
    id: "proposal_lag",
    trigger:
      'deal.stage === "meeting_held" AND hours since stage entry > 48 (entry = activities status_change per Task 4.7; deals.updatedAt proxy as fallback)',
    actionOwed: "Send the proposal/quote (stage → quote_sent)",
    slaHours: 48,
    fieldsRead: [
      "deals.stage",
      "activities.type=status_change (Task 4.7)",
      "deals.updatedAt (proxy)",
    ],
    coverage: "evaluator_pending",
    coverageNote:
      "Adjacent to todayRules meeting_unlogged (24h, any log) but distinct: this is the specific proposal SLA on the meeting_held stage. Deliberately NOT added to STAGE_AGING_DAYS here — extending the rep queue is a todayRules/MC.13 decision, not a definition side-effect.",
  },
  {
    id: "followup_lag",
    trigger: `deal sat in contacted ≥ ${FOLLOWUP_DAYS}d with no touch (todayRules stage_aging, contacted rung)`,
    actionOwed: "Follow-up touch on the contacted deal",
    slaHours: FOLLOWUP_DAYS * 24, // derived — never a parallel number
    fieldsRead: ["deals.stage", "deals.updatedAt (proxy until 4.7 entry times wired)"],
    coverage: "covered_by_today_rules",
    coverageNote:
      "Base PRD said 3 business days; todayRules uses calendar days — calendar-day proxy adopted as the reconciliation decision (documented divergence, one threshold table).",
  },
  {
    id: "signed_not_invoiced",
    trigger:
      'deal.stage === "signed" AND hours since stage entry > 24 (the ladder moves invoiced deals to stage "invoiced", so a signed deal aged >24h IS the un-invoiced state)',
    actionOwed: "Issue the invoice (stage → invoiced)",
    slaHours: 24,
    fieldsRead: [
      "deals.stage",
      "deals.updatedAt (proxy) / activities.type=status_change",
      "contracts/invoices/invoice-ledger.csv (G3: the only live invoice store — cross-check rides MC.9's CSV diff)",
    ],
    coverage: "evaluator_pending",
    coverageNote:
      "Stage-only evaluator is buildable now (no invoices table needed — per the MC.7 G3 verdict the CSV is the only store); the CSV cross-check leg waits on MC.9.",
  },
];
