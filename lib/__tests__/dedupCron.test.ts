import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronAuth } from "../dedup/detector";
import { GET } from "../../app/api/cron/dedup/route";

// Nightly cron route (PRD Task 3.5): env-gated + bearer-gated. These pin the
// gates only — the detector itself is covered by dedupRun/dedupMatch tests.

function req(auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/dedup", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("verifyCronAuth", () => {
  it("accepts exactly Bearer <secret>", () => {
    expect(verifyCronAuth("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects wrong secret, malformed header, missing header, unset secret", () => {
    expect(verifyCronAuth("Bearer wrong", "s3cret")).toBe(false);
    expect(verifyCronAuth("s3cret", "s3cret")).toBe(false);
    expect(verifyCronAuth(null, "s3cret")).toBe(false);
    expect(verifyCronAuth("Bearer s3cret", undefined)).toBe(false);
    expect(verifyCronAuth("Bearer s3cret ", "s3cret")).toBe(false);
  });
});

describe("GET /api/cron/dedup gates", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("503s when CRON_SECRET is unset (env-gated: nothing runs)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer anything"));
    expect(res.status).toBe(503);
  });

  it("401s on wrong/missing bearer when armed", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
  });
});
