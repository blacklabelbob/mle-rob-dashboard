// PRD Task MC.13 DoD: seeded fixture FOR EACH RULE through the REAL route
// surfaces exactly the expected items (2.6 precedent — tasksTodayRoute).
// Rule semantics are pinned in needsActionEval.test.ts; this suite proves the
// endpoint wiring — file store on a temp CRM_DATA_PATH, real GET handler,
// real clock (fixtures seeded RELATIVE to now so expected IDs hold any day).
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Activity, Deal } from "../types";
import { todayInET } from "../integrity/overdue";

const tmp = path.join(os.tmpdir(), `mle-needs-action-route-${process.pid}.json`);
let GET: () => Promise<Response>;

const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
// Shift an ISO calendar day by n days (noon-UTC anchor, same trick as the lib).
const shift = (iso: string, days: number) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const deal = (o: Partial<Deal> & { id: string; name: string; stage: Deal["stage"] }): Deal => ({
  referralSourced: false,
  keyDates: {},
  bookProtected: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...o,
});

const activity = (o: Partial<Activity> & { id: string; occurredAt: string }): Activity => ({
  type: "call",
  source: "manual",
  sourceContext: {},
  bookProtected: false,
  createdAt: o.occurredAt,
  ...o,
});

beforeAll(async () => {
  const today = todayInET(new Date());
  const fixture = {
    deals: [
      // NA-1 new_lead_untouched: 48h-old lead, zero deal-anchored touches → IN
      deal({ id: "na1", name: "Cold Lead", stage: "new_lead", createdAt: hoursAgo(48) }),
      // NA-1 negative: same age but touched (activity anchored below) → OUT
      deal({ id: "na1x", name: "Touched Lead", stage: "new_lead", createdAt: hoursAgo(48) }),
      // NA-1 negative: inside the 24h SLA → OUT
      deal({ id: "na1f", name: "Fresh Lead", stage: "new_lead", createdAt: hoursAgo(2) }),
      // NA-3 proposal_lag: meeting_held 72h (updatedAt proxy, no status_change) → IN
      deal({ id: "na3", name: "No Proposal", stage: "meeting_held", updatedAt: hoursAgo(72) }),
      // NA-3 negative: inside the 48h SLA → OUT
      deal({ id: "na3f", name: "Fresh Meeting", stage: "meeting_held", updatedAt: hoursAgo(2) }),
      // NA-4 followup_lag: contacted aged 4d ≥ STAGE_AGING_DAYS.contacted → IN
      deal({ id: "na4", name: "Stale Contact", stage: "contacted", updatedAt: `${shift(today, -4)}T00:00:00Z` }),
      // NA-4 negative: contacted today → OUT
      deal({ id: "na4f", name: "Fresh Contact", stage: "contacted", updatedAt: `${today}T00:00:00Z` }),
      // NA-5 signed_not_invoiced: signed, stage entry = status_change 48h ago → IN
      deal({ id: "na5", name: "Uninvoiced", stage: "signed", updatedAt: "2026-01-01T00:00:00Z" }),
      // NA-5 negative: signed 1h ago per its status_change → OUT
      deal({ id: "na5f", name: "Just Signed", stage: "signed", updatedAt: "2026-01-01T00:00:00Z" }),
      // demo exclusion: would match NA-1 but demo-* → OUT
      deal({ id: "demo-na", name: "Demo Lead", stage: "new_lead", createdAt: hoursAgo(48) }),
    ],
    activities: [
      // the touch that clears na1x
      activity({ id: "act-touch", dealId: "na1x", occurredAt: hoursAgo(10) }),
      // status_change entries — prove the route exercises stageEntryAt, not just updatedAt
      activity({ id: "act-sign", type: "status_change", dealId: "na5", occurredAt: hoursAgo(48) }),
      activity({ id: "act-sign-f", type: "status_change", dealId: "na5f", occurredAt: hoursAgo(1) }),
    ],
  };
  await fs.writeFile(tmp, JSON.stringify(fixture), "utf8");
  process.env.STORAGE_SOURCE = "file";
  process.env.CRM_DATA_PATH = tmp;
  // Import AFTER env is set — lib/storage reads STORAGE_SOURCE at module load.
  ({ GET } = await import("../../app/api/admin/needs-action/route"));
});

describe("Task MC.13 — GET /api/admin/needs-action", () => {
  it("surfaces exactly the expected item per rule, table-ordered", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today).toBe(todayInET(new Date()));
    expect(body.count).toBe(4);
    expect(
      body.items.map((i: { ruleId: string; dealId: string }) => [i.ruleId, i.dealId])
    ).toEqual([
      ["new_lead_untouched", "na1"],
      ["proposal_lag", "na3"],
      ["followup_lag", "na4"],
      ["signed_not_invoiced", "na5"],
    ]);
  });

  it("reports NA-2 as blocked — honest coverage, never faked", async () => {
    const body = await (await GET()).json();
    expect(body.blocked.map((b: { ruleId: string }) => b.ruleId)).toEqual([
      "discovery_reminder_missing",
    ]);
    expect(body.blocked[0].reason).toBeTruthy();
  });
});
