import { describe, expect, it } from "vitest";
import { buildPhaseChangeActivity, parseDealPhasePatch } from "../crm";

// Q40 inc.11 — the phase write gate. The phase a human states is what the
// Phase 2 ROI guarantee is measured against, so this parser is the seam that
// decides whether a customer's ROI target came from a person or from a typo.

describe("parseDealPhasePatch", () => {
  it("accepts each of the three phases", () => {
    for (const phase of [1, 2, 3] as const) {
      expect(parseDealPhasePatch({ id: "deal-gulf-coast", phase })).toEqual({
        ok: true,
        id: "deal-gulf-coast",
        phase,
      });
    }
  });

  it("accepts null — a rep can take back a wrong phase", () => {
    expect(parseDealPhasePatch({ id: "d1", phase: null })).toEqual({
      ok: true,
      id: "d1",
      phase: null,
    });
  });

  it("refuses an omitted phase — absent is not the same as cleared", () => {
    const r = parseDealPhasePatch({ id: "d1" });
    expect(r.ok).toBe(false);
  });

  it("refuses money and every other smuggled field, whole", () => {
    for (const extra of ["value", "stage", "key_dates", "signed", "notes"]) {
      const r = parseDealPhasePatch({ id: "d1", phase: 2, [extra]: 99999 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(extra);
    }
  });

  it("refuses a stringified phase rather than coercing it", () => {
    // A <select> that forgot Number() must fail loudly, not invent a phase.
    const r = parseDealPhasePatch({ id: "d1", phase: "2" });
    expect(r.ok).toBe(false);
  });

  it("refuses phases outside the 0026 check, and non-integers", () => {
    for (const phase of [0, 4, -1, 1.5, true, {}, []]) {
      expect(parseDealPhasePatch({ id: "d1", phase }).ok).toBe(false);
    }
  });

  it("refuses a missing or empty id, and non-objects", () => {
    expect(parseDealPhasePatch({ phase: 1 }).ok).toBe(false);
    expect(parseDealPhasePatch({ id: "", phase: 1 }).ok).toBe(false);
    for (const body of [null, undefined, "d1", 3, [{ id: "d1", phase: 1 }]]) {
      expect(parseDealPhasePatch(body).ok).toBe(false);
    }
  });
});

describe("buildPhaseChangeActivity", () => {
  const at = "2026-07-28T10:30:00.000Z";

  it("writes one status_change naming both sides", () => {
    const row = buildPhaseChangeActivity({ dealId: "d1", from: 1, to: 2, at });
    expect(row).toMatchObject({
      id: `phase-d1-${at}`,
      deal_id: "d1",
      type: "status_change",
      source: "manual",
      summary: "Phase: Phase 1 → Phase 2",
      occurred_at: at,
    });
    expect(row?.source_context).toEqual({ field: "phase", from: 1, to: 2 });
  });

  it("reads a cleared or first-time phase as 'unstated', never as null on screen", () => {
    expect(buildPhaseChangeActivity({ dealId: "d1", from: 2, to: null, at })?.summary).toBe(
      "Phase: Phase 2 → unstated",
    );
    expect(buildPhaseChangeActivity({ dealId: "d1", from: null, to: 3, at })?.summary).toBe(
      "Phase: unstated → Phase 3",
    );
  });

  it("returns null when nothing changed — no audit churn", () => {
    expect(buildPhaseChangeActivity({ dealId: "d1", from: 2, to: 2, at })).toBeNull();
    expect(buildPhaseChangeActivity({ dealId: "d1", from: null, to: null, at })).toBeNull();
  });

  it("is deterministic per (deal, instant) so a retry upserts instead of stacking", () => {
    const a = buildPhaseChangeActivity({ dealId: "d1", from: 1, to: 3, at });
    const b = buildPhaseChangeActivity({ dealId: "d1", from: 1, to: 3, at });
    expect(a).toEqual(b);
  });
});
