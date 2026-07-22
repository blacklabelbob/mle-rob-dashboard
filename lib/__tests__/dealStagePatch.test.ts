import { describe, expect, it } from "vitest";
import { DEAL_STAGES, parseDealStagePatch } from "../crm";

// The drag board's write gate: only {id, stage} may pass. The hard limit
// (never touch value/keyDates/money through this path) is enforced here as
// code — a smuggled field rejects the WHOLE request, not just the field.

describe("parseDealStagePatch", () => {
  it("accepts a plain stage move", () => {
    const r = parseDealStagePatch({ id: "deal-golf-coast", stage: "negotiating" });
    expect(r).toEqual({ ok: true, id: "deal-golf-coast", stage: "negotiating" });
  });

  it("accepts every ladder stage", () => {
    for (const stage of DEAL_STAGES) {
      expect(parseDealStagePatch({ id: "d1", stage }).ok).toBe(true);
    }
  });

  it("refuses value alongside the stage change", () => {
    const r = parseDealStagePatch({ id: "d1", stage: "paid", value: 99999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("value");
  });

  it("refuses keyDates and any other smuggled field", () => {
    for (const extra of ["keyDates", "key_dates", "estimate", "bookProtected", "notes"]) {
      const r = parseDealStagePatch({ id: "d1", stage: "signed", [extra]: {} });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(extra);
    }
  });

  it("refuses unknown stages", () => {
    expect(parseDealStagePatch({ id: "d1", stage: "closed_won" }).ok).toBe(false);
  });

  it("refuses missing/empty id and non-object bodies", () => {
    expect(parseDealStagePatch({ stage: "paid" }).ok).toBe(false);
    expect(parseDealStagePatch({ id: "", stage: "paid" }).ok).toBe(false);
    expect(parseDealStagePatch(null).ok).toBe(false);
    expect(parseDealStagePatch([{ id: "d1", stage: "paid" }]).ok).toBe(false);
    expect(parseDealStagePatch("id=d1").ok).toBe(false);
  });
});
