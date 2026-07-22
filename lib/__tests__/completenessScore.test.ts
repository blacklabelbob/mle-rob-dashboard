import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs module, no type declarations
import { scoreRecord, computeAverage } from "../../scripts/enrichment/completeness-score.mjs";

const empty = { id: "x", name: "X" };

describe("scoreRecord (Q7b audit rubric, 0–6)", () => {
  it("scores an empty shell 0 (De Cecco case)", () => {
    expect(scoreRecord(empty).score).toBe(0);
  });

  it("scores the Martin Fierro template shape 5", () => {
    const r = {
      ...empty,
      phone: "(239) 555-0100",
      email: "info@martinfierro.example",
      website: "https://martinfierro.example",
      role: "Restaurant",
      description: "d".repeat(120),
    };
    expect(scoreRecord(r).score).toBe(5);
  });

  it("requires description > 100 chars", () => {
    expect(scoreRecord({ ...empty, description: "short" }).parts.description).toBe(false);
    expect(scoreRecord({ ...empty, description: "d".repeat(101) }).parts.description).toBe(true);
  });

  it("credits a LinkedIn URL in notes as social", () => {
    const r = { ...empty, notes: "profile: https://linkedin.com/in/jane-doe (Sunbiz cross-check)" };
    expect(scoreRecord(r).parts.social).toBe(true);
  });

  it("does NOT credit a bare platform mention with no link", () => {
    const r = { ...empty, notes: "no Facebook found; LinkedIn search came up empty" };
    expect(scoreRecord(r).parts.social).toBe(false);
  });

  it("never double-counts the website link as social", () => {
    const r = {
      ...empty,
      website: "https://example.com",
      notes: "site: https://example.com",
    };
    const { parts } = scoreRecord(r);
    expect(parts.website).toBe(true);
    expect(parts.social).toBe(false);
  });

  it("treats a LinkedIn URL parked in the website field as social, not website (Daniella case)", () => {
    const r = { ...empty, website: "https://www.linkedin.com/in/daniella-r" };
    const { parts } = scoreRecord(r);
    expect(parts.website).toBe(false);
    expect(parts.social).toBe(true);
  });

  it("credits @handles in notes as social", () => {
    expect(scoreRecord({ ...empty, notes: "IG @miga.foods active" }).parts.social).toBe(true);
  });

  it("blank/whitespace fields score nothing", () => {
    expect(scoreRecord({ ...empty, phone: "  ", email: "", role: "\t" }).score).toBe(0);
  });
});

describe("computeAverage", () => {
  it("averages across rows and returns per-row scores", () => {
    const rows = [
      { ...empty, id: "a", phone: "1", email: "a@b.c" }, // 2
      { ...empty, id: "b", role: "Lead" }, // 1
    ];
    const { avg, scored } = computeAverage(rows);
    expect(scored.map((r: { score: number }) => r.score)).toEqual([2, 1]);
    expect(avg).toBeCloseTo(1.5);
  });

  it("returns 0 for an empty table instead of NaN", () => {
    expect(computeAverage([]).avg).toBe(0);
  });
});
