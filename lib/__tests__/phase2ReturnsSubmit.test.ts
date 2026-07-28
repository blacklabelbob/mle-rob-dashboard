// Q63 leg (5) inc.11 — the sequence is the subject. Each test names a way the four
// steps could be ordered wrongly and shows the ordering that prevents it.

import { describe, expect, it, vi } from "vitest";
import { submitPhase2Returns } from "../phases/phase2ReturnsSubmit";
import type { Phase2ReturnsWriteDb } from "../phases/phase2ReturnsWriteDb";

function fakeDb(over: Partial<Phase2ReturnsWriteDb> = {}) {
  return {
    fetchSupersededMeasuredAt: vi.fn(async () => [] as string[]),
    upsertMeasurements: vi.fn(async () => {}),
    supersedeMeasurement: vi.fn(async () => {}),
    reinstateMeasurement: vi.fn(async () => {}),
    ...over,
  } as unknown as Phase2ReturnsWriteDb & {
    fetchSupersededMeasuredAt: ReturnType<typeof vi.fn>;
    upsertMeasurements: ReturnType<typeof vi.fn>;
  };
}

/** What a browser form actually posts: every number is a string. */
function formBody(over: Record<string, unknown> = {}) {
  return {
    customerId: "cg-roofing-group",
    laborHoursSaved: "12",
    laborCostPerHour: "35",
    revenueSincePhase2Start: "18000",
    revenueBasis: "attributed",
    measuredAt: "2026-07-28T19:00:00.000Z",
    measuredBy: "rob",
    ...over,
  };
}

describe("submitPhase2Returns", () => {
  it("stores a form submission whose numbers all arrived as strings", async () => {
    const db = fakeDb();
    const out = await submitPhase2Returns(formBody(), db);

    expect(out.status).toBe("stored");
    if (out.status !== "stored") throw new Error("unreachable");
    expect(out.row.labor_hours_saved).toBe(12);
    expect(out.row.labor_cost_per_hour).toBe(35);
    expect(out.row.revenue_since_phase2_start).toBe(18000);
    expect(db.upsertMeasurements).toHaveBeenCalledWith([out.row]);
  });

  it("refuses a non-object body without inventing field errors for it", async () => {
    const db = fakeDb();
    for (const body of [null, "x", 3, ["a"]]) {
      expect(await submitPhase2Returns(body, db)).toEqual({ status: "not_an_object" });
    }
    expect(db.fetchSupersededMeasuredAt).not.toHaveBeenCalled();
    expect(db.upsertMeasurements).not.toHaveBeenCalled();
  });

  it("returns EVERY failing field in one round trip, and writes nothing", async () => {
    const db = fakeDb();
    const out = await submitPhase2Returns(
      formBody({ customerId: "  ", laborHoursSaved: "twelve", revenueBasis: "vibes" }),
      db,
    );

    expect(out.status).toBe("refused");
    if (out.status !== "refused") throw new Error("unreachable");
    const fields = out.refusals.map((r) => r.field);
    expect(fields).toEqual(expect.arrayContaining(["customerId", "laborHoursSaved", "revenueBasis"]));
    expect(db.upsertMeasurements).not.toHaveBeenCalled();
  });

  it("does not spend a database read on a submission the door already refused", async () => {
    const db = fakeDb();
    await submitPhase2Returns(formBody({ measuredBy: "" }), db);
    expect(db.fetchSupersededMeasuredAt).not.toHaveBeenCalled();
  });

  it("A BLANK FIELD IS NOT ZERO — it is refused, never stored as a measurement of 0", async () => {
    const db = fakeDb();
    const out = await submitPhase2Returns(formBody({ laborHoursSaved: "" }), db);

    expect(out.status).toBe("refused");
    if (out.status !== "refused") throw new Error("unreachable");
    expect(out.refusals).toContainEqual({
      field: "laborHoursSaved",
      reason: "bad_labor_hours_saved",
    });
    expect(db.upsertMeasurements).not.toHaveBeenCalled();
  });

  it("refuses a retracted instant instead of resurrecting it with an upsert", async () => {
    const db = fakeDb({
      fetchSupersededMeasuredAt: vi.fn(async () => ["2026-07-28T19:00:00.000Z"]),
    });
    const out = await submitPhase2Returns(formBody(), db);

    expect(out).toEqual({
      status: "superseded",
      customerId: "cg-roofing-group",
      measuredAt: "2026-07-28T19:00:00.000Z",
    });
    expect(db.upsertMeasurements).not.toHaveBeenCalled();
  });

  it("asks about the NORMALISED instant, so a reformatted date cannot dodge its retraction", async () => {
    const db = fakeDb({
      fetchSupersededMeasuredAt: vi.fn(async () => ["2026-07-28T19:00:00.000Z"]),
    });
    // Same moment, different wire format than the one that was retracted.
    const out = await submitPhase2Returns(formBody({ measuredAt: "Tue, 28 Jul 2026 19:00:00 GMT" }), db);

    expect(db.fetchSupersededMeasuredAt).toHaveBeenCalledWith("cg-roofing-group", [
      "2026-07-28T19:00:00.000Z",
    ]);
    expect(out.status).toBe("superseded");
  });

  it("lets a failed retraction read throw rather than reading it as 'nothing retracted'", async () => {
    const db = fakeDb({
      fetchSupersededMeasuredAt: vi.fn(async () => {
        throw new Error("phase2_returns superseded read: boom");
      }),
    });
    await expect(submitPhase2Returns(formBody(), db)).rejects.toThrow("boom");
    expect(db.upsertMeasurements).not.toHaveBeenCalled();
  });

  it("passes a server-side caller's real numbers through unchanged", async () => {
    const db = fakeDb();
    const out = await submitPhase2Returns(
      { ...formBody(), laborHoursSaved: 12, laborCostPerHour: 35, revenueSincePhase2Start: 18000 },
      db,
    );
    expect(out.status).toBe("stored");
  });
});
