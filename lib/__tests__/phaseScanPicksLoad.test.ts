import { describe, it, expect } from "vitest";
import { loadScanPicks, scanPicksReadable } from "@/lib/phases/scanPicksLoad";
import {
  supabaseScanPicksDb,
  toScanPickRow,
  SCAN_PICKS_TABLE,
  SCAN_PICKS_READ_COLUMNS,
  type ScanPicksClient,
  type ScanPicksDb,
} from "@/lib/phases/scanPicksDb";
import type { ScanPickRow } from "@/lib/phases/scanPicksRow";
import { aimForNext } from "@/lib/phases/aimForNext";

function row(over: Partial<ScanPickRow> = {}): ScanPickRow {
  return {
    customer_id: "acme",
    pick_id: "missed-call-textback",
    label: "Missed-call text-back",
    why: null,
    rank: 1,
    recorded_by: "rob",
    recorded_at: "2026-07-28T00:00:00.000Z",
    withdrawn_at: null,
    source: "growth-scan",
    ...over,
  };
}

function db(over: Partial<ScanPicksDb> = {}): () => ScanPicksDb {
  return () => ({ fetchCustomerPicks: async () => [row()], ...over });
}

const env = (over: Record<string, string | undefined>) => over as unknown as NodeJS.ProcessEnv;

describe("scanPicksReadable", () => {
  it("gates on the service key alone — NOT the phase-signal secret", () => {
    // 0027 is applied and its rows are recorded by a human, not by the partner
    // webhook. Gating on PHASE_SIGNAL_WEBHOOK_SECRET (as loadComponentLive must)
    // would hide a deliberately recorded shortlist behind an unrelated seam.
    expect(scanPicksReadable(env({}))).toBe(false);
    expect(scanPicksReadable(env({ SUPABASE_URL: "u" }))).toBe(false);
    expect(scanPicksReadable(env({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }))).toBe(true);
    expect(
      scanPicksReadable(env({ PHASE_SIGNAL_WEBHOOK_SECRET: "s", SUPABASE_URL: "u" })),
    ).toBe(false);
  });
});

describe("loadScanPicks", () => {
  it("hands the blueprint an ordered shortlist off the stored rows", async () => {
    const out = await loadScanPicks("acme", {
      enabled: true,
      db: db({
        fetchCustomerPicks: async () => [
          row({ pick_id: "b", label: "B", rank: 2 }),
          row({ pick_id: "a", label: "A", rank: 1 }),
        ],
      }),
    });
    expect(out.picks.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out.unavailable).toBe(false);
  });

  it("passes the pure module's withdrawn + skipped accounting straight through", async () => {
    const out = await loadScanPicks("acme", {
      enabled: true,
      db: db({
        fetchCustomerPicks: async () => [
          row({ pick_id: "gone", withdrawn_at: "2026-07-28T00:00:00.000Z" }),
          row({ pick_id: "nolabel", label: "  " }),
          row(),
        ],
      }),
    });
    expect(out.withdrawn).toBe(1);
    expect(out.skipped).toEqual([{ pickId: "nolabel", reason: "no_label" }]);
    expect(out.picks).toHaveLength(1);
  });

  it("NEVER throws — a picks outage must not 500 the record page", async () => {
    const seen: unknown[] = [];
    const out = await loadScanPicks("acme", {
      enabled: true,
      db: db({
        fetchCustomerPicks: async () => {
          throw new Error("boom");
        },
      }),
      onError: (e) => seen.push(e),
    });
    expect(out.picks).toEqual([]);
    // The whole point of the increment: a failed read is REPORTED, never rendered
    // as "nobody has picked this customer's automations yet".
    expect(out.unavailable).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("not armed is not unavailable — and an empty id never queries", async () => {
    const off = await loadScanPicks("acme", { enabled: false, db: db() });
    expect(off).toEqual({ picks: [], withdrawn: 0, skipped: [], unavailable: false });

    let asked = 0;
    const blank = await loadScanPicks("   ", {
      enabled: true,
      db: db({
        fetchCustomerPicks: async () => {
          asked += 1;
          return [];
        },
      }),
    });
    expect(asked).toBe(0);
    expect(blank.unavailable).toBe(false);
  });

  it("trims the customer id before it reaches the query", async () => {
    let askedFor = "";
    await loadScanPicks("  acme  ", {
      enabled: true,
      db: db({
        fetchCustomerPicks: async (id) => {
          askedFor = id;
          return [];
        },
      }),
    });
    expect(askedFor).toBe("acme");
  });
});

describe("supabaseScanPicksDb", () => {
  function client(res: { data: unknown; error: { message: string } | null }) {
    const calls: { table: string; columns: string; eq: [string, unknown][] } = {
      table: "",
      columns: "",
      eq: [],
    };
    const filter = {
      eq(column: string, value: unknown) {
        calls.eq.push([column, value]);
        return filter;
      },
      then: (resolve: (v: typeof res) => unknown) => Promise.resolve(res).then(resolve),
    };
    const c: ScanPicksClient = {
      from(table: string) {
        calls.table = table;
        return {
          select(columns: string) {
            calls.columns = columns;
            return filter as never;
          },
        };
      },
    };
    return { c, calls };
  }

  it("reads 0027's named columns for one customer, filtered on nothing else", async () => {
    const { c, calls } = client({ data: [row()], error: null });
    const rows = await supabaseScanPicksDb(c).fetchCustomerPicks("acme");
    expect(calls.table).toBe(SCAN_PICKS_TABLE);
    expect(calls.columns).toBe(SCAN_PICKS_READ_COLUMNS);
    // No `withdrawn_at is null` filter: the pure module COUNTS withdrawn rows, and
    // filtering here would make a taken-back recommendation indistinguishable from
    // one that was never made.
    expect(calls.eq).toEqual([["customer_id", "acme"]]);
    expect(rows).toHaveLength(1);
  });

  it("throws on a failed read rather than reporting an empty shortlist", async () => {
    const { c } = client({ data: null, error: { message: "timeout" } });
    await expect(supabaseScanPicksDb(c).fetchCustomerPicks("acme")).rejects.toThrow(/timeout/);
  });

  it("coerces an unreadable rank to null, never NaN", () => {
    // NaN compares false against everything, so it does not sort last — it makes
    // the sort's outcome depend on the array's starting order.
    expect(toScanPickRow({ ...row(), rank: "nonsense" })?.rank).toBeNull();
    expect(toScanPickRow({ ...row(), rank: null })?.rank).toBeNull();
    expect(toScanPickRow({ ...row(), rank: 3 })?.rank).toBe(3);
    expect(toScanPickRow(null)).toBeNull();
  });

  it("keeps an id-less row so the pure module can REPORT it, not drop it", () => {
    expect(toScanPickRow({ ...row(), pick_id: null })?.pick_id).toBe("");
  });
});

describe("aimForNext PICKS_UNAVAILABLE", () => {
  const base = {
    phase1LiveCount: 1,
    phase1TotalCount: 3,
    growthScanLiveAt: "2026-07-01",
    phase2Attribution: "none" as const,
    asOf: "2026-07-28",
  };

  it("does not claim 'not picked yet' when the store could not be read", () => {
    const aim = aimForNext({ ...base, picksUnavailable: true });
    expect(aim.state).toBe("PICKS_UNAVAILABLE");
    expect(aim.picks).toEqual([]);
    expect(aim.line).not.toMatch(/hasn't been picked/i);
  });

  it("still says NO_SCAN_YET when there is no scan — the read is moot then", () => {
    const aim = aimForNext({ ...base, growthScanLiveAt: undefined, picksUnavailable: true });
    expect(aim.state).toBe("NO_SCAN_YET");
  });

  it("rows that DID arrive beat the flag", () => {
    const aim = aimForNext({
      ...base,
      picksUnavailable: true,
      recommendations: [{ id: "a", label: "A" }],
    });
    expect(aim.state).toBe("READY");
  });

  it("a clean empty read still reads as nobody has picked yet", () => {
    expect(aimForNext({ ...base, picksUnavailable: false }).state).toBe("SCAN_NO_PICKS");
  });
});
