import { describe, expect, it } from "vitest";
import { ACTIVITY_SOURCES, ACTIVITY_TYPES, buildStageChangeActivity } from "../crm";

// Task 4.7 audit trail. The route trusts nothing from the client: the row is
// built from the before/after the server read itself. These tests pin the
// row shape to the activities DDL (0005_crm_core.sql) and the exactly-one
// guarantee (same-stage → null; same instant → same id → upsert dedupe).

const args = {
  dealId: "deal-golf-coast",
  from: "contacted",
  to: "negotiating",
  at: "2026-07-22T16:00:00.000Z",
} as const;

describe("buildStageChangeActivity", () => {
  it("builds a status_change row anchored to the deal with before/after context", () => {
    const row = buildStageChangeActivity(args);
    expect(row).toEqual({
      id: "stage-deal-golf-coast-2026-07-22T16:00:00.000Z",
      deal_id: "deal-golf-coast",
      type: "status_change",
      source: "manual",
      source_context: { from: "contacted", to: "negotiating" },
      summary: "Stage: contacted → negotiating",
      occurred_at: "2026-07-22T16:00:00.000Z",
    });
  });

  it("uses type/source values the DDL check constraints accept", () => {
    const row = buildStageChangeActivity(args)!;
    expect(ACTIVITY_TYPES).toContain(row.type);
    expect(ACTIVITY_SOURCES).toContain(row.source);
  });

  it("returns null when the stage did not change (no audit row for no-op drags)", () => {
    expect(buildStageChangeActivity({ ...args, to: "contacted" })).toBeNull();
  });

  it("is deterministic on inputs — a retried request maps to the SAME id", () => {
    expect(buildStageChangeActivity(args)).toEqual(buildStageChangeActivity(args));
  });

  it("distinct instants get distinct ids (two real changes → two rows)", () => {
    const later = buildStageChangeActivity({ ...args, at: "2026-07-22T16:05:00.000Z" })!;
    expect(later.id).not.toBe(buildStageChangeActivity(args)!.id);
  });
});
