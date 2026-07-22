// PRD Task 1.7 DoD: rules testable against 10 seeded records covering each
// trigger. The 12 fixtures below cover all 4 triggers plus the negatives
// (done task, future due, demo exclusion, logged meeting, in-window meeting,
// under-threshold stage, unthresholded stage).
import { describe, expect, it } from "vitest";
import type { Activity, Deal, Task } from "../types";
import {
  meetingUnloggedItems,
  nextStepItems,
  stageAgingItems,
  whoDoITouchToday,
} from "../tasks/todayRules";

const TODAY = "2026-07-22";
const NOW = new Date("2026-07-22T15:00:00Z");

const task = (o: Partial<Task> & { id: string; title: string }): Task => ({
  status: "open",
  bookProtected: false,
  createdAt: "2026-07-10T00:00:00Z",
  updatedAt: "2026-07-10T00:00:00Z",
  ...o,
});

const deal = (o: Partial<Deal> & { id: string; name: string; stage: Deal["stage"] }): Deal => ({
  referralSourced: false,
  keyDates: {},
  bookProtected: false,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  ...o,
});

const meeting = (o: Partial<Activity> & { id: string; occurredAt: string }): Activity => ({
  type: "meeting",
  source: "manual",
  sourceContext: {},
  bookProtected: false,
  createdAt: o.occurredAt,
  ...o,
});

// The 10-record seed (plus 2 extra negatives), one comment per PRD trigger:
const tasks: Task[] = [
  task({ id: "t1", title: "Call Polk", dueDate: "2026-07-20", dealId: "d1" }), // 1 overdue
  task({ id: "t2", title: "Send quote", dueDate: "2026-07-22", personId: "p1" }), // 2 due today
  task({ id: "t3", title: "Future step", dueDate: "2026-07-25" }), // 3 not yet
  task({ id: "t4", title: "Done step", dueDate: "2026-07-01", status: "done" }), // 4 closed
  task({ id: "t5", title: "Demo step", dueDate: "2026-07-01", dealId: "demo-1" }), // 5 demo-excluded
];
const activities: Activity[] = [
  meeting({ id: "m1", occurredAt: "2026-07-19T14:00:00Z", dealId: "d2" }), // 6 unlogged >24h
  meeting({ id: "m2", occurredAt: "2026-07-19T14:00:00Z", dealId: "d3" }), // 7 logged (below)
  {
    ...meeting({ id: "m2b", occurredAt: "2026-07-20T09:00:00Z", dealId: "d3" }),
    type: "note", // the log that clears m2
  },
  meeting({ id: "m3", occurredAt: "2026-07-22T13:30:00Z", dealId: "d4" }), // 8 within 24h window
];
const deals: Deal[] = [
  deal({ id: "d5", name: "Miga reroof", stage: "contacted", updatedAt: "2026-07-17T00:00:00Z" }), // 9 aged 5d ≥ 3d
  deal({ id: "d6", name: "Oasis quote", stage: "quote_sent", updatedAt: "2026-07-20T00:00:00Z" }), // 10 only 2d < 5d
  deal({ id: "d7", name: "Fierro nego", stage: "negotiating", updatedAt: "2026-07-14T00:00:00Z" }), // +8d ≥ 7d
  deal({ id: "d8", name: "Signed deal", stage: "signed", updatedAt: "2026-01-01T00:00:00Z" }), // no threshold
];

describe("Task 1.7 — who do I touch today", () => {
  it("next-step: overdue + due-today trigger; future/done/demo don't", () => {
    const items = nextStepItems(tasks, TODAY);
    expect(items.map((i) => [i.taskId, i.trigger])).toEqual([
      ["t1", "next_step_overdue"],
      ["t2", "next_step_due_today"],
    ]);
    expect(items[0].reason).toBe('"Call Polk" was due 2026-07-20 — 2d overdue');
  });

  it("meeting-no-log: only the >24h meeting with nothing logged after", () => {
    const items = meetingUnloggedItems(activities, tasks, NOW);
    expect(items.map((i) => i.activityId)).toEqual(["m1"]);
  });

  it("a task created after the meeting also counts as logged", () => {
    const cleared = meetingUnloggedItems(
      activities,
      [...tasks, task({ id: "t6", title: "Follow up", dealId: "d2", createdAt: "2026-07-21T00:00:00Z" })],
      NOW
    );
    expect(cleared).toEqual([]);
  });

  it("stage-aging: 3d contacted + 7d negotiating fire; fresh + unthresholded don't", () => {
    const items = stageAgingItems(deals, TODAY);
    expect(items.map((i) => i.dealId)).toEqual(["d5", "d7"]);
    expect(items[0].reason).toBe('"Miga reroof" has sat in contacted 5d (limit 3d)');
  });

  it("composite is deterministically ordered and covers every trigger once", () => {
    const run = () => whoDoITouchToday({ tasks, deals, activities }, TODAY, NOW);
    const items = run();
    expect(items.map((i) => i.trigger)).toEqual([
      "next_step_overdue",
      "next_step_due_today",
      "meeting_unlogged",
      "stage_aging",
      "stage_aging",
    ]);
    expect(run()).toEqual(items); // two runs on the same input match exactly
  });

  it("rejects a malformed today (clock is the caller's job)", () => {
    expect(() => nextStepItems(tasks, "07/22/2026")).toThrow();
    expect(() => stageAgingItems(deals, "not-a-date")).toThrow();
  });
});
