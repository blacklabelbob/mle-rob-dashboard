import { describe, expect, it } from "vitest";
import { computeStats, contribution, isDisputedSigned } from "../stats";
import type { NetworkData, Person } from "../types";

// The exact failure that shipped 2026-07-17: pair-row double count + disputed
// summed clean → "$44k" on the Overview when the truth was $15k. Never again.

const person = (over: Partial<Person>): Person => ({
  id: "x", name: "X", verticalId: "v", status: "unlit", signed: false,
  keyDates: {}, phaseOne: "not-started", ...over,
});

const data = (people: Person[]): NetworkData => ({ people, edges: [], verticals: [], projects: [] });

describe("isDisputedSigned", () => {
  it("signed with a date is NOT disputed", () => {
    expect(isDisputedSigned(person({ signed: true, keyDates: { signed: "2026-06-22" } }))).toBe(false);
  });
  it("signed WITHOUT a date IS disputed (the Gulf Coast case)", () => {
    expect(isDisputedSigned(person({ signed: true, keyDates: { quoted: "2026-06-19" } }))).toBe(true);
  });
  it("unsigned is never disputed", () => {
    expect(isDisputedSigned(person({ signed: false }))).toBe(false);
  });
});

describe("computeStats — signed value truthfulness", () => {
  it("reproduces the 2026-07-17 live case: $15k verified + $19k disputed, not $44k", () => {
    const stats = computeStats(data([
      person({ id: "caleb", signed: true, quotedAmount: undefined, keyDates: { signed: "2026-06-22" } }), // deal moved to company row
      person({ id: "cg", signed: true, quotedAmount: 10000, keyDates: { signed: "2026-06-22" } }),
      person({ id: "naples", signed: true, quotedAmount: 5000, keyDates: { signed: "2026-07-01" } }),
      person({ id: "gulf", signed: true, quotedAmount: 19000, keyDates: { quoted: "2026-06-19" } }), // disputed
    ]));
    expect(stats.signedValue).toBe(15000);
    expect(stats.disputedSignedValue).toBe(19000);
  });
  it("disputed rows are excluded from signedValue AND from pipelineQuoted", () => {
    const stats = computeStats(data([person({ signed: true, quotedAmount: 19000 })]));
    expect(stats.signedValue).toBe(0);
    expect(stats.disputedSignedValue).toBe(19000);
    expect(stats.pipelineQuoted).toBe(0);
  });
  it("pair rows cannot double-count when the deal lives on one row", () => {
    const stats = computeStats(data([
      person({ id: "p", signed: true, keyDates: { signed: "2026-06-22" } }),
      person({ id: "org", signed: true, quotedAmount: 10000, keyDates: { signed: "2026-06-22" } }),
    ]));
    expect(stats.signedValue).toBe(10000);
  });
});

describe("contribution", () => {
  it("paper + probability-weighted estimate", () => {
    expect(contribution(person({ quotedAmount: 1000, estimate: { estRevenue: 10000, probability: 0.5, estNewNodes: 1, reasoning: "", runAt: "" } as never }))).toBe(6000);
  });
  it("zero when nothing known", () => {
    expect(contribution(person({}))).toBe(0);
  });
});
