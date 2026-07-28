import { describe, it, expect } from "vitest";
import {
  supabasePhase2ReturnsDb,
  toPhase2ReturnsRow,
  phase2ReturnsReadable,
  PHASE2_RETURNS_TABLE,
  PHASE2_RETURNS_READ_COLUMNS,
  type Phase2ReturnsClient,
} from "@/lib/phases/phase2ReturnsDb";
import { REVENUE_BASES } from "@/lib/phases/phase2ReturnsWrite";

const env = (over: Record<string, string | undefined>) => over as unknown as NodeJS.ProcessEnv;

/** A client that records what was asked of it and answers with `data`/`error`. */
function client(response: { data?: unknown; error?: { message: string } | null }) {
  const calls: { table?: string; columns?: string; eq?: [string, unknown] } = {};
  const filter = {
    eq(column: string, value: unknown) {
      calls.eq = [column, value];
      return filter;
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve({
        data: response.data ?? null,
        error: response.error ?? null,
      }).then(resolve);
    },
  };
  const c = {
    from(table: string) {
      calls.table = table;
      return {
        select(columns: string) {
          calls.columns = columns;
          return filter;
        },
      };
    },
  } as unknown as Phase2ReturnsClient;
  return { c, calls };
}

function raw(over: Record<string, unknown> = {}) {
  return {
    customer_id: "acme",
    labor_hours_saved: 40,
    labor_cost_per_hour: 32,
    revenue_since_phase2_start: 18000,
    revenue_basis: "top_line",
    measured_at: "2026-07-01T00:00:00.000Z",
    measured_by: "rob",
    source: "admin-ui",
    note: null,
    superseded_at: null,
    ...over,
  };
}

describe("toPhase2ReturnsRow", () => {
  it("carries a stored measurement through unchanged", () => {
    expect(toPhase2ReturnsRow(raw())).toEqual({
      customer_id: "acme",
      labor_hours_saved: 40,
      labor_cost_per_hour: 32,
      revenue_since_phase2_start: 18000,
      revenue_basis: "top_line",
      measured_at: "2026-07-01T00:00:00.000Z",
      measured_by: "rob",
      source: "admin-ui",
      note: null,
      superseded_at: null,
    });
  });

  it("NEVER turns an absent number into 0 — 0 hours saved is a real measurement", () => {
    // `Number(null)` is 0 and `Number("")` is 0. If either reached the engine as a
    // number, a column that could not be read would render as a customer who saved
    // nothing — a total shortfall under a money guarantee, invented by a coercion.
    const row = toPhase2ReturnsRow(raw({ labor_hours_saved: null, revenue_since_phase2_start: "" }));
    expect(row?.labor_hours_saved).toBeNull();
    expect(row?.revenue_since_phase2_start).toBeNull();
  });

  it("keeps a real 0 as 0 — absent and zero must not collapse in either direction", () => {
    const row = toPhase2ReturnsRow(raw({ labor_hours_saved: 0 }));
    expect(row?.labor_hours_saved).toBe(0);
  });

  it("reads numeric strings (PostgREST ships doubles as strings on some paths)", () => {
    const row = toPhase2ReturnsRow(raw({ labor_cost_per_hour: "32.5" }));
    expect(row?.labor_cost_per_hour).toBe(32.5);
  });

  it("refuses unreadable numbers rather than passing NaN into the arithmetic", () => {
    const row = toPhase2ReturnsRow(raw({ revenue_since_phase2_start: "eighteen thousand" }));
    expect(row?.revenue_since_phase2_start).toBeNull();
  });

  it("allows negative revenue through — a refund month is real money", () => {
    // Same predicate as `planPhase2ReturnsWrite` / `phase2Guarantee.usableReturns`.
    // A carrier that clamped here would disagree with the door that stored it.
    const row = toPhase2ReturnsRow(raw({ revenue_since_phase2_start: -1200 }));
    expect(row?.revenue_since_phase2_start).toBe(-1200);
  });

  it("does NOT cast an unrecognised basis to a known one", () => {
    // The column exists so a row says WHICH revenue question it answers while
    // Rob's Open Question A is open. Coercing here would put a number under a
    // question it does not answer.
    const row = toPhase2ReturnsRow(raw({ revenue_basis: "gross_margin" }));
    expect(row?.revenue_basis).toBe("gross_margin");
    expect(REVENUE_BASES).not.toContain(row?.revenue_basis as never);
  });

  it("keeps superseded_at rather than dropping retracted readings", () => {
    const row = toPhase2ReturnsRow(raw({ superseded_at: "2026-07-20T00:00:00.000Z" }));
    expect(row?.superseded_at).toBe("2026-07-20T00:00:00.000Z");
  });

  it("returns null for anything that is not a row", () => {
    expect(toPhase2ReturnsRow(null)).toBeNull();
    expect(toPhase2ReturnsRow("acme")).toBeNull();
    expect(toPhase2ReturnsRow([raw()])).toBeNull();
  });
});

describe("supabasePhase2ReturnsDb", () => {
  it("reads 0029 by customer, naming its columns", async () => {
    const { c, calls } = client({ data: [raw()] });
    const rows = await supabasePhase2ReturnsDb(c).fetchCustomerReturns("acme");
    expect(calls.table).toBe(PHASE2_RETURNS_TABLE);
    expect(calls.columns).toBe(PHASE2_RETURNS_READ_COLUMNS);
    expect(calls.eq).toEqual(["customer_id", "acme"]);
    expect(rows).toHaveLength(1);
  });

  it("selects columns explicitly, never `*`", () => {
    expect(PHASE2_RETURNS_READ_COLUMNS).not.toContain("*");
    for (const col of ["labor_hours_saved", "revenue_basis", "measured_at", "superseded_at"]) {
      expect(PHASE2_RETURNS_READ_COLUMNS).toContain(col);
    }
  });

  it("does not order and does not filter — freshest-wins is the pure layer's call", async () => {
    // Two measurements come back in the order Postgres returned them. If the
    // carrier sorted or dropped superseded rows, there would be a SECOND authority
    // over which measurement a customer's guarantee is computed from.
    const older = raw({ measured_at: "2026-06-01T00:00:00.000Z" });
    const retracted = raw({
      measured_at: "2026-07-15T00:00:00.000Z",
      superseded_at: "2026-07-20T00:00:00.000Z",
    });
    const { c } = client({ data: [older, retracted] });
    const rows = await supabasePhase2ReturnsDb(c).fetchCustomerReturns("acme");
    expect(rows.map((r) => r.measured_at)).toEqual([
      "2026-06-01T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
    ]);
  });

  it("THROWS on a failed read — an empty result must not read as 'never measured'", async () => {
    const { c } = client({ error: { message: "permission denied" } });
    await expect(supabasePhase2ReturnsDb(c).fetchCustomerReturns("acme")).rejects.toThrow(
      /phase2_returns read: permission denied/,
    );
  });

  it("answers an empty list when the customer genuinely has no measurements", async () => {
    const { c } = client({ data: [] });
    expect(await supabasePhase2ReturnsDb(c).fetchCustomerReturns("acme")).toEqual([]);
  });

  it("drops non-row payloads rather than shipping half-built rows", async () => {
    const { c } = client({ data: [raw(), null, "acme"] });
    expect(await supabasePhase2ReturnsDb(c).fetchCustomerReturns("acme")).toHaveLength(1);
  });
});

describe("phase2ReturnsReadable", () => {
  it("gates on the service key alone — NOT the phase-signal secret", () => {
    // Measurements are recorded by a human, not by the partner webhook. Gating on
    // PHASE_SIGNAL_WEBHOOK_SECRET would hide a real measurement behind an
    // unrelated seam. Same call as `scanPicksReadable`.
    expect(phase2ReturnsReadable(env({}))).toBe(false);
    expect(phase2ReturnsReadable(env({ SUPABASE_URL: "u" }))).toBe(false);
    expect(phase2ReturnsReadable(env({ SUPABASE_SERVICE_ROLE_KEY: "k" }))).toBe(false);
    expect(
      phase2ReturnsReadable(env({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })),
    ).toBe(true);
    expect(
      phase2ReturnsReadable(env({ PHASE_SIGNAL_WEBHOOK_SECRET: "s", SUPABASE_URL: "u" })),
    ).toBe(false);
  });
});

describe("0029 ↔ the write door agree on the shape", () => {
  it("every column the write row produces is a column the read names", async () => {
    // The pair is what makes a stored measurement readable. A column added to one
    // side and not the other is a measurement that stores and never comes back.
    const { planPhase2ReturnsWrite } = await import("@/lib/phases/phase2ReturnsWrite");
    const plan = planPhase2ReturnsWrite({
      customerId: "acme",
      laborHoursSaved: 40,
      laborCostPerHour: 32,
      revenueSincePhase2Start: 18000,
      revenueBasis: "top_line",
      measuredAt: "2026-07-01T00:00:00.000Z",
      measuredBy: "rob",
    });
    expect(plan.row).toBeDefined();
    for (const col of Object.keys(plan.row as Record<string, unknown>)) {
      expect(PHASE2_RETURNS_READ_COLUMNS.split(",")).toContain(col);
    }
  });
});
