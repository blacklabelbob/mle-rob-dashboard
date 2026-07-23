// PRD Task MC.13 DoD: seeded fixture for each rule surfaces exactly the
// expected items. Fixtures below cover every evaluated rule's positive AND
// its negatives (fresh/touched/demo/status_change-entry cases), plus the
// honest-coverage contract: NA-2 reports blocked, and the table↔evaluator
// pairing is pinned so a new MC.3 rule can't be silently ignored.
import { describe, expect, it } from "vitest";
import type { Activity, Deal } from "../types";
import {
  EVALUATED_RULE_IDS,
  evaluateNeedsAction,
  followupLagItems,
  newLeadUntouchedItems,
  stageEntryAt,
} from "../tasks/needsActionEval";
import { NEEDS_ACTION_RULES } from "../tasks/needsActionRules";

const TODAY = "2026-07-23";
const NOW = new Date("2026-07-23T15:00:00Z");

const deal = (
  o: Partial<Deal> & { id: string; name: string; stage: Deal["stage"] }
): Deal => ({
  referralSourced: false,
  keyDates: {},
  bookProtected: false,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  ...o,
});

const act = (
  o: Partial<Activity> & { id: string; occurredAt: string }
): Activity => ({
  type: "note",
  source: "manual",
  sourceContext: {},
  bookProtected: false,
  createdAt: o.occurredAt,
  ...o,
});

const deals: Deal[] = [
  // NA-1 positive: new_lead created 40h before NOW, no touch
  deal({ id: "n1", name: "Stale lead", stage: "new_lead", createdAt: "2026-07-21T23:00:00Z" }),
  // NA-1 negative: fresh new_lead (10h old)
  deal({ id: "n2", name: "Fresh lead", stage: "new_lead", createdAt: "2026-07-23T05:00:00Z" }),
  // NA-1 negative: old new_lead but touched (a1 below)
  deal({ id: "n3", name: "Touched lead", stage: "new_lead", createdAt: "2026-07-20T00:00:00Z" }),
  // NA-1 negative: demo excluded
  deal({ id: "demo-n4", name: "Demo lead", stage: "new_lead", createdAt: "2026-07-01T00:00:00Z" }),
  // NA-3 positive: meeting_held, status_change entry 60h ago
  deal({ id: "p1", name: "Slow proposal", stage: "meeting_held", updatedAt: "2026-07-23T00:00:00Z" }),
  // NA-3 negative: meeting_held, entered 20h ago via updatedAt proxy
  deal({ id: "p2", name: "Recent meeting", stage: "meeting_held", updatedAt: "2026-07-22T19:00:00Z" }),
  // NA-4 positive: contacted 3d aged (todayRules contacted rung)
  deal({ id: "f1", name: "Cold contact", stage: "contacted", updatedAt: "2026-07-20T00:00:00Z" }),
  // NA-4 negative (for followup_lag): quote_sent ages in todayRules but is NOT the contacted rung
  deal({ id: "f2", name: "Aging quote", stage: "quote_sent", updatedAt: "2026-07-10T00:00:00Z" }),
  // NA-5 positive: signed 48h ago, still not invoiced
  deal({ id: "s1", name: "Signed uninvoiced", stage: "signed", updatedAt: "2026-07-21T15:00:00Z" }),
  // NA-5 negative: signed 5h ago
  deal({ id: "s2", name: "Just signed", stage: "signed", updatedAt: "2026-07-23T10:00:00Z" }),
];

const activities: Activity[] = [
  act({ id: "a1", occurredAt: "2026-07-20T12:00:00Z", dealId: "n3", type: "call" }), // clears n3
  // p1's real stage entry: status_change 60h before NOW overrides its fresh updatedAt
  act({ id: "a2", occurredAt: "2026-07-21T03:00:00Z", dealId: "p1", type: "status_change" }),
];

describe("stageEntryAt", () => {
  it("prefers the latest status_change over the updatedAt proxy", () => {
    const d = deals.find((x) => x.id === "p1")!;
    expect(stageEntryAt(d, activities)).toBe("2026-07-21T03:00:00Z");
  });
  it("falls back to updatedAt when no status_change is anchored", () => {
    const d = deals.find((x) => x.id === "s1")!;
    expect(stageEntryAt(d, activities)).toBe(d.updatedAt);
  });
});

describe("newLeadUntouchedItems (NA-1)", () => {
  it("fires only for the stale untouched non-demo lead", () => {
    const ids = newLeadUntouchedItems(deals, activities, NOW).map((i) => i.dealId);
    expect(ids).toEqual(["n1"]);
  });
});

describe("followupLagItems (NA-4, derived from todayRules)", () => {
  it("re-surfaces exactly the contacted rung, not other aging stages", () => {
    const ids = followupLagItems(deals, TODAY).map((i) => i.dealId);
    expect(ids).toEqual(["f1"]);
  });
});

describe("evaluateNeedsAction composite", () => {
  it("returns exactly the expected items in table order (DoD)", () => {
    const { items } = evaluateNeedsAction({ deals, activities }, TODAY, NOW);
    expect(items.map((i) => [i.ruleId, i.dealId])).toEqual([
      ["new_lead_untouched", "n1"],
      ["proposal_lag", "p1"],
      ["followup_lag", "f1"],
      ["signed_not_invoiced", "s1"],
    ]);
  });
  it("reports NA-2 as blocked — honest coverage, never silently absent", () => {
    const { blocked } = evaluateNeedsAction({ deals, activities }, TODAY, NOW);
    expect(blocked.map((b) => b.ruleId)).toEqual(["discovery_reminder_missing"]);
    expect(blocked[0].reason).toMatch(/MC\.9/);
  });
  it("rejects a non-ISO today", () => {
    expect(() => evaluateNeedsAction({ deals, activities }, "today", NOW)).toThrow();
  });
});

describe("table↔evaluator pairing (gate)", () => {
  it("every MC.3 rule is either evaluated or reported blocked", () => {
    const covered = new Set<string>(EVALUATED_RULE_IDS);
    const { blocked } = evaluateNeedsAction({ deals: [], activities: [] }, TODAY, NOW);
    for (const b of blocked) covered.add(b.ruleId);
    for (const r of NEEDS_ACTION_RULES) {
      expect(covered.has(r.id), `rule ${r.id} silently ignored`).toBe(true);
    }
  });
});
