import { describe, expect, it } from "vitest";
import { toActivity, toDeal, toTask } from "../crm";
import {
  buildLocalCrm,
  toActivity as jsToActivity,
  toDeal as jsToDeal,
  toTask as jsToTask,
  // @ts-expect-error — plain .mjs script, no type declarations by design
} from "../../scripts/seed-local-crm.mjs";

// Q71 Phase 5. `scripts/seed-local-crm.mjs` re-states lib/crm.ts's row mappers
// because a .mjs script cannot import TypeScript. That duplication is only
// acceptable if it cannot drift — so this file imports BOTH and asserts they
// agree, including on the rows where a lazy copy would differ (nulls, absent
// keys, an out-of-range phase, a numeric string from a Postgres numeric).
// regen-fallback.mjs's person/project mappers carry the same duplication with
// only a "keep in sync" comment; this is the version that is enforced.

const FULL_DEAL_ROW = {
  id: "D-9001",
  person_id: "P-1001",
  org_id: "C-2001",
  vertical_id: "v-roofing",
  owner_id: "P-1002",
  name: "Phase 1 — site + brain",
  stage: "signed",
  value: "2000.00", // Postgres numeric comes back as a string
  routing_lane: "referral",
  referral_sourced: true,
  key_dates: { signed: "2026-07-23" },
  estimate: { low: 1500, high: 2500 },
  equity: { split: 35 },
  phase: 1,
  book_protected: false,
  notes: "check received",
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-23T00:00:00.000Z",
};

// Every nullable column null / absent — the shape that catches a `?? undefined`
// dropped in the copy.
const SPARSE_DEAL_ROW = {
  id: "D-9002",
  person_id: null,
  org_id: null,
  vertical_id: null,
  owner_id: null,
  name: "Unqualified inbound",
  stage: "new_lead",
  value: null,
  routing_lane: null,
  referral_sourced: false,
  key_dates: null,
  estimate: null,
  equity: null,
  phase: 4, // out of range on purpose
  book_protected: true,
  notes: null,
  created_at: "2026-07-25T00:00:00.000Z",
  updated_at: "2026-07-25T00:00:00.000Z",
};

const FULL_ACTIVITY_ROW = {
  id: "A-9001",
  person_id: "P-1001",
  org_id: "C-2001",
  deal_id: "D-9001",
  created_by: "max",
  type: "call",
  source: "fireflies",
  source_context: { meetingId: "fireflies-abc" },
  summary: "scoped phase 1",
  action_items: ["send agreement"],
  buying_signals: ["asked about timeline"],
  recording_url: "https://example.com/rec",
  transcript_url: "https://example.com/tx",
  book_protected: false,
  occurred_at: "2026-07-22T15:00:00.000Z",
  created_at: "2026-07-22T15:30:00.000Z",
};

const SPARSE_ACTIVITY_ROW = {
  id: "A-9002",
  person_id: null,
  org_id: null,
  deal_id: null,
  created_by: null,
  type: "note",
  source: "manual",
  source_context: null,
  summary: null,
  action_items: null,
  buying_signals: null,
  recording_url: null,
  transcript_url: null,
  book_protected: false,
  occurred_at: "2026-07-24T00:00:00.000Z",
  created_at: "2026-07-24T00:00:00.000Z",
};

const FULL_TASK_ROW = {
  id: "T-9001",
  activity_id: "A-9001",
  deal_id: "D-9001",
  person_id: "P-1001",
  assigned_to: "rob",
  title: "Get the LOI signed",
  detail: "verbal only so far",
  status: "open",
  due_date: "2026-07-31",
  book_protected: false,
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
};

const SPARSE_TASK_ROW = {
  id: "T-9002",
  activity_id: null,
  deal_id: null,
  person_id: null,
  assigned_to: null,
  title: "Follow up",
  detail: null,
  status: "done",
  due_date: null,
  book_protected: true,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

describe("seed-local-crm.mjs mappers match lib/crm.ts", () => {
  it.each([
    ["full deal", FULL_DEAL_ROW],
    ["sparse deal", SPARSE_DEAL_ROW],
  ])("toDeal agrees on a %s row", (_label, row) => {
    expect(jsToDeal(row)).toEqual(toDeal(row));
  });

  it.each([
    ["full activity", FULL_ACTIVITY_ROW],
    ["sparse activity", SPARSE_ACTIVITY_ROW],
  ])("toActivity agrees on a %s row", (_label, row) => {
    expect(jsToActivity(row)).toEqual(toActivity(row));
  });

  it.each([
    ["full task", FULL_TASK_ROW],
    ["sparse task", SPARSE_TASK_ROW],
  ])("toTask agrees on a %s row", (_label, row) => {
    expect(jsToTask(row)).toEqual(toTask(row));
  });

  // Non-vacuity: agreement above is only meaningful if the fixtures actually
  // exercise the branches. A mapper that returned {} for everything would pass
  // an equality test against itself.
  it("the fixtures exercise the branches the copy could get wrong", () => {
    const full = toDeal(FULL_DEAL_ROW);
    const sparse = toDeal(SPARSE_DEAL_ROW);
    expect(full.value).toBe(2000); // numeric string coerced, not passed through
    expect(sparse.value).toBeUndefined(); // null !== 0
    expect(full.phase).toBe(1);
    expect(sparse.phase).toBeUndefined(); // phase 4 narrowed away
    expect(sparse.keyDates).toEqual({}); // null key_dates defaults to an object
    expect(toActivity(SPARSE_ACTIVITY_ROW).sourceContext).toEqual({});
    expect(toTask(SPARSE_TASK_ROW).dueDate).toBeUndefined();
  });
});

describe("buildLocalCrm", () => {
  it("returns the exact three-key shape fileStore reads", () => {
    const out = buildLocalCrm({
      deals: [FULL_DEAL_ROW],
      activities: [FULL_ACTIVITY_ROW],
      tasks: [FULL_TASK_ROW],
    });
    expect(Object.keys(out).sort()).toEqual(["activities", "deals", "tasks"]);
    expect(out.deals).toEqual([toDeal(FULL_DEAL_ROW)]);
    expect(out.activities).toEqual([toActivity(FULL_ACTIVITY_ROW)]);
    expect(out.tasks).toEqual([toTask(FULL_TASK_ROW)]);
  });

  it("an empty database yields empty lists, not a crash", () => {
    expect(buildLocalCrm({})).toEqual({ deals: [], activities: [], tasks: [] });
    expect(buildLocalCrm()).toEqual({ deals: [], activities: [], tasks: [] });
  });

  // The overlay holds REAL rows. Marking it __synthetic would make the demo
  // banner (lib/ui/dataDisclosure.ts) claim real customer data is fake — the
  // one direction of that lie that gets acted on.
  it("never marks real rows as synthetic", () => {
    const out = buildLocalCrm({ deals: [FULL_DEAL_ROW] });
    expect(JSON.stringify(out)).not.toContain("__synthetic");
  });
});
