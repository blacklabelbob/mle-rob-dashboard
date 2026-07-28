import { describe, it, expect } from "vitest";
import { phase2Guarantee } from "@/lib/phases/phase2Guarantee";
import { computePhase2Roi, PHASE_2_GUARANTEE_DAYS } from "@/lib/roi/phase2";

const RETURNS = { laborHoursSaved: 40, laborCostPerHour: 50, revenueSincePhase2Start: 3000 };

describe("phase2Guarantee — before the clock", () => {
  it("no Phase 2 advance date = NOT_STARTED, and says what starts it", () => {
    const s = phase2Guarantee({ asOf: "2026-07-28" });
    expect(s.state).toBe("NOT_STARTED");
    expect(s.roi).toBeUndefined();
    expect(s.daysElapsed).toBeUndefined();
    expect(s.line).toMatch(/not started/i);
    expect(s.months).toBe(3);
    expect(s.guaranteeDays).toBe(PHASE_2_GUARANTEE_DAYS);
  });

  it("an unreadable start date is reported as unreadable, never back-filled to today", () => {
    const s = phase2Guarantee({ startedAt: "whenever", investment: 10_000, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.state).toBe("NOT_STARTED");
    expect(s.line).toMatch(/unreadable/i);
    expect(s.roi).toBeUndefined();
  });

  it("a start date in the future is a scheduled advance, not a day-0 guarantee", () => {
    const s = phase2Guarantee({ startedAt: "2026-08-15", investment: 10_000, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.state).toBe("NOT_STARTED");
    expect(s.daysElapsed).toBeUndefined();
    expect(s.line).toMatch(/starts 8\/15/);
  });
});

describe("phase2Guarantee — the target is the investment", () => {
  it("clock running with no investment on file = NO_TARGET, no percentage", () => {
    const s = phase2Guarantee({ startedAt: "2026-06-28", returns: RETURNS, asOf: "2026-07-28" });
    expect(s.state).toBe("NO_TARGET");
    expect(s.daysElapsed).toBe(30);
    expect(s.investment).toBeUndefined();
    expect(s.roi).toBeUndefined();
    expect(s.line).toMatch(/investment is not on file/i);
  });

  it("an unusable investment (NaN / negative) is NO_TARGET, not a thrown page", () => {
    for (const investment of [Number.NaN, -1, Infinity]) {
      const s = phase2Guarantee({ startedAt: "2026-06-28", investment, returns: RETURNS, asOf: "2026-07-28" });
      expect(s.state).toBe("NO_TARGET");
    }
  });

  it("investment of 0 is a real recorded number, not a missing one", () => {
    const s = phase2Guarantee({ startedAt: "2026-06-28", investment: 0, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.state).toBe("RUNNING");
    expect(s.investment).toBe(0);
  });
});

describe("phase2Guarantee — never-measured is never a shortfall", () => {
  it("no returns on file = AWAITING_DATA, and says out loud it is not a shortfall", () => {
    const s = phase2Guarantee({ startedAt: "2026-06-28", investment: 10_000, asOf: "2026-07-28" });
    expect(s.state).toBe("AWAITING_DATA");
    expect(s.roi).toBeUndefined();
    expect(s.line).toMatch(/not a shortfall/i);
    // The engine, handed the same customer as zeros, would have said this:
    const asZeros = computePhase2Roi({
      investment: 10_000,
      daysElapsed: 30,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
    expect(asZeros.status).toBe("shortfall");
    expect(asZeros.roiPct).toBe(-1);
  });

  it("a MEASURED zero is a real shortfall — the two cases stay distinct", () => {
    const s = phase2Guarantee({
      startedAt: "2026-06-28",
      investment: 10_000,
      returns: { laborHoursSaved: 0, laborCostPerHour: 0, revenueSincePhase2Start: 0 },
      asOf: "2026-07-28",
    });
    expect(s.state).toBe("RUNNING");
    expect(s.roi?.status).toBe("shortfall");
    expect(s.line).toMatch(/shortfall/);
  });

  it("unusable measurement numbers fall back to AWAITING_DATA rather than throwing", () => {
    const s = phase2Guarantee({
      startedAt: "2026-06-28",
      investment: 10_000,
      returns: { laborHoursSaved: -5, laborCostPerHour: 50, revenueSincePhase2Start: 0 },
      asOf: "2026-07-28",
    });
    expect(s.state).toBe("AWAITING_DATA");
  });

  it("negative revenue (a refund month) is legitimate and still computes", () => {
    const s = phase2Guarantee({
      startedAt: "2026-06-28",
      investment: 10_000,
      returns: { laborHoursSaved: 10, laborCostPerHour: 50, revenueSincePhase2Start: -200 },
      asOf: "2026-07-28",
    });
    expect(s.state).toBe("RUNNING");
    expect(s.roi?.valueDelivered).toBe(300);
  });
});

describe("phase2Guarantee — the arithmetic is the engine's, verbatim", () => {
  it("RUNNING carries the engine result unchanged, never re-derived", () => {
    const s = phase2Guarantee({ startedAt: "2026-06-28", investment: 10_000, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.state).toBe("RUNNING");
    expect(s.roi).toEqual(
      computePhase2Roi({
        investment: 10_000,
        daysElapsed: 30,
        laborHoursSaved: 40,
        laborCostPerHour: 50,
        revenueSincePhase2Start: 3000,
        guaranteeDays: PHASE_2_GUARANTEE_DAYS,
      })
    );
  });

  it("day 0 shows no percentage — nothing is owed back yet", () => {
    const s = phase2Guarantee({ startedAt: "2026-07-28", investment: 10_000, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.daysElapsed).toBe(0);
    expect(s.roi?.roiPct).toBeNull();
    expect(s.line).toMatch(/Nothing is owed back yet/i);
  });

  it("past the window the line says so instead of counting a day 200 of 91", () => {
    const s = phase2Guarantee({ startedAt: "2026-01-01", investment: 10_000, returns: RETURNS, asOf: "2026-07-28" });
    expect(s.roi?.beyondGuaranteeWindow).toBe(true);
    expect(s.line).toMatch(/past the full 91 days/);
  });

  it("guaranteeDays is overridable end to end (Rob: the formula may change)", () => {
    const s = phase2Guarantee({
      startedAt: "2026-06-28",
      investment: 10_000,
      returns: RETURNS,
      asOf: "2026-07-28",
      guaranteeDays: 60,
    });
    expect(s.guaranteeDays).toBe(60);
    expect(s.roi?.guaranteeDays).toBe(60);
    expect(s.line).toMatch(/day 30 of 60/);
  });

  it("a timestamp late in the day does not read as a day earlier", () => {
    const s = phase2Guarantee({
      startedAt: "2026-06-28T23:45:00Z",
      investment: 10_000,
      returns: RETURNS,
      asOf: "2026-07-28T00:10:00Z",
    });
    expect(s.daysElapsed).toBe(30);
  });
});
