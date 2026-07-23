import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/cron/recycle/route";

// Recycle tagger route (PRD Task 5.4): env-gated + bearer-gated, same
// contract as the dedup/integrity/overdue crons. These pin the gates only —
// the candidate rules (180d boundary, demo/signed/lit/tagged/no-date
// exclusions, tag format) are covered by recycle.test.ts against the pure
// lib the route executes verbatim.

function req(auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/recycle", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/recycle gates", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("503s when CRON_SECRET is unset (env-gated: nothing runs)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer anything"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/CRON_SECRET/);
  });

  it("401s on wrong/missing bearer when armed", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
  });
});
