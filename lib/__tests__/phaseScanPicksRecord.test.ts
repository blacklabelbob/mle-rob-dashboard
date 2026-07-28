// Q40 leg (6) inc.20 — the write door's judgement.
//
// The failures worth pinning here are the ones a caller cannot see: a verb that
// defaults instead of refusing, a submission that reports "stored" while one of its
// picks stays invisible because it was withdrawn, and a write that lands after a
// refusal. Each of them ends with a paying customer being shown a shortlist that
// disagrees with the one a human handed over — so the tests assert what reached the
// database, not only what came back.

import { describe, expect, it } from "vitest";
import {
  parseScanPickRequest,
  recordScanPicks,
  reinstateScanPick,
  withdrawScanPick,
} from "../phases/scanPicksRecord";
import type { ScanPicksWriteDb } from "../phases/scanPicksWriteDb";
import type { ScanPickWriteRow } from "../phases/scanPicksWrite";

type Call =
  | { op: "withdrawnRead"; customerId: string; pickIds: readonly string[] }
  | { op: "upsert"; rows: readonly ScanPickWriteRow[] }
  | { op: "withdraw"; match: unknown; patch: unknown }
  | { op: "reinstate"; match: unknown };

function fakeDb(withdrawn: string[] = []) {
  const calls: Call[] = [];
  const db: ScanPicksWriteDb = {
    async fetchWithdrawnPickIds(customerId, pickIds) {
      calls.push({ op: "withdrawnRead", customerId, pickIds });
      return withdrawn.filter((id) => pickIds.includes(id));
    },
    async upsertPicks(rows) {
      calls.push({ op: "upsert", rows });
    },
    async withdrawPick(match, patch) {
      calls.push({ op: "withdraw", match, patch });
    },
    async reinstatePick(match) {
      calls.push({ op: "reinstate", match });
    },
  };
  return { db, calls };
}

const submission = {
  customerId: "acme",
  recordedBy: "rob",
  source: "scan-import",
  picks: [
    { pickId: "missed-calls", label: "Missed-call text-back" },
    { pickId: "review-asks", label: "Review requests" },
  ],
};

describe("parseScanPickRequest", () => {
  it("defaults an absent action to record — the only non-destructive verb", () => {
    const parsed = parseScanPickRequest({ customerId: "acme", picks: [], recordedBy: "rob" });
    expect(parsed.ok && parsed.action.kind).toBe("record");
  });

  it("refuses an unknown action rather than falling through to a write", () => {
    const parsed = parseScanPickRequest({ action: "delete", customerId: "acme" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.refusals[0].reason).toBe("unknown_action");
  });

  it("refuses a non-object body", () => {
    for (const body of [null, "acme", 7, ["acme"]]) {
      const parsed = parseScanPickRequest(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.refusals[0].reason).toBe("not_an_object");
    }
  });

  it("carries both halves of the identity for withdraw and reinstate", () => {
    for (const action of ["withdraw", "reinstate"] as const) {
      const parsed = parseScanPickRequest({ action, customerId: " acme ", pickId: " review-asks " });
      expect(parsed.ok).toBe(true);
      if (parsed.ok && parsed.action.kind !== "record") {
        expect(parsed.action).toEqual({ kind: action, customerId: "acme", pickId: "review-asks" });
      }
    }
  });
});

describe("recordScanPicks", () => {
  it("stores the whole submission and names what it stored", async () => {
    const { db, calls } = fakeDb();
    const outcome = await recordScanPicks(db, submission);
    expect(outcome).toEqual({ ok: true, stored: 2, pickIds: ["missed-calls", "review-asks"] });
    expect(calls.map((c) => c.op)).toEqual(["withdrawnRead", "upsert"]);
  });

  it("asks nothing and writes nothing when the plan refuses", async () => {
    const { db, calls } = fakeDb();
    const outcome = await recordScanPicks(db, { ...submission, recordedBy: "  " });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusals).toContainEqual({ pickId: "", reason: "no_recorded_by" });
    // The withdrawn read costs a query; a refused submission must not spend one.
    expect(calls).toEqual([]);
  });

  it("REFUSES a submission containing a withdrawn pick — storing it would hide it", async () => {
    const { db, calls } = fakeDb(["review-asks"]);
    const outcome = await recordScanPicks(db, submission);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusals).toEqual([{ pickId: "review-asks", reason: "withdrawn_pick" }]);
    }
    // Nothing landed: the upsert never carries `withdrawn_at`, so a stored row here
    // would answer "stored" while the panel kept the pick invisible.
    expect(calls.map((c) => c.op)).toEqual(["withdrawnRead"]);
  });

  it("checks the withdrawn ids BEFORE the upsert, and only the ids submitted", async () => {
    const { db, calls } = fakeDb(["something-else"]);
    await recordScanPicks(db, submission);
    const read = calls[0];
    expect(read.op).toBe("withdrawnRead");
    if (read.op === "withdrawnRead") {
      expect(read.customerId).toBe("acme");
      expect([...read.pickIds]).toEqual(["missed-calls", "review-asks"]);
    }
  });
});

describe("withdrawScanPick", () => {
  it("dates the withdrawal with the instant handed in, never one of its own", async () => {
    const { db, calls } = fakeDb();
    const at = "2026-07-28T11:00:00.000Z";
    const outcome = await withdrawScanPick(db, { customerId: "acme", pickId: "review-asks" }, at);
    expect(outcome).toEqual({ ok: true, changed: true, pickId: "review-asks" });
    expect(calls).toEqual([
      {
        op: "withdraw",
        match: { customer_id: "acme", pick_id: "review-asks" },
        patch: { withdrawn_at: at },
      },
    ]);
  });

  it("refuses an unparseable instant instead of dating a row with it", async () => {
    const { db, calls } = fakeDb();
    const outcome = await withdrawScanPick(db, { customerId: "acme", pickId: "x" }, "last tuesday");
    expect(outcome.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a withdrawal missing the customer — it would retire the pick for everyone", async () => {
    const { db, calls } = fakeDb();
    const outcome = await withdrawScanPick(db, { customerId: "", pickId: "x" }, "2026-07-28T11:00:00.000Z");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusals).toContainEqual({ pickId: "", reason: "no_customer_id" });
    expect(calls).toEqual([]);
  });
});

describe("reinstateScanPick", () => {
  it("clears the date for exactly one customer's pick", async () => {
    const { db, calls } = fakeDb();
    const outcome = await reinstateScanPick(db, { customerId: "acme", pickId: "review-asks" });
    expect(outcome).toEqual({ ok: true, changed: true, pickId: "review-asks" });
    expect(calls).toEqual([{ op: "reinstate", match: { customer_id: "acme", pick_id: "review-asks" } }]);
  });

  it("refuses a half identity — a re-pitch to every customer is not a typo's consequence", async () => {
    const { db, calls } = fakeDb();
    for (const req of [{ customerId: "", pickId: "x" }, { customerId: "acme", pickId: "" }]) {
      const outcome = await reinstateScanPick(db, req);
      expect(outcome.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });
});
