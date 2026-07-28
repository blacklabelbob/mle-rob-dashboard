// Q63 leg (5) inc.3 — the Supabase carrier for the measured-returns write door.
//
// What is at risk here is not arithmetic, it is the SHAPE OF THE REQUEST that goes
// out: the conflict target, one statement instead of a loop, the `is null` guard on
// a retraction, the absence of `superseded_at` from the upsert payload, and the fact
// that a failed read is never returned as "nothing". Each is a wrong-but-running
// failure whose only symptom is a paying customer's ROI guarantee reading SURPLUS or
// SHORTFALL off numbers nobody stands behind. So these tests assert the CALLS, not
// just the return values.

import { describe, expect, it } from "vitest";
import {
  PHASE2_RETURNS_CONFLICT,
  supabasePhase2ReturnsWriteDb,
  type Phase2ReturnsWriteClient,
} from "../phases/phase2ReturnsWriteDb";
import { PHASE2_RETURNS_TABLE } from "../phases/phase2ReturnsDb";
import { planPhase2ReturnsWrite } from "../phases/phase2ReturnsWrite";

type Call =
  | {
      op: "select";
      table: string;
      columns: string;
      eqs: Array<[string, unknown]>;
      ins: Array<[string, readonly unknown[]]>;
      nots: Array<[string, string, unknown]>;
    }
  | { op: "upsert"; table: string; rows: unknown[]; onConflict?: string }
  | {
      op: "update";
      table: string;
      patch: Record<string, unknown>;
      eqs: Array<[string, unknown]>;
      iss: Array<[string, unknown]>;
    };

function fakeClient(opts: { data?: unknown; readError?: string; writeError?: string } = {}) {
  const calls: Call[] = [];
  const client: Phase2ReturnsWriteClient = {
    from(table: string) {
      return {
        select(columns: string) {
          const record: Call = { op: "select", table, columns, eqs: [], ins: [], nots: [] };
          calls.push(record);
          const chain = {
            eq(column: string, value: unknown) {
              (record as { eqs: Array<[string, unknown]> }).eqs.push([column, value]);
              return chain;
            },
            in(column: string, values: readonly unknown[]) {
              (record as { ins: Array<[string, readonly unknown[]]> }).ins.push([column, values]);
              return chain;
            },
            not(column: string, op: string, value: unknown) {
              (record as { nots: Array<[string, string, unknown]> }).nots.push([column, op, value]);
              return chain;
            },
            then(resolve: (v: { data: unknown; error: { message: string } | null }) => unknown) {
              return Promise.resolve(
                opts.readError
                  ? { data: null, error: { message: opts.readError } }
                  : { data: opts.data ?? [], error: null },
              ).then(resolve);
            },
          };
          return chain as never;
        },
        upsert(rows: unknown, options?: { onConflict?: string }) {
          calls.push({
            op: "upsert",
            table,
            rows: rows as unknown[],
            onConflict: options?.onConflict,
          });
          return {
            then(resolve: (v: { error: { message: string } | null }) => unknown) {
              return Promise.resolve({
                error: opts.writeError ? { message: opts.writeError } : null,
              }).then(resolve);
            },
          } as never;
        },
        update(patch: Record<string, unknown>) {
          const record: Call = { op: "update", table, patch, eqs: [], iss: [] };
          calls.push(record);
          const chain = {
            eq(column: string, value: unknown) {
              (record as { eqs: Array<[string, unknown]> }).eqs.push([column, value]);
              return chain;
            },
            is(column: string, value: unknown) {
              (record as { iss: Array<[string, unknown]> }).iss.push([column, value]);
              return chain;
            },
            then(resolve: (v: { error: { message: string } | null }) => unknown) {
              return Promise.resolve({
                error: opts.writeError ? { message: opts.writeError } : null,
              }).then(resolve);
            },
          };
          return chain as never;
        },
      };
    },
  };
  return { client, calls };
}

function plannedRow(over: Partial<Parameters<typeof planPhase2ReturnsWrite>[0]> = {}) {
  const plan = planPhase2ReturnsWrite({
    customerId: "cust-1",
    laborHoursSaved: 42,
    laborCostPerHour: 28,
    revenueSincePhase2Start: 91000,
    revenueBasis: "top_line",
    measuredAt: "2026-06-30T00:00:00.000Z",
    measuredBy: "rob",
    ...over,
  });
  if (!plan.row) throw new Error(`test fixture refused: ${JSON.stringify(plan.refusals)}`);
  return plan.row;
}

describe("upsertMeasurements", () => {
  it("sends the whole submission in ONE statement — a loop half-stores a history", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).upsertMeasurements([
      plannedRow(),
      plannedRow({ measuredAt: "2026-07-31T00:00:00.000Z" }),
    ]);
    const upserts = calls.filter((c) => c.op === "upsert");
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("upserts against 0029's identity index — a correction must NOT append", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).upsertMeasurements([plannedRow()]);
    const upsert = calls.find((c) => c.op === "upsert") as { table: string; onConflict?: string };
    expect(upsert.table).toBe(PHASE2_RETURNS_TABLE);
    expect(upsert.onConflict).toBe(PHASE2_RETURNS_CONFLICT);
    // Pinned against the migration: two rows claiming the same instant with
    // different numbers is a guarantee status that flips between page loads.
    expect(PHASE2_RETURNS_CONFLICT).toBe("customer_id,measured_at");
  });

  it("carries the planner's row verbatim — the carrier decides nothing", async () => {
    const row = plannedRow();
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).upsertMeasurements([row]);
    const rows = (calls.find((c) => c.op === "upsert") as { rows: unknown[] }).rows;
    expect(rows[0]).toEqual(row);
  });

  it("never carries superseded_at — a re-record must not silently resurrect a retraction", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).upsertMeasurements([plannedRow()]);
    const rows = (calls.find((c) => c.op === "upsert") as { rows: unknown[] }).rows;
    expect(Object.keys(rows[0] as object)).not.toContain("superseded_at");
  });

  it("refuses an empty submission rather than reporting a stored measurement", async () => {
    const { client, calls } = fakeClient();
    await expect(supabasePhase2ReturnsWriteDb(client).upsertMeasurements([])).rejects.toThrow(
      /no rows/,
    );
    expect(calls).toHaveLength(0);
  });

  it("throws on a write failure — a silent one reads as 'measured' upstream", async () => {
    const { client } = fakeClient({ writeError: "permission denied" });
    await expect(
      supabasePhase2ReturnsWriteDb(client).upsertMeasurements([plannedRow()]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("fetchSupersededMeasuredAt", () => {
  it("asks only for retracted rows belonging to that one customer", async () => {
    const { client, calls } = fakeClient({ data: [{ measured_at: "2026-06-30T00:00:00+00:00" }] });
    const got = await supabasePhase2ReturnsWriteDb(client).fetchSupersededMeasuredAt("cust-1", [
      "2026-06-30T00:00:00.000Z",
      "2026-07-31T00:00:00.000Z",
    ]);
    const select = calls.find((c) => c.op === "select") as Extract<Call, { op: "select" }>;
    expect(select.table).toBe(PHASE2_RETURNS_TABLE);
    expect(select.columns).toBe("measured_at");
    expect(select.eqs).toEqual([["customer_id", "cust-1"]]);
    expect(select.ins[0][1]).toHaveLength(2);
    expect(select.nots).toEqual([["superseded_at", "is", null]]);
    expect(got).toEqual(["2026-06-30T00:00:00+00:00"]);
  });

  it("asks nothing when nothing was submitted — an empty in() is a syntax error", async () => {
    const { client, calls } = fakeClient();
    expect(await supabasePhase2ReturnsWriteDb(client).fetchSupersededMeasuredAt("cust-1", [])).toEqual(
      [],
    );
    expect(calls).toHaveLength(0);
  });

  it("throws on a failed read — [] would claim nothing was ever retracted", async () => {
    const { client } = fakeClient({ readError: "timeout" });
    await expect(
      supabasePhase2ReturnsWriteDb(client).fetchSupersededMeasuredAt("cust-1", [
        "2026-06-30T00:00:00.000Z",
      ]),
    ).rejects.toThrow(/timeout/);
  });

  it("ignores unreadable rows rather than emitting empty instants", async () => {
    const { client } = fakeClient({ data: [null, {}, { measured_at: "2026-06-30T00:00:00+00:00" }] });
    expect(
      await supabasePhase2ReturnsWriteDb(client).fetchSupersededMeasuredAt("cust-1", ["x"]),
    ).toEqual(["2026-06-30T00:00:00+00:00"]);
  });
});

describe("supersedeMeasurement", () => {
  it("dates only a LIVE measurement — a second retraction must not re-date the first", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).supersedeMeasurement(
      { customer_id: "cust-1", measured_at: "2026-06-30T00:00:00.000Z" },
      { superseded_at: "2026-07-28T00:00:00.000Z" },
    );
    const update = calls.find((c) => c.op === "update") as Extract<Call, { op: "update" }>;
    expect(update.table).toBe(PHASE2_RETURNS_TABLE);
    expect(update.patch).toEqual({ superseded_at: "2026-07-28T00:00:00.000Z" });
    expect(update.eqs).toEqual([
      ["customer_id", "cust-1"],
      ["measured_at", "2026-06-30T00:00:00.000Z"],
    ]);
    expect(update.iss).toEqual([["superseded_at", null]]);
  });

  it("never deletes — the record that a measurement was taken survives being wrong", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).supersedeMeasurement(
      { customer_id: "cust-1", measured_at: "2026-06-30T00:00:00.000Z" },
      { superseded_at: "2026-07-28T00:00:00.000Z" },
    );
    expect(calls.every((c) => c.op !== "upsert")).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["update"]);
  });

  it("throws on failure — a swallowed error leaves a retracted figure driving the guarantee", async () => {
    const { client } = fakeClient({ writeError: "denied" });
    await expect(
      supabasePhase2ReturnsWriteDb(client).supersedeMeasurement(
        { customer_id: "cust-1", measured_at: "2026-06-30T00:00:00.000Z" },
        { superseded_at: "2026-07-28T00:00:00.000Z" },
      ),
    ).rejects.toThrow(/denied/);
  });
});

describe("reinstateMeasurement", () => {
  it("is the ONLY path that clears the date, and it is unfiltered by live-ness", async () => {
    const { client, calls } = fakeClient();
    await supabasePhase2ReturnsWriteDb(client).reinstateMeasurement({
      customer_id: "cust-1",
      measured_at: "2026-06-30T00:00:00.000Z",
    });
    const update = calls.find((c) => c.op === "update") as Extract<Call, { op: "update" }>;
    expect(update.patch).toEqual({ superseded_at: null });
    expect(update.iss).toEqual([]);
    expect(update.eqs).toEqual([
      ["customer_id", "cust-1"],
      ["measured_at", "2026-06-30T00:00:00.000Z"],
    ]);
  });

  it("throws on failure", async () => {
    const { client } = fakeClient({ writeError: "denied" });
    await expect(
      supabasePhase2ReturnsWriteDb(client).reinstateMeasurement({
        customer_id: "cust-1",
        measured_at: "2026-06-30T00:00:00.000Z",
      }),
    ).rejects.toThrow(/denied/);
  });
});
