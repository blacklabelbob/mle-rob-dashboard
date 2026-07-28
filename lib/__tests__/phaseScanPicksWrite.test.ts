import { describe, expect, it } from "vitest";
import {
  planScanPickWithdrawal,
  planScanPickWrites,
} from "../phases/scanPicksWrite";
import { scanPicksFromRows, type ScanPickRow } from "../phases/scanPicksRow";

const ok = { customerId: "acme", recordedBy: "rob", picks: [{ pickId: "a", label: "A" }] };

describe("planScanPickWrites", () => {
  it("stores a shortlist with its attribution and source", () => {
    const plan = planScanPickWrites({
      customerId: " acme ",
      recordedBy: " rob ",
      source: " scan-import ",
      picks: [{ pickId: " a ", label: " Missed-call rescue ", why: " they lose 4 calls a day " }],
    });
    expect(plan.refusals).toEqual([]);
    expect(plan.rows).toEqual([
      {
        customer_id: "acme",
        pick_id: "a",
        label: "Missed-call rescue",
        why: "they lose 4 calls a day",
        rank: 0,
        recorded_by: "rob",
        source: "scan-import",
      },
    ]);
  });

  it("records submitted order as rank so a batch is not re-sorted alphabetically", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "zebra", label: "Z" },
        { pickId: "apple", label: "A" },
      ],
    });
    expect(plan.rows.map((r) => [r.pick_id, r.rank])).toEqual([
      ["zebra", 0],
      ["apple", 1],
    ]);
  });

  it("round-trips submitted order through the read side", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "zebra", label: "Z" },
        { pickId: "apple", label: "A" },
      ],
    });
    // Same recorded_at for every row of one batch — the real 0027 default.
    const stored: ScanPickRow[] = plan.rows.map((r) => ({
      ...r,
      recorded_at: "2026-07-28T12:00:00Z",
      withdrawn_at: null,
    }));
    expect(scanPicksFromRows(stored).picks.map((p) => p.id)).toEqual(["zebra", "apple"]);
  });

  it("keeps an explicit rank over position", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "a", label: "A", rank: 5 },
        { pickId: "b", label: "B", rank: 2 },
      ],
    });
    expect(plan.rows.map((r) => r.rank)).toEqual([5, 2]);
  });

  it("treats rank 0 as a rank, not as missing", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "a", label: "A" },
        { pickId: "b", label: "B", rank: 0 },
      ],
    });
    expect(plan.rows.map((r) => r.rank)).toEqual([0, 0]);
  });

  it("stores a blank why as NULL, matching the read side's omitted key", () => {
    const plan = planScanPickWrites({ ...ok, picks: [{ pickId: "a", label: "A", why: "   " }] });
    expect(plan.rows[0].why).toBeNull();
  });

  it("refuses the whole submission when one pick is unusable", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "a", label: "A" },
        { pickId: "b", label: "  " },
      ],
    });
    expect(plan.rows).toEqual([]);
    expect(plan.refusals).toEqual([{ pickId: "b", reason: "no_label" }]);
  });

  it("refuses a duplicate pick_id instead of letting the last row win", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [
        { pickId: "a", label: "Correct label" },
        { pickId: "a", label: "Stale label" },
      ],
    });
    expect(plan.rows).toEqual([]);
    expect(plan.refusals).toEqual([{ pickId: "a", reason: "duplicate_pick_id" }]);
  });

  it("refuses an unparseable rank rather than coercing it", () => {
    const plan = planScanPickWrites({
      ...ok,
      picks: [{ pickId: "a", label: "A", rank: "second" as unknown as number }],
    });
    expect(plan.refusals).toEqual([{ pickId: "a", reason: "bad_rank" }]);
  });

  it("refuses a fractional rank", () => {
    const plan = planScanPickWrites({ ...ok, picks: [{ pickId: "a", label: "A", rank: 1.5 }] });
    expect(plan.refusals).toEqual([{ pickId: "a", reason: "bad_rank" }]);
  });

  it("refuses an empty submission rather than clearing the shortlist", () => {
    const plan = planScanPickWrites({ ...ok, picks: [] });
    expect(plan.rows).toEqual([]);
    expect(plan.refusals).toEqual([{ pickId: "", reason: "no_picks" }]);
  });

  it("refuses an unattributed submission", () => {
    const plan = planScanPickWrites({ ...ok, recordedBy: "   " });
    expect(plan.refusals).toEqual([{ pickId: "", reason: "no_recorded_by" }]);
  });

  it("refuses a submission with no customer", () => {
    const plan = planScanPickWrites({ ...ok, customerId: "" });
    expect(plan.refusals).toEqual([{ pickId: "", reason: "no_customer_id" }]);
  });

  it("collects every refusal, not just the first", () => {
    const plan = planScanPickWrites({
      customerId: "",
      recordedBy: "",
      picks: [{ pickId: "", label: "A" }],
    });
    expect(plan.refusals.map((r) => r.reason)).toEqual([
      "no_customer_id",
      "no_recorded_by",
      "no_pick_id",
    ]);
  });

  it("never mistakes an omitted pick for a withdrawal", () => {
    const plan = planScanPickWrites({ ...ok, picks: [{ pickId: "b", label: "B" }] });
    expect(plan.rows.map((r) => r.pick_id)).toEqual(["b"]);
    expect(JSON.stringify(plan)).not.toContain("withdrawn");
  });
});

describe("planScanPickWithdrawal", () => {
  const when = "2026-07-28T12:00:00Z";

  it("targets exactly one customer's pick", () => {
    expect(planScanPickWithdrawal({ customerId: "acme", pickId: "a", withdrawnAt: when })).toEqual({
      match: { customer_id: "acme", pick_id: "a" },
      patch: { withdrawn_at: when },
      refusals: [],
    });
  });

  it("refuses to withdraw without a customer — that would retire it for everyone", () => {
    const plan = planScanPickWithdrawal({ customerId: "", pickId: "a", withdrawnAt: when });
    expect(plan.match).toBeNull();
    expect(plan.patch).toBeNull();
    expect(plan.refusals).toContainEqual({ pickId: "", reason: "no_customer_id" });
  });

  it("refuses an unparseable withdrawal date", () => {
    const plan = planScanPickWithdrawal({ customerId: "acme", pickId: "a", withdrawnAt: "soon" });
    expect(plan.match).toBeNull();
    expect(plan.refusals).toEqual([{ pickId: "a", reason: "bad_withdrawn_at" }]);
  });

  it("withdraws by date, never by delete", () => {
    const plan = planScanPickWithdrawal({ customerId: "acme", pickId: "a", withdrawnAt: when });
    expect(Object.keys(plan.patch ?? {})).toEqual(["withdrawn_at"]);
  });
});
