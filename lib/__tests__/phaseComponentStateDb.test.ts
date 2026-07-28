// Q40 leg (4) inc.3 — the Supabase carrier for 0025.
//
// What is at risk here is not logic, it is a handful of STRINGS and one silent
// conflation. The conflict target, the table name, and the read columns are all
// wrong-but-running failures; and "row missing" vs "read failed" produce the same
// empty state one layer up, where the difference is a customer's refund clock. So
// these tests assert the request that goes out, not only the value that comes back.

import { describe, expect, it } from "vitest";
import {
  PHASE_COMPONENT_CONFLICT,
  PHASE_COMPONENT_READ_COLUMNS,
  PHASE_COMPONENT_TABLE,
  supabasePhaseComponentDb,
  toComponentRow,
  type PhaseComponentClient,
} from "../phases/componentStateDb";
import { rowPatch, storedFromRow } from "../phases/componentStateRow";
import type { SignalApplied } from "../phases/signalIntake";

type Call =
  | { op: "select"; table: string; columns: string; eqs: Array<[string, unknown]> }
  | { op: "upsert"; table: string; row: Record<string, unknown>; onConflict?: string };

function fakeClient(opts: { data?: unknown; readError?: string; writeError?: string } = {}) {
  const calls: Call[] = [];
  const client: PhaseComponentClient = {
    from(table: string) {
      return {
        select(columns: string) {
          const record: Call = { op: "select", table, columns, eqs: [] };
          calls.push(record);
          const chain = {
            eq(column: string, value: unknown) {
              (record as { eqs: Array<[string, unknown]> }).eqs.push([column, value]);
              return chain;
            },
            async maybeSingle() {
              return opts.readError
                ? { data: null, error: { message: opts.readError } }
                : { data: opts.data ?? null, error: null };
            },
          };
          return chain as never;
        },
        upsert(rows: unknown, options?: { onConflict?: string }) {
          calls.push({
            op: "upsert",
            table,
            row: rows as Record<string, unknown>,
            onConflict: options?.onConflict,
          });
          return {
            then(resolve: (v: { error: { message: string } | null }) => unknown) {
              return Promise.resolve({
                error: opts.writeError ? { message: opts.writeError } : null,
              }).then(resolve);
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const APPLIED: SignalApplied = {
  outcome: "applied",
  eventId: "evt-1",
  customerId: "cust-a",
  phase: 1,
  componentId: "website-aeo-seo",
  status: "live",
  occurredAt: "2026-07-28T10:00:00.000Z",
  liveAt: "2026-07-28T10:00:00.000Z",
  startsRefundWindow: true,
  source: "partner-x",
};

describe("supabasePhaseComponentDb.fetchState", () => {
  it("asks 0025 for the identity triple, by explicit columns", async () => {
    const { client, calls } = fakeClient();
    await supabasePhaseComponentDb(client).fetchState("cust-a", 1, "website-aeo-seo");
    expect(calls).toEqual([
      {
        op: "select",
        table: PHASE_COMPONENT_TABLE,
        columns: PHASE_COMPONENT_READ_COLUMNS,
        eqs: [
          ["customer_id", "cust-a"],
          ["phase", 1],
          ["component_id", "website-aeo-seo"],
        ],
      },
    ]);
  });

  it("returns null for an absent row — a virgin component is a real answer", async () => {
    const { client } = fakeClient({ data: null });
    expect(await supabasePhaseComponentDb(client).fetchState("cust-a", 1, "x")).toBeNull();
  });

  it("THROWS on a read error instead of reporting a virgin component", async () => {
    // The whole point of the module. An empty state here re-lights a lit component
    // and restates when the refund window began.
    const { client } = fakeClient({ readError: "timeout" });
    await expect(supabasePhaseComponentDb(client).fetchState("cust-a", 1, "x")).rejects.toThrow(
      /phase_component_state read: timeout/,
    );
  });

  it("maps a stored row into the shape the decider reads", async () => {
    const { client } = fakeClient({
      data: {
        customer_id: "cust-a",
        phase: 2,
        component_id: "crm",
        live_at: "2026-07-01T00:00:00.000Z",
        ever_live_at: "2026-06-01T00:00:00.000Z",
        last_signal_at: "2026-07-01T00:00:00.000Z",
        seen_event_ids: ["evt-0"],
        source: "partner-x",
      },
    });
    const row = await supabasePhaseComponentDb(client).fetchState("cust-a", 2, "crm");
    expect(storedFromRow(row)).toEqual({
      liveAt: "2026-07-01T00:00:00.000Z",
      everLiveAt: "2026-06-01T00:00:00.000Z",
      lastSignalAt: "2026-07-01T00:00:00.000Z",
      seenEventIds: ["evt-0"],
    });
  });
});

describe("toComponentRow", () => {
  it("coerces a null seen_event_ids to an empty array", () => {
    // A row predating the column default would otherwise throw inside rowPatch —
    // a 500 on a replay, and the partner retries 500s.
    const row = toComponentRow({ customer_id: "c", phase: 1, component_id: "x", seen_event_ids: null });
    expect(row?.seen_event_ids).toEqual([]);
  });

  it("drops non-string entries rather than carrying them into the memory", () => {
    const row = toComponentRow({ customer_id: "c", phase: 1, component_id: "x", seen_event_ids: ["a", 3] });
    expect(row?.seen_event_ids).toEqual(["a"]);
  });

  it("is null for a non-object", () => {
    expect(toComponentRow(null)).toBeNull();
    expect(toComponentRow("row")).toBeNull();
  });
});

describe("supabasePhaseComponentDb.writeState", () => {
  it("upserts against the identity triple, never the primary key", async () => {
    // Without this target every partner retry is an INSERT into a uuid PK, hits
    // phase_component_state_identity, and comes back 23505 forever.
    const { client, calls } = fakeClient();
    await supabasePhaseComponentDb(client).writeState(
      rowPatch(APPLIED, null),
      "2026-07-28T10:00:01.000Z",
    );
    expect(calls[0]).toMatchObject({ op: "upsert", table: PHASE_COMPONENT_TABLE });
    expect((calls[0] as { onConflict?: string }).onConflict).toBe(PHASE_COMPONENT_CONFLICT);
    expect(PHASE_COMPONENT_CONFLICT).toBe("customer_id,phase,component_id");
  });

  it("stamps updated_at from the caller's clock, apart from last_signal_at", async () => {
    // 0025's default fires on INSERT only; an updating upsert leaves updated_at
    // frozen at creation. And the two columns answer different questions —
    // last_signal_at is the SENDER's instant and is the ordering baseline.
    const { client, calls } = fakeClient();
    await supabasePhaseComponentDb(client).writeState(
      rowPatch(APPLIED, null),
      "2026-07-28T10:00:01.000Z",
    );
    const row = (calls[0] as { row: Record<string, unknown> }).row;
    expect(row.updated_at).toBe("2026-07-28T10:00:01.000Z");
    expect(row.last_signal_at).toBe(APPLIED.occurredAt);
  });

  it("carries inc.2's patch through unchanged — the carrier decides nothing", async () => {
    const { client, calls } = fakeClient();
    const patch = rowPatch(APPLIED, {
      customer_id: "cust-a",
      phase: 1,
      component_id: "website-aeo-seo",
      live_at: null,
      ever_live_at: "2026-06-01T00:00:00.000Z",
      last_signal_at: "2026-06-01T00:00:00.000Z",
      seen_event_ids: ["evt-0"],
      source: "partner-x",
    });
    await supabasePhaseComponentDb(client).writeState(patch, "2026-07-28T10:00:01.000Z");
    const row = (calls[0] as { row: Record<string, unknown> }).row;
    // ever_live_at survives a re-light: the refund origin is not moved by the carrier.
    expect(row.ever_live_at).toBe("2026-06-01T00:00:00.000Z");
    expect(row.seen_event_ids).toEqual(["evt-0", "evt-1"]);
  });

  it("throws with PostgREST's own message on a write error", async () => {
    const { client } = fakeClient({ writeError: "23505 duplicate key" });
    await expect(
      supabasePhaseComponentDb(client).writeState(rowPatch(APPLIED, null), "2026-07-28T10:00:01.000Z"),
    ).rejects.toThrow(/phase_component_state upsert: 23505 duplicate key/);
  });
});
