import { describe, expect, it } from "vitest";
import {
  findOverdueTasks,
  overdueFlagDetail,
  overdueFlagTitle,
  todayInET,
  type OverdueTaskRow,
} from "../integrity/overdue";

const TODAY = "2026-07-22";

function task(over: Partial<OverdueTaskRow>): OverdueTaskRow {
  return {
    id: "t1",
    title: "Follow up with Caleb",
    status: "open",
    due_date: "2026-07-20",
    assigned_to: null,
    ...over,
  };
}

describe("findOverdueTasks (PRD Task 3.4)", () => {
  it("flags an open task strictly past due", () => {
    const f = findOverdueTasks([task({})], TODAY);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      taskId: "t1",
      dueDate: "2026-07-20",
      daysOverdue: 2,
    });
  });

  it("due TODAY is not overdue; due tomorrow is not overdue", () => {
    expect(findOverdueTasks([task({ due_date: TODAY })], TODAY)).toHaveLength(0);
    expect(
      findOverdueTasks([task({ due_date: "2026-07-23" })], TODAY)
    ).toHaveLength(0);
  });

  it("done/cancelled and undated tasks never alert", () => {
    expect(
      findOverdueTasks(
        [
          task({ status: "done" }),
          task({ id: "t2", status: "cancelled" }),
          task({ id: "t3", due_date: null }),
        ],
        TODAY
      )
    ).toHaveLength(0);
  });

  it("demo-* rows never alert (same DEMO rule as dedup/completeness)", () => {
    expect(findOverdueTasks([task({ id: "demo-t1" })], TODAY)).toHaveLength(0);
  });

  it("deterministic order: most overdue first, then id", () => {
    const out = findOverdueTasks(
      [
        task({ id: "b", due_date: "2026-07-21" }),
        task({ id: "a", due_date: "2026-07-21" }),
        task({ id: "c", due_date: "2026-07-01" }),
      ],
      TODAY
    );
    expect(out.map((f) => f.taskId)).toEqual(["c", "a", "b"]);
  });

  it("rejects a malformed today (route bug can't silently flag everything)", () => {
    expect(() => findOverdueTasks([task({})], "22/07/2026")).toThrow();
  });

  it("title is deterministic (idempotency key) and re-arms on reschedule", () => {
    const [f1] = findOverdueTasks([task({})], TODAY);
    const [f2] = findOverdueTasks([task({})], "2026-07-23"); // next day, same due
    expect(overdueFlagTitle(f1)).toBe(overdueFlagTitle(f2)); // no dupe on re-run
    const [f3] = findOverdueTasks([task({ due_date: "2026-07-21" })], TODAY);
    expect(overdueFlagTitle(f3)).not.toBe(overdueFlagTitle(f1)); // reschedule re-arms
  });

  it("detail carries title, assignee, and day count", () => {
    const [f] = findOverdueTasks(
      [task({ assigned_to: "rob", due_date: "2026-07-21" })],
      TODAY
    );
    const d = overdueFlagDetail(f);
    expect(d).toContain("Follow up with Caleb");
    expect(d).toContain("assigned: rob");
    expect(d).toContain("1 day overdue");
  });
});

describe("todayInET", () => {
  it("judges the calendar day in ET, not UTC", () => {
    // 2026-07-23T01:00Z is still 9pm July 22 in ET (EDT, UTC-4)
    expect(todayInET(new Date("2026-07-23T01:00:00Z"))).toBe("2026-07-22");
    expect(todayInET(new Date("2026-07-23T12:00:00Z"))).toBe("2026-07-23");
  });
});
