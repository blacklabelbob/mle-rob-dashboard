import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { findOrphans, orphanFlagTitle } from "../integrity/orphans";
import { GET } from "../../app/api/cron/integrity/route";

// PRD Task 3.7: orphan detector (pure) + nightly cron route gates.

const base = {
  peopleIds: ["p1"],
  orgIds: ["o1"],
  dealIds: ["d1"],
  activities: [{ id: "a1", person_id: "p1", org_id: null, deal_id: null }],
  tasks: [{ id: "t1", person_id: null, deal_id: "d1", activity_id: null }],
};

describe("findOrphans", () => {
  it("returns nothing on clean data", () => {
    expect(findOrphans(base)).toEqual([]);
  });

  it("flags a task stranded with zero anchors (the deal-delete set-null path)", () => {
    const findings = findOrphans({
      ...base,
      tasks: [{ id: "t2", person_id: null, deal_id: null, activity_id: null }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ table: "tasks", rowId: "t2" });
  });

  it("flags an anchorless activity (check constraint bypassed)", () => {
    const findings = findOrphans({
      ...base,
      activities: [{ id: "a2", person_id: null, org_id: null, deal_id: null }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ table: "activities", rowId: "a2" });
  });

  it("flags dangling references to deleted rows across all anchor kinds", () => {
    const findings = findOrphans({
      ...base,
      activities: [
        { id: "a3", person_id: "gone", org_id: null, deal_id: null },
        { id: "a4", person_id: null, org_id: "gone", deal_id: null },
        { id: "a5", person_id: null, org_id: null, deal_id: "gone" },
      ],
      tasks: [{ id: "t3", person_id: null, deal_id: null, activity_id: "gone" }],
    });
    expect(findings.map((f) => f.rowId).sort()).toEqual(["a3", "a4", "a5", "t3"]);
    expect(findings.every((f) => f.reason.includes("deleted"))).toBe(true);
  });

  it("orphanFlagTitle is deterministic per row — the flags idempotency key", () => {
    const f = { table: "tasks" as const, rowId: "t2", reason: "x" };
    expect(orphanFlagTitle(f)).toBe("Orphaned task row t2");
    expect(orphanFlagTitle(f)).toBe(orphanFlagTitle({ ...f, reason: "y" }));
  });
});

describe("GET /api/cron/integrity gates", () => {
  function req(auth?: string): NextRequest {
    return new NextRequest("http://localhost/api/cron/integrity", {
      headers: auth ? { authorization: auth } : {},
    });
  }

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("503s when CRON_SECRET is unset (env-gated: nothing runs)", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer anything"))).status).toBe(503);
  });

  it("401s on wrong/missing bearer when armed", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
  });
});
