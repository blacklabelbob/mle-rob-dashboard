import { describe, it, expect } from "vitest";
import {
  planPhase2ReturnsWrite,
  toPhase2Returns,
  REVENUE_BASES,
  type Phase2ReturnsSubmission,
} from "@/lib/phases/phase2ReturnsWrite";
import { phase2Guarantee } from "@/lib/phases/phase2Guarantee";

const good: Phase2ReturnsSubmission = {
  customerId: "the-title-base",
  laborHoursSaved: 40,
  laborCostPerHour: 28.5,
  revenueSincePhase2Start: 12_000,
  revenueBasis: "attributed",
  measuredAt: "2026-07-28T14:00:00Z",
  measuredBy: "rob",
};

function reasons(s: Phase2ReturnsSubmission) {
  return planPhase2ReturnsWrite(s).refusals.map((r) => r.reason);
}

describe("planPhase2ReturnsWrite", () => {
  it("stores a complete measurement", () => {
    const plan = planPhase2ReturnsWrite(good);
    expect(plan.refusals).toEqual([]);
    expect(plan.row).toMatchObject({
      customer_id: "the-title-base",
      labor_hours_saved: 40,
      labor_cost_per_hour: 28.5,
      revenue_since_phase2_start: 12_000,
      revenue_basis: "attributed",
      measured_by: "rob",
      source: null,
      note: null,
    });
  });

  it("normalises measured_at to an ISO instant so two callers' formats sort together", () => {
    const a = planPhase2ReturnsWrite({ ...good, measuredAt: "2026-07-28T14:00:00Z" }).row;
    const b = planPhase2ReturnsWrite({ ...good, measuredAt: "Tue, 28 Jul 2026 14:00:00 GMT" }).row;
    expect(a?.measured_at).toBe("2026-07-28T14:00:00.000Z");
    expect(b?.measured_at).toBe(a?.measured_at);
  });

  // ALL-OR-NOTHING: the row is the unit, never the field.
  it("writes nothing when any single component is unusable", () => {
    const plan = planPhase2ReturnsWrite({ ...good, laborCostPerHour: Number.NaN });
    expect(plan.row).toBeUndefined();
    expect(plan.refusals.map((r) => r.reason)).toEqual(["bad_labor_cost_per_hour"]);
  });

  it("collects every refusal rather than stopping at the first", () => {
    const plan = planPhase2ReturnsWrite({
      customerId: "  ",
      laborHoursSaved: -1,
      laborCostPerHour: -2,
      revenueSincePhase2Start: Number.POSITIVE_INFINITY,
      revenueBasis: "guessed" as never,
      measuredAt: "",
      measuredBy: "",
    });
    expect(plan.row).toBeUndefined();
    expect(new Set(plan.refusals.map((r) => r.reason))).toEqual(
      new Set([
        "no_customer_id",
        "no_measured_by",
        "no_measured_at",
        "bad_revenue_basis",
        "bad_labor_hours_saved",
        "bad_labor_cost_per_hour",
        "bad_revenue",
      ]),
    );
  });

  // ZERO IS A MEASUREMENT; ABSENT IS NOT.
  it("accepts zeros — 'we saved nothing' is a finding, not a missing field", () => {
    const plan = planPhase2ReturnsWrite({
      ...good,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
    expect(plan.refusals).toEqual([]);
    expect(plan.row?.labor_hours_saved).toBe(0);
  });

  it("refuses a missing number rather than reading it as zero", () => {
    expect(reasons({ ...good, laborHoursSaved: undefined as never })).toEqual([
      "bad_labor_hours_saved",
    ]);
  });

  // NEGATIVE REVENUE IS REAL MONEY; NEGATIVE HOURS AND WAGES ARE NOT.
  it("allows negative revenue (a refund month) but not negative hours or rates", () => {
    expect(planPhase2ReturnsWrite({ ...good, revenueSincePhase2Start: -900 }).refusals).toEqual([]);
    expect(reasons({ ...good, laborHoursSaved: -1 })).toEqual(["bad_labor_hours_saved"]);
    expect(reasons({ ...good, laborCostPerHour: -1 })).toEqual(["bad_labor_cost_per_hour"]);
  });

  // THE BASIS IS THE REASON THIS LEG COULD BE BUILT WHILE ROB'S QUESTION A IS OPEN.
  it("requires the revenue basis and never defaults one", () => {
    expect(reasons({ ...good, revenueBasis: undefined as never })).toEqual(["no_revenue_basis"]);
  });

  it("refuses an unrecognised basis instead of coercing it to a known one", () => {
    const plan = planPhase2ReturnsWrite({ ...good, revenueBasis: "top line" as never });
    expect(plan.row).toBeUndefined();
    expect(plan.refusals.map((r) => r.reason)).toEqual(["bad_revenue_basis"]);
  });

  it("accepts each declared basis verbatim", () => {
    for (const basis of REVENUE_BASES) {
      expect(planPhase2ReturnsWrite({ ...good, revenueBasis: basis }).row?.revenue_basis).toBe(
        basis,
      );
    }
  });

  it("refuses an undated or unparseable measurement", () => {
    expect(reasons({ ...good, measuredAt: "" })).toEqual(["no_measured_at"]);
    expect(reasons({ ...good, measuredAt: "last tuesday" })).toEqual(["bad_measured_at"]);
  });

  it("requires attribution", () => {
    expect(reasons({ ...good, measuredBy: "   " })).toEqual(["no_measured_by"]);
  });

  it("stores optional provenance as given, empty as null", () => {
    const row = planPhase2ReturnsWrite({ ...good, source: " admin-ui ", note: "  " }).row;
    expect(row?.source).toBe("admin-ui");
    expect(row?.note).toBeNull();
  });

  it("survives a non-object submission without throwing", () => {
    expect(planPhase2ReturnsWrite(undefined as never).row).toBeUndefined();
    expect(planPhase2ReturnsWrite(undefined as never).refusals.length).toBeGreaterThan(0);
  });

  // HOURS AND RATE STAY SEPARATE — the product is the engine's (CR-3).
  it("never stores a pre-multiplied labor value", () => {
    const row = planPhase2ReturnsWrite(good).row as Record<string, unknown>;
    expect(Object.keys(row)).not.toContain("labor_value");
    expect(Object.values(row)).not.toContain(40 * 28.5);
  });
});

describe("toPhase2Returns", () => {
  // THE POINT OF THE WHOLE INCREMENT: a row this door accepts must move the
  // guarantee off AWAITING_DATA. If the two predicates ever disagree, a real
  // measurement renders as "never measured".
  it("produces returns the guarantee actually computes from", () => {
    const row = planPhase2ReturnsWrite(good).row!;
    const status = phase2Guarantee({
      startedAt: "2026-06-01",
      investment: 10_000,
      returns: toPhase2Returns(row),
      asOf: "2026-07-01",
    });
    expect(status.state).toBe("RUNNING");
    expect(status.roi).toBeDefined();
  });

  it("keeps a zero measurement out of AWAITING_DATA — zero returns is a real shortfall", () => {
    const row = planPhase2ReturnsWrite({
      ...good,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    }).row!;
    const status = phase2Guarantee({
      startedAt: "2026-06-01",
      investment: 10_000,
      returns: toPhase2Returns(row),
      asOf: "2026-07-01",
    });
    expect(status.state).toBe("RUNNING");
    expect(status.roi?.status).toBe("shortfall");
  });

  it("carries a negative-revenue month through to the engine", () => {
    const row = planPhase2ReturnsWrite({ ...good, revenueSincePhase2Start: -900 }).row!;
    expect(toPhase2Returns(row).revenueSincePhase2Start).toBe(-900);
  });

  // The seam is lossy ON PURPOSE: the arithmetic must not vary by who measured.
  it("does not leak basis or attribution into the engine's input", () => {
    const returns = toPhase2Returns(planPhase2ReturnsWrite(good).row!) as Record<string, unknown>;
    expect(Object.keys(returns).sort()).toEqual([
      "laborCostPerHour",
      "laborHoursSaved",
      "revenueSincePhase2Start",
    ]);
  });
});
