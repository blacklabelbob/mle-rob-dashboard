// Q40 leg (6) inc.19 — the Supabase carrier for the write door.
//
// What is at risk here is not arithmetic, it is the SHAPE OF THE REQUEST that goes
// out: the conflict target, one statement instead of a loop, the `is null` guard on
// a withdrawal, and the fact that a failed read is never returned as "nothing".
// Each of those is a wrong-but-running failure that only shows up as a customer
// being pitched something nobody chose. So these tests assert the calls, not just
// the return values.

import { describe, expect, it } from "vitest";
import {
  SCAN_PICKS_CONFLICT,
  supabaseScanPicksWriteDb,
  type ScanPicksWriteClient,
} from "../phases/scanPicksWriteDb";
import { SCAN_PICKS_TABLE } from "../phases/scanPicksDb";
import { planScanPickWrites } from "../phases/scanPicksWrite";

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
  const client: ScanPicksWriteClient = {
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

const PLAN = planScanPickWrites({
  customerId: "cust-1",
  recordedBy: "rob",
  picks: [
    { pickId: "missed-call-recovery", label: "Missed-call recovery" },
    { pickId: "review-requests", label: "Review requests" },
  ],
});

describe("upsertPicks", () => {
  it("sends the whole submission in ONE statement — a loop would half-store it", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).upsertPicks(PLAN.rows);
    const upserts = calls.filter((c) => c.op === "upsert");
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("upserts against 0027's identity index, not a blind append", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).upsertPicks(PLAN.rows);
    const upsert = calls.find((c) => c.op === "upsert") as { table: string; onConflict?: string };
    expect(upsert.table).toBe(SCAN_PICKS_TABLE);
    expect(upsert.onConflict).toBe(SCAN_PICKS_CONFLICT);
    expect(SCAN_PICKS_CONFLICT).toBe("customer_id,pick_id");
  });

  it("carries the plan's rows verbatim — the carrier decides nothing", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).upsertPicks(PLAN.rows);
    const rows = (calls.find((c) => c.op === "upsert") as { rows: unknown[] }).rows;
    expect(rows[0]).toEqual(PLAN.rows[0]);
    expect(rows[1]).toEqual(PLAN.rows[1]);
  });

  it("never writes `withdrawn_at` — resurrecting a retired pick is its own verb", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).upsertPicks(PLAN.rows);
    const rows = (calls.find((c) => c.op === "upsert") as { rows: Record<string, unknown>[] }).rows;
    rows.forEach((row) => expect("withdrawn_at" in row).toBe(false));
  });

  it("throws on a write error — a swallowed failure reads upstream as stored", async () => {
    const { client } = fakeClient({ writeError: "duplicate key" });
    await expect(supabaseScanPicksWriteDb(client).upsertPicks(PLAN.rows)).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("refuses an empty row set rather than reporting a successful no-op", async () => {
    const { client, calls } = fakeClient();
    await expect(supabaseScanPicksWriteDb(client).upsertPicks([])).rejects.toThrow(/no rows/);
    expect(calls).toHaveLength(0);
  });
});

describe("fetchWithdrawnPickIds", () => {
  it("asks only about the submitted picks, for this customer, and only withdrawn ones", async () => {
    const { client, calls } = fakeClient({ data: [{ pick_id: "review-requests" }] });
    const ids = await supabaseScanPicksWriteDb(client).fetchWithdrawnPickIds("cust-1", [
      "missed-call-recovery",
      "review-requests",
    ]);
    expect(ids).toEqual(["review-requests"]);
    const read = calls[0] as {
      columns: string;
      eqs: Array<[string, unknown]>;
      ins: Array<[string, readonly unknown[]]>;
      nots: Array<[string, string, unknown]>;
    };
    expect(read.columns).toBe("pick_id");
    expect(read.eqs).toEqual([["customer_id", "cust-1"]]);
    expect(read.ins).toEqual([["pick_id", ["missed-call-recovery", "review-requests"]]]);
    expect(read.nots).toEqual([["withdrawn_at", "is", null]]);
  });

  it("asks nothing when nothing was submitted — an empty in() is a syntax error", async () => {
    const { client, calls } = fakeClient();
    expect(await supabaseScanPicksWriteDb(client).fetchWithdrawnPickIds("cust-1", [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("throws on a read error — [] would claim none of them were ever withdrawn", async () => {
    const { client } = fakeClient({ readError: "permission denied" });
    await expect(
      supabaseScanPicksWriteDb(client).fetchWithdrawnPickIds("cust-1", ["a"]),
    ).rejects.toThrow(/permission denied/);
  });

  it("drops rows with no pick_id rather than returning an empty id as withdrawn", async () => {
    const { client } = fakeClient({ data: [{ pick_id: null }, { pick_id: "a" }, 7] });
    expect(await supabaseScanPicksWriteDb(client).fetchWithdrawnPickIds("c", ["a"])).toEqual(["a"]);
  });
});

describe("withdrawPick", () => {
  it("matches BOTH halves of the identity and only a live row", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).withdrawPick(
      { customer_id: "cust-1", pick_id: "review-requests" },
      { withdrawn_at: "2026-07-28T12:00:00.000Z" },
    );
    const update = calls[0] as {
      table: string;
      patch: Record<string, unknown>;
      eqs: Array<[string, unknown]>;
      iss: Array<[string, unknown]>;
    };
    expect(update.table).toBe(SCAN_PICKS_TABLE);
    expect(update.patch).toEqual({ withdrawn_at: "2026-07-28T12:00:00.000Z" });
    expect(update.eqs).toEqual([
      ["customer_id", "cust-1"],
      ["pick_id", "review-requests"],
    ]);
    // Without this, withdrawing twice moves the date a recommendation was pulled.
    expect(update.iss).toEqual([["withdrawn_at", null]]);
  });

  it("patches nothing but the date — a withdrawal is not an edit of the pick", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).withdrawPick(
      { customer_id: "c", pick_id: "p" },
      { withdrawn_at: "2026-07-28T12:00:00.000Z" },
    );
    expect(Object.keys((calls[0] as { patch: Record<string, unknown> }).patch)).toEqual([
      "withdrawn_at",
    ]);
  });

  it("throws on failure — a silent no-op leaves a retired pick on the pitch", async () => {
    const { client } = fakeClient({ writeError: "row level security" });
    await expect(
      supabaseScanPicksWriteDb(client).withdrawPick(
        { customer_id: "c", pick_id: "p" },
        { withdrawn_at: "2026-07-28T12:00:00.000Z" },
      ),
    ).rejects.toThrow(/row level security/);
  });
});

describe("reinstatePick", () => {
  it("is the only call that clears the date, and it names both keys", async () => {
    const { client, calls } = fakeClient();
    await supabaseScanPicksWriteDb(client).reinstatePick({ customer_id: "c", pick_id: "p" });
    const update = calls[0] as {
      patch: Record<string, unknown>;
      eqs: Array<[string, unknown]>;
      iss: Array<[string, unknown]>;
    };
    expect(update.patch).toEqual({ withdrawn_at: null });
    expect(update.eqs).toEqual([
      ["customer_id", "c"],
      ["pick_id", "p"],
    ]);
    // No `is null` guard here on purpose — a withdrawn row is exactly the target.
    expect(update.iss).toEqual([]);
  });

  it("throws on failure", async () => {
    const { client } = fakeClient({ writeError: "nope" });
    await expect(
      supabaseScanPicksWriteDb(client).reinstatePick({ customer_id: "c", pick_id: "p" }),
    ).rejects.toThrow(/nope/);
  });
});
