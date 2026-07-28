import { describe, it, expect } from "vitest";
import {
  loadComponentLive,
  mergeComponentLive,
  phaseSignalsReadable,
} from "@/lib/phases/componentLiveLoad";
import type { PhaseComponentDb } from "@/lib/phases/componentStateDb";
import type { PhaseComponentRow } from "@/lib/phases/componentStateRow";

function row(over: Partial<PhaseComponentRow> = {}): PhaseComponentRow {
  return {
    customer_id: "acme",
    phase: 1,
    component_id: "website-aeo-seo",
    live_at: "2026-07-28T00:00:00.000Z",
    ever_live_at: "2026-07-28T00:00:00.000Z",
    last_signal_at: "2026-07-28T00:00:00.000Z",
    seen_event_ids: [],
    source: "partner-tools",
    ...over,
  };
}

function db(over: Partial<PhaseComponentDb> = {}): () => PhaseComponentDb {
  return () => ({
    fetchState: async () => null,
    writeState: async () => {},
    fetchCustomerRows: async () => [row()],
    ...over,
  });
}

const env = (over: Record<string, string | undefined>) => over as unknown as NodeJS.ProcessEnv;

describe("phaseSignalsReadable", () => {
  it("is off until the seam is armed AND readable", () => {
    expect(phaseSignalsReadable(env({}))).toBe(false);
    // Armed but no service credentials: building the client would throw.
    expect(phaseSignalsReadable(env({ PHASE_SIGNAL_WEBHOOK_SECRET: "s" }))).toBe(false);
    // Credentials but not armed — 0025 may not even be applied yet.
    expect(
      phaseSignalsReadable(env({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })),
    ).toBe(false);
    expect(
      phaseSignalsReadable(
        env({ PHASE_SIGNAL_WEBHOOK_SECRET: "s", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }),
      ),
    ).toBe(true);
  });
});

describe("mergeComponentLive", () => {
  it("keeps record entries the signals never mention", () => {
    const merged = mergeComponentLive({ "google-business-profile": { liveAt: "2026-07-01" } }, {});
    expect(merged["google-business-profile"]?.liveAt).toBe("2026-07-01");
  });

  it("lets a REVERTED signal darken a component the record says is live", () => {
    // The failure this pins: a truthy merge would keep the stale lit value and the
    // partner's revert would never reach the customer's board.
    const merged = mergeComponentLive(
      { "website-aeo-seo": { liveAt: "2026-07-01" } },
      { "website-aeo-seo": { source: "partner-tools" } },
    );
    expect(merged["website-aeo-seo"]?.liveAt).toBeUndefined();
    expect(merged["website-aeo-seo"]?.source).toBe("partner-tools");
  });

  it("does not mutate the record it was handed", () => {
    const record = { "website-aeo-seo": { liveAt: "2026-07-01" } };
    mergeComponentLive(record, { "website-aeo-seo": { liveAt: "2026-07-28" } });
    expect(record["website-aeo-seo"].liveAt).toBe("2026-07-01");
  });
});

describe("loadComponentLive", () => {
  it("is off — not unavailable — when the seam is not armed", async () => {
    let asked = false;
    const res = await loadComponentLive("acme", {
      enabled: false,
      db: db({
        fetchCustomerRows: async () => {
          asked = true;
          return [];
        },
      }),
    });
    expect(res).toEqual({ map: {}, unavailable: false });
    expect(asked).toBe(false);
  });

  it("never queries for an empty customer id", async () => {
    let asked = false;
    const res = await loadComponentLive("   ", {
      enabled: true,
      db: db({
        fetchCustomerRows: async () => {
          asked = true;
          return [];
        },
      }),
    });
    expect(asked).toBe(false);
    expect(res.unavailable).toBe(false);
  });

  it("returns the rows as lights when armed", async () => {
    const res = await loadComponentLive("acme", { enabled: true, db: db() });
    expect(res.unavailable).toBe(false);
    expect(res.map["website-aeo-seo"]?.liveAt).toBe("2026-07-28T00:00:00.000Z");
  });

  it("armed with no rows is an empty map, NOT unavailable", async () => {
    const res = await loadComponentLive("acme", {
      enabled: true,
      db: db({ fetchCustomerRows: async () => [] }),
    });
    expect(res).toEqual({ map: {}, unavailable: false });
  });

  it("a failed read reports unavailable instead of throwing the page", async () => {
    const errors: unknown[] = [];
    const res = await loadComponentLive("acme", {
      enabled: true,
      onError: (e) => errors.push(e),
      db: db({
        fetchCustomerRows: async () => {
          throw new Error("relation phase_component_state does not exist");
        },
      }),
    });
    expect(res.unavailable).toBe(true);
    expect(res.map).toEqual({});
    expect(errors).toHaveLength(1);
  });

  it("trims the customer id it queries with", async () => {
    let asked = "";
    await loadComponentLive("  acme  ", {
      enabled: true,
      db: db({
        fetchCustomerRows: async (id) => {
          asked = id;
          return [];
        },
      }),
    });
    expect(asked).toBe("acme");
  });
});
