import { describe, expect, it } from "vitest";
import {
  Q85_LEGACY_RETIREMENTS,
  planLegacyRetirements,
  retirementPlanText,
  type LedgerRow,
} from "../legacyRetirement";
import { supersededBy } from "../supersede";

const survivor: LedgerRow = { id: 213, status: "open", dedupeKey: "meeting-archive/person-proposals" };
/**
 * Q85 inc.11 — the second survivor. `meeting-archive/write-blockers` is the keyed writer built
 * for the CAUSE, and it is what releases the holds on #206 and #211. Its presence here is not
 * decoration: with this row absent the pass SKIPS both (asserted below), which is the refusal
 * that keeps a supersede note from pointing at nothing.
 */
const blockerSurvivor: LedgerRow = { id: 214, status: "open", dedupeKey: "meeting-archive/write-blockers" };
/**
 * Q85 inc.12 — the third survivor. `meeting-archive/blocked-by-company` is the per-company
 * worklist, and it is what releases the hold on #207. Same discipline as the row above: with it
 * absent the pass SKIPS #207 rather than filing a note that points at nothing.
 */
const byCompanySurvivor: LedgerRow = { id: 215, status: "open", dedupeKey: "meeting-archive/blocked-by-company" };
const legacy = (id: number, status: LedgerRow["status"] = "open"): LedgerRow => ({ id, status, dedupeKey: null });

const fullLedger: LedgerRow[] = [
  survivor,
  blockerSurvivor,
  byCompanySurvivor,
  ...Q85_LEGACY_RETIREMENTS.map((r) => legacy(r.legacyId)),
];

describe("planLegacyRetirements", () => {
  it("retires only the rows a live keyed row re-states, and holds the rest OPEN", () => {
    const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, fullLedger);
    expect(steps.filter((s) => s.action === "retire").map((s) => s.legacyId)).toEqual([206, 207, 210, 211, 212]);
    expect(steps.filter((s) => s.action === "hold").map((s) => s.legacyId)).toEqual([208, 209]);
    expect(steps.some((s) => s.action === "skip")).toBe(false);
  });

  it("SKIPS #206 and #211 when the blocker writer has not filed its row yet — a hold is released by a live row, never by an edit to this table", () => {
    // The exact state prod is in until `check:archive --flag` runs the new writer once.
    const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, [
      survivor,
      byCompanySurvivor,
      ...Q85_LEGACY_RETIREMENTS.map((r) => legacy(r.legacyId)),
    ]);
    expect(steps.filter((s) => s.action === "skip").map((s) => s.legacyId)).toEqual([206, 211]);
    for (const step of steps.filter((s) => s.action === "skip")) {
      expect((step as { reason: string }).reason).toContain("meeting-archive/write-blockers");
    }
  });

  it("SKIPS #207 when the per-company writer has not filed its row yet — inc.12's own hold, released the same way", () => {
    const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, [
      survivor,
      blockerSurvivor,
      ...Q85_LEGACY_RETIREMENTS.map((r) => legacy(r.legacyId)),
    ]);
    expect(steps.filter((s) => s.action === "skip").map((s) => s.legacyId)).toEqual([207]);
    expect((steps.find((s) => s.legacyId === 207) as { reason: string }).reason).toContain(
      "meeting-archive/blocked-by-company",
    );
  });

  it("points every retirement at the survivor's real id, in the grammar the Reopen control reads", () => {
    const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, fullLedger);
    // Two survivors now, and each retirement must point at ITS OWN — a note pointing at the
    // wrong live row is the same defect as one pointing at nothing, only harder to spot.
    const expected: Record<number, number> = { 206: 214, 207: 215, 210: 213, 211: 214, 212: 213 };
    for (const step of steps) {
      if (step.action !== "retire") continue;
      expect(step.survivorId).toBe(expected[step.legacyId]);
      expect(supersededBy(step.note)).toBe(expected[step.legacyId]);
    }
  });

  it("refuses to supersede when the survivor key holds no OPEN row — a note pointing at nothing", () => {
    const ledger = [{ ...survivor, status: "resolved" as const }, legacy(212)];
    const steps = planLegacyRetirements([Q85_LEGACY_RETIREMENTS.find((r) => r.legacyId === 212)!], ledger);
    expect(steps[0]).toMatchObject({ action: "skip" });
    expect((steps[0] as { reason: string }).reason).toContain("meeting-archive/person-proposals");
  });

  it("never touches a KEYED row — those belong to planFlagWrite, not to this one-time pass", () => {
    const keyed: LedgerRow = { id: 212, status: "open", dedupeKey: "some/key" };
    const steps = planLegacyRetirements([Q85_LEGACY_RETIREMENTS.find((r) => r.legacyId === 212)!], [survivor, keyed]);
    expect(steps[0]).toMatchObject({ action: "skip" });
    expect((steps[0] as { reason: string }).reason).toContain("some/key");
  });

  it("leaves an already-resolved row alone rather than rewriting Rob's own resolution note", () => {
    const steps = planLegacyRetirements(
      [Q85_LEGACY_RETIREMENTS.find((r) => r.legacyId === 212)!],
      [survivor, legacy(212, "resolved")],
    );
    expect(steps[0]).toMatchObject({ action: "skip" });
    expect((steps[0] as { reason: string }).reason).toContain("already resolved");
  });

  it("skips a row that is not on the ledger at all", () => {
    const steps = planLegacyRetirements([Q85_LEGACY_RETIREMENTS.find((r) => r.legacyId === 210)!], [survivor]);
    expect(steps[0]).toMatchObject({ action: "skip", legacyId: 210 });
  });

  it("is idempotent: re-running after the retirements landed proposes no second write", () => {
    const after: LedgerRow[] = [
      survivor,
      blockerSurvivor,
      ...Q85_LEGACY_RETIREMENTS.map((r) =>
        r.disposition === "retire" ? legacy(r.legacyId, "resolved") : legacy(r.legacyId),
      ),
    ];
    const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, after);
    expect(steps.some((s) => s.action === "retire")).toBe(false);
    expect(steps.filter((s) => s.action === "hold")).toHaveLength(2);
  });
});

describe("the mapping itself", () => {
  it("gives every rule a reason, and every retire rule a survivor key", () => {
    for (const rule of Q85_LEGACY_RETIREMENTS) {
      expect(rule.why.length).toBeGreaterThan(40);
      if (rule.disposition === "retire") expect(rule.survivorKey).toBeTruthy();
      else expect(rule.survivorKey).toBeUndefined();
    }
  });

  it("covers #206-#212 exactly once each — the seven rows inc.9 found open at the same time", () => {
    expect(Q85_LEGACY_RETIREMENTS.map((r) => r.legacyId)).toEqual([206, 207, 208, 209, 210, 211, 212]);
  });
});

describe("retirementPlanText", () => {
  it("counts the held rows separately from the skipped ones, so a hold never reads as a failure", () => {
    const text = retirementPlanText(planLegacyRetirements(Q85_LEGACY_RETIREMENTS, fullLedger));
    expect(text).toContain("5 to retire · 2 held open on purpose · 0 skipped");
    expect(text).toContain("HOLD    #208  stays OPEN");
    expect(text).toContain("RETIRE  #212 → #213");
  });
});
