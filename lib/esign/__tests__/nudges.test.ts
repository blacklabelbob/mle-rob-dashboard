import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOMER_TOUCHES,
  isBusinessHoursET,
  planNudges,
  toNudgeRequestRows,
  toPriorNudges,
  type NudgeRequestRow,
  type PriorNudge,
} from "../nudges";

// Tuesday 2026-07-21 15:00 ET = 19:00 UTC (EDT) — business hours.
const BIZ_NOW = new Date("2026-07-21T19:00:00Z");
// Same Tuesday 22:00 ET = 02:00 UTC Wed — outside business hours.
const NIGHT_NOW = new Date("2026-07-22T02:00:00Z");

function req(overrides: Partial<NudgeRequestRow> = {}): NudgeRequestRow {
  return {
    id: "req-1",
    document_id: "doc-1",
    document_title: "Phase 1 Agreement - Test Co",
    status: "pending",
    sent_to: "signer@example.com",
    signer_name: "Sam Signer",
    created_at: "2026-07-21T15:00:00Z", // sent instant
    viewed_at: null,
    signed_at: null,
    voided_at: null,
    expires_at: "2026-08-21T15:00:00Z",
    ...overrides,
  };
}

const daysAgo = (n: number, from: Date) => new Date(from.getTime() - n * 86_400_000).toISOString();

describe("isBusinessHoursET", () => {
  it("knows a weekday afternoon from a weeknight and a weekend", () => {
    expect(isBusinessHoursET(BIZ_NOW)).toBe(true);
    expect(isBusinessHoursET(NIGHT_NOW)).toBe(false);
    expect(isBusinessHoursET(new Date("2026-07-25T16:00:00Z"))).toBe(false); // Saturday
  });
});

describe("planNudges ladder", () => {
  it("nothing fires before any threshold", () => {
    expect(planNudges([req()], [], BIZ_NOW)).toEqual([]);
  });

  it("rep_viewed_24h fires 24h after viewing, as a rep flag with no email", () => {
    const r = req({ status: "viewed", viewed_at: daysAgo(1.1, BIZ_NOW) });
    const plan = planNudges([r], [], BIZ_NOW);
    expect(plan.map((a) => a.rung)).toEqual(["rep_viewed_24h"]);
    expect(plan[0].audience).toBe("rep");
    expect(plan[0].email).toBeUndefined();
    expect(plan[0].flagTitle).toContain("req-1");
  });

  it("customer_sent_2d fires with a same-channel email", () => {
    const r = req({ created_at: daysAgo(2.5, BIZ_NOW) });
    const plan = planNudges([r], [], BIZ_NOW);
    expect(plan.map((a) => a.rung)).toEqual(["customer_sent_2d"]);
    expect(plan[0].email?.to).toBe("signer@example.com");
    expect(plan[0].email?.subject).toContain("Reminder");
  });

  it("day 10 names the real expiry date; day 14 escalates to Rob + Stalled", () => {
    const r = req({ created_at: daysAgo(14.5, BIZ_NOW), expires_at: "2026-07-30T00:00:00Z" });
    const plan = planNudges([r], [], BIZ_NOW);
    const rungs = plan.map((a) => a.rung);
    // All overdue rungs fire on first run, but customer cap holds at 3.
    expect(rungs).toEqual([
      "customer_sent_2d",
      "customer_sent_5d",
      "rep_sent_5d",
      "customer_sent_10d",
      "rob_sent_14d",
    ]);
    const final = plan.find((a) => a.rung === "customer_sent_10d")!;
    expect(final.email?.subject).toContain("2026-07-30");
    const rob = plan.find((a) => a.rung === "rob_sent_14d")!;
    expect(rob.audience).toBe("rob");
    expect(rob.severity).toBe("high");
    expect(rob.markStalled).toEqual({ documentId: "doc-1" });
    expect(rob.flagTitle).toContain("STALLED");
  });

  it("max 3 customer touches — a 4th customer rung never fires", () => {
    const r = req({ created_at: daysAgo(14.5, BIZ_NOW) });
    const prior: PriorNudge[] = [
      { request_id: "req-1", rung: "customer_sent_2d" },
      { request_id: "req-1", rung: "customer_sent_5d" },
      { request_id: "req-1", rung: "customer_sent_10d" },
    ];
    const plan = planNudges([r], prior, BIZ_NOW);
    expect(plan.filter((a) => a.audience === "customer")).toHaveLength(0);
    expect(prior).toHaveLength(MAX_CUSTOMER_TOUCHES);
    // internal rungs still fire
    expect(plan.map((a) => a.rung).sort()).toEqual(["rep_sent_5d", "rob_sent_14d"]);
  });

  it("idempotent: prior events suppress their rung, re-run plans nothing new", () => {
    const r = req({ created_at: daysAgo(2.5, BIZ_NOW) });
    const first = planNudges([r], [], BIZ_NOW);
    const prior = first.map((a) => ({ request_id: a.requestId, rung: a.rung }));
    expect(planNudges([r], prior, BIZ_NOW)).toEqual([]);
  });

  it("business-hours guard defers customer emails but not internal flags", () => {
    const r = req({
      created_at: daysAgo(2.5, NIGHT_NOW),
      status: "viewed",
      viewed_at: daysAgo(1.5, NIGHT_NOW),
    });
    const night = planNudges([r], [], NIGHT_NOW);
    expect(night.map((a) => a.rung)).toEqual(["rep_viewed_24h"]); // customer deferred
    const day = planNudges([r], [], new Date("2026-07-22T15:00:00Z"));
    expect(day.map((a) => a.rung)).toContain("customer_sent_2d"); // deferred ≠ skipped
  });

  it("ladder stops instantly on signed / voided / expired", () => {
    const base = { created_at: daysAgo(5, BIZ_NOW) };
    expect(
      planNudges([req({ ...base, signed_at: daysAgo(1, BIZ_NOW), status: "signed" })], [], BIZ_NOW)
    ).toEqual([]);
    expect(
      planNudges([req({ ...base, voided_at: daysAgo(1, BIZ_NOW), status: "voided" })], [], BIZ_NOW)
    ).toEqual([]);
    expect(
      planNudges([req({ ...base, expires_at: daysAgo(0.5, BIZ_NOW) })], [], BIZ_NOW)
    ).toEqual([]);
  });

  it("demo rows never nudge (house DEMO rule)", () => {
    expect(
      planNudges([req({ id: "demo-req-1", created_at: daysAgo(3, BIZ_NOW) })], [], BIZ_NOW)
    ).toEqual([]);
  });

  it("deterministic: same inputs, same plan, request-id order", () => {
    const a = req({ id: "req-b", created_at: daysAgo(2.5, BIZ_NOW) });
    const b = req({ id: "req-a", created_at: daysAgo(2.5, BIZ_NOW) });
    const p1 = planNudges([a, b], [], BIZ_NOW);
    const p2 = planNudges([b, a], [], BIZ_NOW);
    expect(p1).toEqual(p2);
    expect(p1.map((x) => x.requestId)).toEqual(["req-a", "req-b"]);
  });
});

// --- row mappers (cron-route wiring, 2026-07-23) ---------------------------

describe("toNudgeRequestRows", () => {
  const raw = {
    id: "req-1",
    document_id: "doc-1",
    status: "pending",
    sent_to: "s@example.com",
    signer_name: "Sam Signer",
    created_at: "2026-07-21T15:00:00Z",
    viewed_at: null,
    signed_at: null,
    voided_at: null,
    expires_at: "2026-08-20T15:00:00Z",
  };

  it("reads the title from an embedded object OR a one-element array", () => {
    const asObject = toNudgeRequestRows([{ ...raw, documents: { title: "Phase 1 — CG" } }]);
    const asArray = toNudgeRequestRows([{ ...raw, documents: [{ title: "Phase 1 — CG" }] }]);
    expect(asObject[0].document_title).toBe("Phase 1 — CG");
    expect(asArray).toEqual(asObject);
  });

  it("never fabricates a title — falls back to the document id", () => {
    expect(toNudgeRequestRows([{ ...raw, documents: null }])[0].document_title).toBe("doc-1");
    expect(toNudgeRequestRows([{ ...raw, documents: { title: "" } }])[0].document_title).toBe(
      "doc-1"
    );
    expect(toNudgeRequestRows([{ ...raw }])[0].document_title).toBe("doc-1");
  });

  it("carries the ladder fields through unchanged", () => {
    const [row] = toNudgeRequestRows([
      { ...raw, viewed_at: "2026-07-22T15:00:00Z", documents: { title: "T" } },
    ]);
    expect(row).toEqual({
      id: "req-1",
      document_id: "doc-1",
      document_title: "T",
      status: "pending",
      sent_to: "s@example.com",
      signer_name: "Sam Signer",
      created_at: "2026-07-21T15:00:00Z",
      viewed_at: "2026-07-22T15:00:00Z",
      signed_at: null,
      voided_at: null,
      expires_at: "2026-08-20T15:00:00Z",
    });
  });
});

describe("toPriorNudges", () => {
  it("maps meta.rung and drops rows without a usable rung", () => {
    expect(
      toPriorNudges([
        { request_id: "req-1", meta: { rung: "customer_sent_2d" } },
        { request_id: "req-1", meta: { rung: "" } },
        { request_id: "req-1", meta: { rung: 7 } },
        { request_id: "req-1", meta: {} },
        { request_id: "req-1", meta: null },
      ])
    ).toEqual([{ request_id: "req-1", rung: "customer_sent_2d" }]);
  });

  it("a junk event can never suppress a real rung", () => {
    const row = req({ created_at: daysAgo(2.5, BIZ_NOW) });
    const prior = toPriorNudges([{ request_id: "req-1", meta: { note: "no rung here" } }]);
    expect(planNudges([row], prior, BIZ_NOW).map((a) => a.rung)).toEqual(["customer_sent_2d"]);
  });

  it("a recorded rung IS suppressed (round-trip with the planner)", () => {
    const row = req({ created_at: daysAgo(2.5, BIZ_NOW) });
    const prior = toPriorNudges([
      { request_id: "req-1", meta: { rung: "customer_sent_2d", audience: "customer" } },
    ]);
    expect(planNudges([row], prior, BIZ_NOW)).toEqual([]);
  });
});
