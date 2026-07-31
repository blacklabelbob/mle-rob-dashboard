import { describe, it, expect } from "vitest";
import { planFlagWrite, planFlagReopen, supersededNote } from "../flags/supersede";

describe("planFlagWrite — a recurring finding corrects its own row", () => {
  it("inserts when no dedupe key is given, so unkeyed callers are unchanged", () => {
    const plan = planFlagWrite(undefined, [{ id: 1, status: "open" }]);
    expect(plan.action).toBe("insert");
    expect(plan.supersede).toEqual([]);
  });

  it("treats a blank or whitespace key as no key", () => {
    expect(planFlagWrite("   ", [{ id: 1, status: "open" }]).action).toBe("insert");
    expect(planFlagWrite("", []).action).toBe("insert");
  });

  it("inserts on first sighting", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", []);
    expect(plan.action).toBe("insert");
    expect(plan.reason).toMatch(/first sighting/);
  });

  it("updates the open row instead of stacking a second copy", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", [{ id: 134, status: "open" }]);
    expect(plan).toMatchObject({ action: "update", id: 134, supersede: [] });
  });

  // The exact shape observed on prod: #132 "26 meetings", #134 "25 archived meetings"
  // and #136 all open at once. Newest survives and carries the current number; the
  // older twins are superseded, never deleted.
  it("keeps the NEWEST open row and supersedes the older twins", () => {
    const plan = planFlagWrite("meeting-archive/unexplained", [
      { id: 132, status: "open" },
      { id: 136, status: "open" },
      { id: 134, status: "open" },
    ]);
    expect(plan).toMatchObject({ action: "update", id: 136 });
    expect(plan.supersede).toEqual([134, 132]);
    expect(plan.reason).toMatch(/3 times/);
  });

  it("ignores resolved rows when choosing the survivor", () => {
    const plan = planFlagWrite("k", [
      { id: 10, status: "resolved" },
      { id: 4, status: "open" },
    ]);
    expect(plan).toMatchObject({ action: "update", id: 4, supersede: [] });
  });

  // Reopening would bury Rob's resolution note under a machine-written update.
  it("inserts a NEW row when the finding recurs after being resolved", () => {
    const plan = planFlagWrite("k", [
      { id: 7, status: "resolved" },
      { id: 9, status: "resolved" },
    ]);
    expect(plan.action).toBe("insert");
    expect(plan.supersede).toEqual([]);
    expect(plan.reason).toMatch(/recurred/);
  });

  it("never proposes deleting anything — supersede ids are always ids it also names", () => {
    const plan = planFlagWrite("k", [
      { id: 1, status: "open" },
      { id: 2, status: "open" },
    ]);
    if (plan.action !== "update") throw new Error("expected update");
    expect(plan.supersede).not.toContain(plan.id);
  });

  it("the supersede note names the survivor and stays reversible", () => {
    expect(supersededNote(136)).toMatch(/#136/);
    expect(supersededNote(136)).toMatch(/Reopen/);
  });
});

describe("planFlagReopen — Rob's reopen click never becomes a 500 on his own ledger", () => {
  it("allows an unkeyed reopen, which is every row that existed before 0033", () => {
    expect(planFlagReopen(null, [{ id: 5, status: "open" }]).ok).toBe(true);
    expect(planFlagReopen("  ", [{ id: 5, status: "open" }]).ok).toBe(true);
  });

  it("allows reopen when no sibling holds the finding open", () => {
    expect(planFlagReopen("k", []).ok).toBe(true);
    expect(planFlagReopen("k", [{ id: 5, status: "resolved" }]).ok).toBe(true);
  });

  it("REFUSES when a keyed twin is open — the unique index would 500 instead", () => {
    const plan = planFlagReopen("k", [{ id: 134, status: "open" }]);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.blockedBy).toBe(134);
    expect(plan.message).toMatch(/#134/);
  });

  it("names the NEWEST open twin, the one carrying current numbers", () => {
    const plan = planFlagReopen("k", [
      { id: 120, status: "open" },
      { id: 134, status: "open" },
      { id: 99, status: "resolved" },
    ]);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.blockedBy).toBe(134);
  });

  it("refuses instead of auto-resolving the twin — it never proposes closing another row", () => {
    const plan = planFlagReopen("k", [{ id: 134, status: "open" }]);
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.message).toMatch(/resolve it first/i);
    expect(Object.keys(plan)).not.toContain("supersede");
  });
});
