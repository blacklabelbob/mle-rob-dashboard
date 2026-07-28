import { describe, it, expect } from "vitest";
import {
  loadPhase2Returns,
  phase2ReturnsReadable,
  type Phase2ReturnsLoadDeps,
} from "@/lib/phases/phase2ReturnsLoad";
import type { Phase2ReturnsDb, Phase2ReturnsRow } from "@/lib/phases/phase2ReturnsDb";
import { phase2Guarantee } from "@/lib/phases/phase2Guarantee";

function row(over: Partial<Phase2ReturnsRow> = {}): Phase2ReturnsRow {
  return {
    customer_id: "acme",
    labor_hours_saved: 120,
    labor_cost_per_hour: 45,
    revenue_since_phase2_start: 60_000,
    revenue_basis: "attributed",
    measured_at: "2026-07-01T00:00:00.000Z",
    measured_by: "rob",
    source: "quickbooks",
    note: null,
    superseded_at: null,
    ...over,
  };
}

function deps(over: Partial<Phase2ReturnsLoadDeps> = {}): Phase2ReturnsLoadDeps {
  return {
    enabled: true,
    db: () => ({ fetchCustomerReturns: async () => [row()] }) as Phase2ReturnsDb,
    onError: () => {},
    ...over,
  };
}

const env = (over: Record<string, string | undefined>) => over as unknown as NodeJS.ProcessEnv;

describe("phase2ReturnsReadable (re-exported so a page has one import)", () => {
  it("gates on the service key alone — NOT the phase-signal secret", () => {
    expect(phase2ReturnsReadable(env({}))).toBe(false);
    expect(phase2ReturnsReadable(env({ SUPABASE_URL: "u" }))).toBe(false);
    expect(
      phase2ReturnsReadable(env({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })),
    ).toBe(true);
    expect(
      phase2ReturnsReadable(env({ PHASE_SIGNAL_WEBHOOK_SECRET: "s", SUPABASE_URL: "u" })),
    ).toBe(false);
  });
});

describe("loadPhase2Returns", () => {
  it("hands the freshest readable measurement to the guarantee", async () => {
    const result = await loadPhase2Returns("acme", {
      ...deps(),
      db: () =>
        ({
          fetchCustomerReturns: async () => [
            row({ measured_at: "2026-05-01T00:00:00.000Z", labor_hours_saved: 10 }),
            row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: 120 }),
          ],
        }) as Phase2ReturnsDb,
    });
    expect(result.unavailable).toBe(false);
    expect(result.selection.measuredAt).toBe("2026-07-01T00:00:00.000Z");
    expect(result.selection.returns?.laborHoursSaved).toBe(120);
    // The point of the whole leg: this is what stops the board saying AWAITING_DATA
    // about a customer somebody measured.
    const status = phase2Guarantee({
      startedAt: "2026-06-01",
      investment: 25_000,
      returns: result.selection.returns,
      asOf: "2026-07-28",
    });
    expect(status.state).toBe("RUNNING");
  });

  it("passes the customer id to the selector, so another customer's rows are refused", async () => {
    const result = await loadPhase2Returns("acme", {
      ...deps(),
      db: () =>
        ({ fetchCustomerReturns: async () => [row({ customer_id: "other-co" })] }) as Phase2ReturnsDb,
    });
    expect(result.selection.returns).toBeUndefined();
    expect(result.selection.excluded).toEqual([
      { measuredAt: "2026-07-01T00:00:00.000Z", reason: "wrong_customer" },
    ]);
    expect(result.unavailable).toBe(false);
  });

  it("reports a read failure as unavailable — never as an empty selection", async () => {
    const seen: unknown[] = [];
    const result = await loadPhase2Returns("acme", {
      ...deps({ onError: (e) => seen.push(e) }),
      db: () =>
        ({
          fetchCustomerReturns: async () => {
            throw new Error("phase2_returns read: boom");
          },
        }) as Phase2ReturnsDb,
    });
    expect(result.unavailable).toBe(true);
    expect(result.selection.returns).toBeUndefined();
    expect(result.selection.considered).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it("never throws out of a server component", async () => {
    await expect(
      loadPhase2Returns("acme", {
        ...deps(),
        db: () => {
          throw new Error("no client");
        },
      }),
    ).resolves.toMatchObject({ unavailable: true });
  });

  it("not armed is not unavailable — no store to fail means no alarm", async () => {
    const result = await loadPhase2Returns("acme", {
      enabled: false,
      db: () => {
        throw new Error("must not be called");
      },
    });
    expect(result).toEqual({
      selection: { excluded: [], newerUnusable: false, considered: 0 },
      unavailable: false,
    });
  });

  it("an empty customer id never reaches the database", async () => {
    let called = 0;
    const result = await loadPhase2Returns("   ", {
      ...deps(),
      db: () => {
        called += 1;
        return { fetchCustomerReturns: async () => [row()] } as Phase2ReturnsDb;
      },
    });
    expect(called).toBe(0);
    expect(result.unavailable).toBe(false);
    expect(result.selection.returns).toBeUndefined();
  });

  it("a retracted measurement is set aside, not read as never-measured", async () => {
    const result = await loadPhase2Returns("acme", {
      ...deps(),
      db: () =>
        ({
          fetchCustomerReturns: async () => [
            row({ superseded_at: "2026-07-10T00:00:00.000Z" }),
          ],
        }) as Phase2ReturnsDb,
    });
    expect(result.selection.returns).toBeUndefined();
    expect(result.selection.excluded).toEqual([
      { measuredAt: "2026-07-01T00:00:00.000Z", reason: "retracted" },
    ]);
    expect(result.unavailable).toBe(false);
  });

  it("trims the id it queries and selects with, so a padded id is not a miss", async () => {
    let asked: string | null = null;
    const result = await loadPhase2Returns("  acme  ", {
      ...deps(),
      db: () =>
        ({
          fetchCustomerReturns: async (id: string) => {
            asked = id;
            return [row()];
          },
        }) as Phase2ReturnsDb,
    });
    expect(asked).toBe("acme");
    expect(result.selection.returns?.laborHoursSaved).toBe(120);
  });
});
