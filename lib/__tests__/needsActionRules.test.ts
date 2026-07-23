import { describe, expect, it } from "vitest";
import { NEEDS_ACTION_RULES } from "../tasks/needsActionRules";
import { STAGE_AGING_DAYS } from "../tasks/todayRules";

// MC.3 rule-table invariants — the table is data, so the tests pin its
// contract: base-PRD 7.4's five rules, unique, every column filled, and the
// reconciliation derivation (followup_lag ← STAGE_AGING_DAYS) can't silently
// break when todayRules thresholds change.
describe("needsActionRules (MC.3)", () => {
  it("defines exactly the five base-PRD 7.4 rules, uniquely", () => {
    const ids = NEEDS_ACTION_RULES.map((r) => r.id);
    expect(ids).toEqual([
      "new_lead_untouched",
      "discovery_reminder_missing",
      "proposal_lag",
      "followup_lag",
      "signed_not_invoiced",
    ]);
    expect(new Set(ids).size).toBe(5);
  });

  it("every rule carries the full DoD columns", () => {
    for (const r of NEEDS_ACTION_RULES) {
      expect(r.trigger.length).toBeGreaterThan(0);
      expect(r.actionOwed.length).toBeGreaterThan(0);
      expect(r.slaHours).toBeGreaterThan(0);
      expect(r.fieldsRead.length).toBeGreaterThan(0);
      expect(r.coverageNote.length).toBeGreaterThan(0);
    }
  });

  it("followup_lag SLA is DERIVED from STAGE_AGING_DAYS.contacted (one threshold table)", () => {
    const followup = NEEDS_ACTION_RULES.find((r) => r.id === "followup_lag")!;
    expect(STAGE_AGING_DAYS.contacted).toBeDefined();
    expect(followup.slaHours).toBe(STAGE_AGING_DAYS.contacted! * 24);
  });
});
