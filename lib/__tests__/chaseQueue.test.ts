// PRD Task 1.8 DoD: seeded "promised intro, no lead" record flags; clears
// when the referred lead is logged. Fixtures cover the flag, the clear, and
// the negatives (lead logged BEFORE the promise, due-today, future,
// demo exclusion, timestampless lead, org-anchored promise, malformed
// payload, promiser-less promise).
import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import {
  promisedIntroOf,
  referralChaseItems,
  type ReferredLead,
} from "../referrals/chaseQueue";

const TODAY = "2026-07-22";

const promise = (
  o: Partial<Activity> & { id: string; occurredAt: string },
  expectedBy?: string,
  of?: string
): Activity => ({
  type: "note",
  source: "manual",
  sourceContext: expectedBy
    ? { promised_intro: { expected_by: expectedBy, ...(of ? { of } : {}) } }
    : {},
  bookProtected: false,
  createdAt: o.occurredAt,
  ...o,
});

describe("referralChaseItems (Task 1.8)", () => {
  // DoD sentence, part 1: promised intro passed, no lead → flags.
  it("flags a past-due promise with no referred lead logged", () => {
    const acts = [
      promise({ id: "rc1", personId: "p-caleb", occurredAt: "2026-07-10T10:00:00Z" }, "2026-07-15", "a roofer in Tampa"),
    ];
    const items = referralChaseItems(acts, [], TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      promiseActivityId: "rc1",
      personId: "p-caleb",
      expectedBy: "2026-07-15",
      daysOverdue: 7,
    });
    expect(items[0].reason).toBe(
      "Promised intro (a roofer in Tampa) expected by 2026-07-15 — 7d past, no referred lead logged"
    );
  });

  // DoD sentence, part 2: referred lead logged after the promise → clears.
  it("clears when a referred lead is logged at/after the promise", () => {
    const acts = [
      promise({ id: "rc1", personId: "p-caleb", occurredAt: "2026-07-10T10:00:00Z" }, "2026-07-15"),
    ];
    const leads: ReferredLead[] = [
      { id: "p-newlead", referredById: "p-caleb", loggedAt: "2026-07-16T09:00:00Z" },
    ];
    expect(referralChaseItems(acts, leads, TODAY)).toHaveLength(0);
  });

  it("a lead logged BEFORE the promise does not clear it", () => {
    const acts = [
      promise({ id: "rc1", personId: "p-caleb", occurredAt: "2026-07-10T10:00:00Z" }, "2026-07-15"),
    ];
    const leads: ReferredLead[] = [
      { id: "p-oldlead", referredById: "p-caleb", loggedAt: "2026-07-01T09:00:00Z" },
    ];
    expect(referralChaseItems(acts, leads, TODAY)).toHaveLength(1);
  });

  it("a timestampless lead is conservatively pre-existing — no clear", () => {
    const acts = [
      promise({ id: "rc1", personId: "p-caleb", occurredAt: "2026-07-10T10:00:00Z" }, "2026-07-15"),
    ];
    const leads: ReferredLead[] = [{ id: "p-undated", referredById: "p-caleb" }];
    expect(referralChaseItems(acts, leads, TODAY)).toHaveLength(1);
  });

  it("due today or future is not yet a broken promise", () => {
    const acts = [
      promise({ id: "rc-today", personId: "p1", occurredAt: "2026-07-10T00:00:00Z" }, TODAY),
      promise({ id: "rc-future", personId: "p2", occurredAt: "2026-07-10T00:00:00Z" }, "2026-08-01"),
    ];
    expect(referralChaseItems(acts, [], TODAY)).toHaveLength(0);
  });

  it("excludes demo-* rows and promiser-less promises", () => {
    const acts = [
      promise({ id: "demo-rc", personId: "p1", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-05"),
      promise({ id: "rc-demo-p", personId: "demo-p", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-05"),
      promise({ id: "rc-anchorless", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-05"),
    ];
    expect(referralChaseItems(acts, [], TODAY)).toHaveLength(0);
  });

  it("org-anchored promise clears via referredById === orgId", () => {
    const acts = [
      promise({ id: "rc-org", orgId: "org-cg", occurredAt: "2026-07-10T10:00:00Z" }, "2026-07-15"),
    ];
    expect(referralChaseItems(acts, [], TODAY)).toHaveLength(1);
    const leads: ReferredLead[] = [
      { id: "p-viaorg", referredById: "org-cg", loggedAt: "2026-07-18T00:00:00Z" },
    ];
    expect(referralChaseItems(acts, leads, TODAY)).toHaveLength(0);
  });

  it("orders most-overdue first, stable by activity id", () => {
    const acts = [
      promise({ id: "rc-b", personId: "p1", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-10"),
      promise({ id: "rc-a", personId: "p2", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-10"),
      promise({ id: "rc-c", personId: "p3", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-05"),
    ];
    expect(referralChaseItems(acts, [], TODAY).map((i) => i.promiseActivityId)).toEqual([
      "rc-c",
      "rc-a",
      "rc-b",
    ]);
  });

  it("throws on invalid today", () => {
    expect(() => referralChaseItems([], [], "7/22/2026")).toThrow(/invalid today/);
  });
});

describe("promisedIntroOf", () => {
  it("rejects malformed payloads, accepts the documented shape", () => {
    expect(promisedIntroOf(promise({ id: "x", occurredAt: "2026-07-01T00:00:00Z" }))).toBeNull();
    const bad = promise({ id: "y", occurredAt: "2026-07-01T00:00:00Z" });
    bad.sourceContext = { promised_intro: { expected_by: "soon" } };
    expect(promisedIntroOf(bad)).toBeNull();
    const good = promise({ id: "z", occurredAt: "2026-07-01T00:00:00Z" }, "2026-07-30", "his rep");
    expect(promisedIntroOf(good)).toEqual({ expected_by: "2026-07-30", of: "his rep" });
  });
});
