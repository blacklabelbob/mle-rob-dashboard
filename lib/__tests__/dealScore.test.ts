import { describe, expect, it } from "vitest";
import {
  STAGE_LADDER,
  WEIGHTS,
  gradeFor,
  scoreDeal,
} from "../scoring/deal";
import type { Deal, DealStage } from "../types";

const ASOF = "2026-07-22T12:00:00.000Z";

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "deal-test",
    personId: "person-1",
    name: "Test Deal",
    stage: "quote_sent",
    referralSourced: false,
    keyDates: {},
    bookProtected: false,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function signal(deal: Deal, name: string) {
  return scoreDeal(deal, ASOF).breakdown.find((s) => s.signal === name)!;
}

describe("weight table", () => {
  it("weights sum to exactly 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("every breakdown row uses its declared weight and weighted = raw × weight", () => {
    const result = scoreDeal(makeDeal(), ASOF);
    for (const row of result.breakdown) {
      expect(row.weight).toBe(WEIGHTS[row.signal]);
      expect(row.weighted).toBeCloseTo(row.raw * row.weight, 10);
    }
  });
});

describe("stage ladder — every rung", () => {
  const expected: Record<DealStage, number> = {
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
  for (const [stage, raw] of Object.entries(expected) as [DealStage, number][]) {
    it(`${stage} → ${raw}`, () => {
      expect(signal(makeDeal({ stage }), "stage").raw).toBe(raw);
      expect(STAGE_LADDER[stage]).toBe(raw);
    });
  }

  it("only paid and lost are terminal", () => {
    const stages = Object.keys(expected) as DealStage[];
    const terminal = stages.filter((s) => scoreDeal(makeDeal({ stage: s }), ASOF).terminal);
    expect(terminal.sort()).toEqual(["lost", "paid"]);
  });
});

describe("freshness ladder — every rung (days measured against asOf)", () => {
  const cases: Array<[days: number, raw: number]> = [
    [0, 100],
    [7, 100],
    [8, 85],
    [14, 85],
    [15, 60],
    [30, 60],
    [31, 35],
    [60, 35],
    [61, 15],
    [90, 15],
    [91, 5],
    [365, 5],
  ];
  for (const [days, raw] of cases) {
    it(`${days}d ago → ${raw}`, () => {
      const iso = new Date(Date.parse(ASOF) - days * 86_400_000).toISOString();
      const deal = makeDeal({ keyDates: { quoted: iso } });
      expect(signal(deal, "freshness").raw).toBe(raw);
    });
  }

  it("uses the MOST RECENT key date when several exist", () => {
    const deal = makeDeal({
      keyDates: {
        met: "2026-01-01T00:00:00.000Z",
        signed: "2026-07-20T00:00:00.000Z",
      },
    });
    const s = signal(deal, "freshness");
    expect(s.raw).toBe(100);
    expect(s.evidence).toContain("keyDates.signed");
  });

  it("falls back to createdAt when keyDates is empty", () => {
    const deal = makeDeal({ keyDates: {}, createdAt: "2026-07-21T00:00:00.000Z" });
    const s = signal(deal, "freshness");
    expect(s.raw).toBe(100);
    expect(s.evidence).toContain("createdAt");
  });

  it("scores 0 with honest evidence when no date parses", () => {
    const deal = makeDeal({ keyDates: { quoted: "not-a-date" }, createdAt: "also-bad" });
    const s = signal(deal, "freshness");
    expect(s.raw).toBe(0);
    expect(s.evidence).toBe("no parseable dated events");
  });

  it("future-dated events clamp to 0 days (no negative-day bonus rung)", () => {
    const deal = makeDeal({ keyDates: { signed: "2026-08-01T00:00:00.000Z" } });
    expect(signal(deal, "freshness").raw).toBe(100);
  });
});

describe("value ladder — every rung", () => {
  const cases: Array<[value: number | undefined, raw: number]> = [
    [25_000, 100],
    [100_000, 100],
    [10_000, 85],
    [24_999, 85],
    [5_000, 70],
    [9_999, 70],
    [1_000, 50],
    [4_999, 50],
    [1, 30],
    [999, 30],
    [0, 0],
    [undefined, 0],
  ];
  for (const [value, raw] of cases) {
    it(`$${value ?? "unset"} → ${raw}`, () => {
      expect(signal(makeDeal({ value }), "value").raw).toBe(raw);
    });
  }

  it("zero-value evidence is honest (polk verbatim-$0 case)", () => {
    expect(signal(makeDeal({ value: 0 }), "value").evidence).toBe("no deal value recorded");
  });
});

describe("referral ladder — both rungs", () => {
  it("referral-sourced → 100", () => {
    expect(signal(makeDeal({ referralSourced: true }), "referral").raw).toBe(100);
  });
  it("not referral-sourced → 30", () => {
    expect(signal(makeDeal({ referralSourced: false }), "referral").raw).toBe(30);
  });
});

describe("coverage ladder — every rung (25 per field)", () => {
  it("0 fields → 0", () => {
    const deal = makeDeal({ value: undefined, verticalId: undefined, ownerId: undefined, notes: undefined });
    const s = signal(deal, "coverage");
    expect(s.raw).toBe(0);
    expect(s.evidence).toBe("no workability fields set");
  });
  it("1 field → 25", () => {
    expect(signal(makeDeal({ value: 500 }), "coverage").raw).toBe(25);
  });
  it("2 fields → 50", () => {
    expect(signal(makeDeal({ value: 500, verticalId: "roofing" }), "coverage").raw).toBe(50);
  });
  it("3 fields → 75", () => {
    expect(signal(makeDeal({ value: 500, verticalId: "roofing", ownerId: "rob" }), "coverage").raw).toBe(75);
  });
  it("4 fields → 100", () => {
    const deal = makeDeal({ value: 500, verticalId: "roofing", ownerId: "rob", notes: "warm" });
    expect(signal(deal, "coverage").raw).toBe(100);
  });
  it("whitespace-only notes do not count", () => {
    expect(signal(makeDeal({ notes: "   " }), "coverage").raw).toBe(0);
  });
});

describe("grade bands — every band incl. boundaries", () => {
  const cases: Array<[score: number, grade: string]> = [
    [100, "A"],
    [80, "A"],
    [79.9, "B"],
    [65, "B"],
    [64.9, "C"],
    [50, "C"],
    [49.9, "D"],
    [35, "D"],
    [34.9, "F"],
    [0, "F"],
  ];
  for (const [score, grade] of cases) {
    it(`${score} → ${grade}`, () => {
      expect(gradeFor(score)).toBe(grade);
    });
  }
});

describe("composite", () => {
  it("is deterministic — identical input + asOf gives identical output", () => {
    const deal = makeDeal({ value: 7_000, referralSourced: true, keyDates: { quoted: "2026-07-10T00:00:00.000Z" } });
    expect(scoreDeal(deal, ASOF)).toEqual(scoreDeal(deal, ASOF));
  });

  it("hand-computed composite matches (backfill-shaped fixture)", () => {
    // stage signed 80×.30=24; signed 2d ago 100×.25=25; $5k 70×.20=14;
    // referral 100×.15=15; coverage value only 25×.10=2.5 → 80.5 A
    const deal = makeDeal({
      stage: "signed",
      value: 5_000,
      referralSourced: true,
      keyDates: { signed: "2026-07-20T00:00:00.000Z" },
    });
    const result = scoreDeal(deal, ASOF);
    expect(result.score).toBe(80.5);
    expect(result.grade).toBe("A");
    expect(result.terminal).toBe(false);
  });

  it("moving asOf alone changes the score (time is a parameter, not ambient)", () => {
    const deal = makeDeal({ keyDates: { quoted: "2026-07-20T00:00:00.000Z" } });
    const fresh = scoreDeal(deal, ASOF).score;
    const stale = scoreDeal(deal, "2026-12-01T00:00:00.000Z").score;
    expect(stale).toBeLessThan(fresh);
  });

  it("throws loudly on an unparseable asOf", () => {
    expect(() => scoreDeal(makeDeal(), "yesterday-ish")).toThrow(/asOf/);
  });
});
