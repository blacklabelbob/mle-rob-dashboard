import { describe, expect, it } from "vitest";
import { normalizeRep, repBandState, repTodayBand } from "@/lib/tasks/repTodayBand";
import type { TodayItem } from "@/lib/tasks/todayRules";
import type { Org, Person } from "@/lib/types";

const person = (id: string, assignedRep?: string): Person => ({
  id,
  name: id,
  verticalId: "roofing",
  status: "lead",
  signed: false,
  keyDates: {},
  phaseOne: "not_started",
  assignedRep,
});

const org = (id: string, assignedRep?: string): Org =>
  ({ ...person(id, assignedRep) }) as unknown as Org;

const item = (over: Partial<TodayItem> = {}): TodayItem => ({
  trigger: "next_step_overdue",
  reason: "r",
  ...over,
});

const JAKE = "Jake Torres (DEMO)";

describe("normalizeRep", () => {
  it("folds case and collapses whitespace, nothing else", () => {
    expect(normalizeRep("  Jake   Torres (DEMO) ")).toBe("jake torres (demo)");
    expect(normalizeRep(undefined)).toBe("");
  });
});

describe("repTodayBand", () => {
  it("keeps the rep's own items and never returns another rep's rows", () => {
    const items = [
      item({ taskId: "t1", personId: "p-mine" }),
      item({ taskId: "t2", personId: "p-theirs" }),
    ];
    const band = repTodayBand(items, JAKE, {
      people: [person("p-mine", JAKE), person("p-theirs", "Dana Ruiz")],
    });
    expect(band.mine.map((i) => i.taskId)).toEqual(["t1"]);
    expect(band.othersCount).toBe(1);
    expect(band.unattributable).toEqual([]);
  });

  it("matches EXACTLY, never by prefix — 'Jakeline' is not 'Jake'", () => {
    const items = [item({ taskId: "t1", personId: "p1" })];
    const band = repTodayBand(items, "Jake", {
      people: [person("p1", "Jakeline Ruiz")],
    });
    expect(band.mine).toEqual([]);
    expect(band.othersCount).toBe(1);
  });

  it("tolerates the same name typed with different case/spacing", () => {
    const band = repTodayBand([item({ personId: "p1" })], "jake  torres (demo)", {
      people: [person("p1", " Jake Torres (DEMO)")],
    });
    expect(band.mine).toHaveLength(1);
  });

  it("puts work nobody is assigned to in its OWN bucket, not in 'not mine'", () => {
    const items = [item({ taskId: "t1", personId: "p1" })];
    const band = repTodayBand(items, JAKE, { people: [person("p1", undefined)] });
    expect(band.mine).toEqual([]);
    expect(band.othersCount).toBe(0);
    expect(band.unattributable.map((i) => i.taskId)).toEqual(["t1"]);
  });

  it("treats an item with no anchor at all as unattributable", () => {
    const band = repTodayBand([item({ taskId: "t1" })], JAKE, {});
    expect(band.unattributable).toHaveLength(1);
  });

  it("falls back to the org when the item has only an org anchor", () => {
    const band = repTodayBand([item({ dealId: "d1", orgId: "o1" })], JAKE, {
      orgs: [org("o1", JAKE)],
    });
    expect(band.mine).toHaveLength(1);
  });

  it("prefers the PERSON's rep over the org's — the narrower assignment wins", () => {
    const band = repTodayBand([item({ personId: "p1", orgId: "o1" })], JAKE, {
      people: [person("p1", JAKE)],
      orgs: [org("o1", "Dana Ruiz")],
    });
    expect(band.mine).toHaveLength(1);
    expect(band.othersCount).toBe(0);
  });

  it("does NOT fall through to the org when the person exists but is unassigned", () => {
    const band = repTodayBand([item({ personId: "p1", orgId: "o1" })], JAKE, {
      people: [person("p1", undefined)],
      orgs: [org("o1", JAKE)],
    });
    expect(band.mine).toEqual([]);
    expect(band.unattributable).toHaveLength(1);
  });

  it("DOES consult the org when the personId matches no row (missing data, not an answer)", () => {
    const band = repTodayBand([item({ personId: "ghost", orgId: "o1" })], JAKE, {
      people: [],
      orgs: [org("o1", JAKE)],
    });
    expect(band.mine).toHaveLength(1);
  });

  it("a blank rep name matches nothing — it is not a rep", () => {
    const band = repTodayBand([item({ personId: "p1" })], "   ", {
      people: [person("p1", JAKE)],
    });
    expect(band.mine).toEqual([]);
    expect(band.othersCount).toBe(1);
  });

  it("preserves whoDoITouchToday's order verbatim", () => {
    const items = [
      item({ trigger: "next_step_overdue", taskId: "a", personId: "p1" }),
      item({ trigger: "next_step_due_today", taskId: "b", personId: "p1" }),
      item({ trigger: "stage_aging", dealId: "c", personId: "p1" }),
    ];
    const band = repTodayBand(items, JAKE, { people: [person("p1", JAKE)] });
    expect(band.mine.map((i) => i.taskId ?? i.dealId)).toEqual(["a", "b", "c"]);
  });

  it("returns the same buckets on a second identical run (deterministic)", () => {
    const items = [item({ personId: "p1" }), item({ personId: "p2" }), item({})];
    const args = { people: [person("p1", JAKE), person("p2", "Dana Ruiz")] };
    expect(repTodayBand(items, JAKE, args)).toEqual(repTodayBand(items, JAKE, args));
  });
});

// inc.2 — WHY the band is empty, not just THAT it is. Three causes that a rep
// must not be shown one blank box for.
describe("repBandState", () => {
  const empty = { mine: [], unattributable: [], othersCount: 0 };

  it("reports items when the rep has rows", () => {
    expect(repBandState({ ...empty, mine: [item({ personId: "p1" })] }, 1)).toEqual({
      kind: "items",
    });
  });

  it("reports items when the ONLY rows are unattributable — nobody-owned work is shown, never swallowed", () => {
    expect(repBandState({ ...empty, unattributable: [item({})] }, 1)).toEqual({ kind: "items" });
  });

  it("distinguishes 'the engine returned nothing' from 'nothing of yours'", () => {
    expect(repBandState(empty, 0)).toEqual({ kind: "none-company-wide" });
    expect(repBandState({ ...empty, othersCount: 4 }, 4)).toEqual({
      kind: "all-others",
      othersCount: 4,
    });
  });

  it("does not report a company-wide blank when items existed but none reached this rep", () => {
    // The pair that matters: totalItems > 0 with an empty band is NOT the
    // demo-exclusion message — telling a rep "nothing exists" while four
    // touches sit on the company's list is a false all-clear.
    expect(repBandState(empty, 4).kind).toBe("all-others");
  });
});
