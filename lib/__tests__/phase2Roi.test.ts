// Phase 2 ROI engine — pins Rob's formula (dump 2026-07-25) so a later "we might change
// this formula" is a deliberate edit with a failing test, not a silent drift.
import { describe, expect, it } from "vitest";
import {
  DAYS_PER_MONTH,
  PHASE_2_GUARANTEE_DAYS,
  computePhase2Roi,
  estimatePhase2Roi,
  hoursToDate,
  revenueToDate,
  roiTone,
} from "../roi/phase2";
import { LABOR_ROLES, rateFor } from "../roi/laborRates";

describe("computePhase2Roi — the pro-rated target", () => {
  it("targets the FULL investment only at day 91", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: PHASE_2_GUARANTEE_DAYS,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
    expect(r.targetToDate).toBe(9100);
    expect(r.perDayTarget).toBe(100);
  });

  it("pro-rates the target by days elapsed — the whole point of the rule", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 30,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
    expect(r.targetToDate).toBe(3000); // 100/day × 30, NOT 9,100
  });

  it("worked example: value 4,500 on day 30 of a $9,100 Phase 2 = +50% and +$1,500", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 30,
      laborHoursSaved: 100,
      laborCostPerHour: 25, // 2,500 productivity
      revenueSincePhase2Start: 2000,
    });
    expect(r.productivitySavings).toBe(2500);
    expect(r.valueDelivered).toBe(4500);
    expect(r.targetToDate).toBe(3000);
    expect(r.roiPct).toBeCloseTo(0.5, 10); // 4500/3000 − 1
    expect(r.roiDollars).toBe(1500);
    expect(r.status).toBe("surplus");
    expect(roiTone(r.status)).toBe("green");
  });

  it("shortfall goes negative in BOTH units and reads red", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 30,
      laborHoursSaved: 40,
      laborCostPerHour: 25, // 1,000
      revenueSincePhase2Start: 500,
    });
    expect(r.valueDelivered).toBe(1500);
    expect(r.roiPct).toBeCloseTo(-0.5, 10);
    expect(r.roiDollars).toBe(-1500);
    expect(r.status).toBe("shortfall");
    expect(roiTone(r.status)).toBe("red");
  });

  it("exactly on the pro-rated line is on_target, not a rounding surplus", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 30,
      laborHoursSaved: 120,
      laborCostPerHour: 25, // 3,000 == target
      revenueSincePhase2Start: 0,
    });
    expect(r.roiDollars).toBe(0);
    expect(r.roiPct).toBe(0);
    expect(r.status).toBe("on_target");
  });

  it("day 0: no % (undefined ratio), but the $ still reports every dollar as surplus", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 0,
      laborHoursSaved: 10,
      laborCostPerHour: 25,
      revenueSincePhase2Start: 0,
    });
    expect(r.targetToDateIsZero).toBe(true);
    expect(r.roiPct).toBeNull(); // never Infinity, never NaN on screen
    expect(r.roiDollars).toBe(250);
  });

  it("past day 91 the target STOPS growing and the overrun is flagged", () => {
    const r = computePhase2Roi({
      investment: 9100,
      daysElapsed: 150,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
    expect(r.targetToDate).toBe(9100);
    expect(r.beyondGuaranteeWindow).toBe(true);
    expect(r.progress).toBe(1);
  });

  it("honours a non-91 guarantee window (Rob: the formula may change)", () => {
    const r = computePhase2Roi({
      investment: 6000,
      daysElapsed: 30,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
      guaranteeDays: 60,
    });
    expect(r.targetToDate).toBe(3000);
  });

  it("rejects impossible inputs instead of rendering NaN", () => {
    const base = {
      investment: 1000,
      daysElapsed: 10,
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    };
    expect(() => computePhase2Roi({ ...base, investment: -1 })).toThrow(RangeError);
    expect(() => computePhase2Roi({ ...base, daysElapsed: Number.NaN })).toThrow(TypeError);
    expect(() => computePhase2Roi({ ...base, guaranteeDays: 0 })).toThrow(RangeError);
    // A refund month is legitimate — negative revenue must NOT throw.
    expect(() => computePhase2Roi({ ...base, revenueSincePhase2Start: -500 })).not.toThrow();
  });
});

describe("pro-rating helpers", () => {
  it("converts per-week hours to date without rounding to whole weeks", () => {
    expect(hoursToDate(7, 30)).toBe(30);
    expect(hoursToDate(10, 3.5)).toBeCloseTo(5, 10);
  });

  it("pro-rates monthly revenue on a 30.4375-day month", () => {
    expect(revenueToDate(3043.75, 30)).toBeCloseTo(3000, 6);
    expect(DAYS_PER_MONTH).toBeCloseTo(365.25 / 12, 10);
  });
});

describe("estimatePhase2Roi — per-automation, then the summary", () => {
  const automations = [
    {
      id: "a1",
      name: "24/7 AI receptionist",
      what: "answers every inbound call",
      role: "Receptionists and Information Clerks",
      soc: "434171",
      hourlyRate: 18.75,
      rateRegionLabel: "Naples metro",
      rateSource: "https://www.bls.gov/oes/current/oes434171.htm",
      humanHoursPerWeek: 14,
      revenueLiftPerMonth: 3043.75,
    },
    {
      id: "a2",
      name: "Automated social posting",
      what: "daily posts per profile",
      role: "Public Relations Specialists",
      soc: "273031",
      hourlyRate: 32.59,
      rateRegionLabel: "Naples metro",
      rateSource: "https://www.bls.gov/oes/current/oes273031.htm",
      humanHoursPerWeek: 7,
      revenueLiftPerMonth: 0,
    },
  ];

  it("scales every number with the days field — Rob's editable input", () => {
    const d30 = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 30, automations });
    const d60 = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 60, automations });
    expect(d60.totals.valueToDate).toBeCloseTo(d30.totals.valueToDate * 2, 6);
    expect(d60.summary.targetToDate).toBeCloseTo(d30.summary.targetToDate * 2, 6);
  });

  it("per-automation hours and labor value are derived, not assumed", () => {
    const r = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 30, automations });
    const a1 = r.perAutomation[0];
    expect(a1.hoursSavedToDate).toBeCloseTo(60, 10); // 14/wk over 30 days
    expect(a1.laborValueToDate).toBeCloseTo(60 * 18.75, 6);
    expect(a1.revenueToDate).toBeCloseTo(3000, 6);
  });

  it("the summary equals the sum of its parts (no double count, no drift)", () => {
    const r = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 45, automations });
    const summed = r.perAutomation.reduce((s, a) => s + a.valueToDate, 0);
    expect(r.summary.valueDelivered).toBeCloseTo(summed, 6);
    expect(r.summary.productivitySavings).toBeCloseTo(r.totals.laborValueToDate, 6);
    expect(r.summary.revenue).toBeCloseTo(r.totals.revenueToDate, 6);
  });

  it("share-of-target says what fraction of what's owed each automation covers", () => {
    const r = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 30, automations });
    const shares = r.perAutomation.map((a) => a.shareOfTargetToDate ?? 0);
    expect(shares.reduce((s, v) => s + v, 0)).toBeCloseTo(
      r.summary.valueDelivered / r.summary.targetToDate,
      6,
    );
  });

  it("day 0 yields no shares and no %, rather than Infinity", () => {
    const r = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 0, automations });
    expect(r.perAutomation.every((a) => a.shareOfTargetToDate === null)).toBe(true);
    expect(r.summary.roiPct).toBeNull();
  });

  it("an empty automation list is a zero, not a crash", () => {
    const r = estimatePhase2Roi({ estInvestment: 9100, daysElapsed: 30, automations: [] });
    expect(r.totals.valueToDate).toBe(0);
    expect(r.totals.blendedHourlyRate).toBeNull();
    expect(r.summary.status).toBe("shortfall");
  });
});

describe("labor rate table — sourced, and honest about what it lacks", () => {
  it("every role carries a BLS source URL", () => {
    expect(LABOR_ROLES.length).toBeGreaterThan(0);
    for (const r of LABOR_ROLES) {
      expect(r.source).toMatch(/^https:\/\/www\.bls\.gov\/oes\/current\/oes\d{6}\.htm$/);
      expect(r.medianHourly.us).toBeGreaterThan(0);
    }
  });

  it("falls back metro → state → national and SAYS that it fell back", () => {
    const direct = rateFor("434171", "naples");
    expect(direct).toEqual({ rate: 18.75, usedRegion: "naples", fellBack: false });
    // Telemarketers have no Naples-metro publication — must fall back, flagged.
    const fell = rateFor("419041", "naples");
    expect(fell?.usedRegion).toBe("fl");
    expect(fell?.fellBack).toBe(true);
  });

  it("returns null for an unknown role rather than a made-up rate", () => {
    expect(rateFor("999999", "us")).toBeNull();
  });
});
