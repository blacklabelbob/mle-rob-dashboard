// PRD Task 2.6 DoD: seeded fixture through the REAL route returns exact
// expected task IDs. The rules themselves are pinned in todayRules.test.ts;
// this suite proves the endpoint wiring — file store on a temp CRM_DATA_PATH,
// real GET handler, real clock (fixtures are seeded RELATIVE to today-in-ET so
// the expected IDs are exact on any run date).
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Activity, Deal, Task } from "../types";
import { todayInET } from "../integrity/overdue";

const tmp = path.join(os.tmpdir(), `mle-today-route-${process.pid}.json`);
let GET: () => Promise<Response>;

// Shift an ISO calendar day by n days (noon-UTC anchor, same trick as the lib).
const shift = (iso: string, days: number) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const task = (o: Partial<Task> & { id: string; title: string }): Task => ({
  status: "open",
  bookProtected: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...o,
});

const deal = (o: Partial<Deal> & { id: string; name: string; stage: Deal["stage"] }): Deal => ({
  referralSourced: false,
  keyDates: {},
  bookProtected: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
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

beforeAll(async () => {
  const today = todayInET(new Date());
  const fixture = {
    tasks: [
      task({ id: "rt1", title: "Call back", dueDate: shift(today, -2), dealId: "rd1" }), // overdue
      task({ id: "rt2", title: "Send quote", dueDate: today, personId: "rp1" }), // due today
      task({ id: "rt3", title: "Next week", dueDate: shift(today, 3) }), // future — out
      task({ id: "rt4", title: "Closed", dueDate: shift(today, -5), status: "done" }), // done — out
      task({ id: "rt5", title: "Fixture", dueDate: shift(today, -1), dealId: "demo-1" }), // demo — out
    ],
    activities: [
      meeting({ id: "rm1", occurredAt: `${shift(today, -3)}T14:00:00Z`, dealId: "rd2" }), // unlogged
    ],
    deals: [
      deal({ id: "rd3", name: "Aged", stage: "contacted", updatedAt: `${shift(today, -4)}T00:00:00Z` }), // aged 4d ≥ 3d
      deal({ id: "rd4", name: "Fresh", stage: "contacted", updatedAt: `${today}T00:00:00Z` }), // 0d — out
    ],
  };
  await fs.writeFile(tmp, JSON.stringify(fixture), "utf8");
  process.env.STORAGE_SOURCE = "file";
  process.env.CRM_DATA_PATH = tmp;
  // Import AFTER env is set — lib/storage reads STORAGE_SOURCE at module load.
  ({ GET } = await import("../../app/api/tasks/today/route"));
});

describe("Task 2.6 — GET /api/tasks/today", () => {
  it("returns exactly the expected items in composite order", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today).toBe(todayInET(new Date()));
    expect(body.count).toBe(4);
    expect(
      body.items.map((i: { trigger: string; taskId?: string; activityId?: string; dealId?: string }) => [
        i.trigger,
        i.taskId ?? i.activityId ?? i.dealId,
      ])
    ).toEqual([
      ["next_step_overdue", "rt1"],
      ["next_step_due_today", "rt2"],
      ["meeting_unlogged", "rm1"],
      ["stage_aging", "rd3"],
    ]);
  });
});
