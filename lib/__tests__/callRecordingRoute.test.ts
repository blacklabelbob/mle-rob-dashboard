// Q68 inc.30 — the media-proxy route: credential ladder + the real GET handler over a fake
// store and a fake fetch (callTranscriptRoute precedent). No network, no env, no Postgres.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaCredential } from "../calls/recordingProxy";
import type { Activity } from "../types";

const SID = `RE${"a".repeat(32)}`;
const URL_OK = `https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/${SID}`;

const h = vi.hoisted(() => ({
  activities: [] as Activity[],
  thrown: null as Error | null,
}));
vi.mock("../storage", () => ({
  getStore: () => ({
    listActivities: async () => {
      if (h.thrown) throw h.thrown;
      return h.activities;
    },
  }),
}));

import { GET } from "../../app/api/calls/recording/route";

const activity = (over: Partial<Activity> = {}): Activity =>
  ({
    id: `dialer-${SID}`,
    personId: "p1",
    type: "call",
    source: "dialer",
    recordingUrl: URL_OK,
    bookProtected: false,
    occurredAt: "2026-07-26T00:00:00.000Z",
    createdAt: "2026-07-26T00:00:00.000Z",
    ...over,
  }) as Activity;

const req = (query: string, headers: Record<string, string> = {}) =>
  ({
    nextUrl: new URL(`https://d.example/api/calls/recording${query}`),
    headers: new Headers(headers),
  }) as never;

/** A fetch that never touches a network. Records what the route asked for. */
const fakeFetch = (res: Partial<Response> & { status: number; headers?: Record<string, string> }) => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return {
      status: res.status,
      headers: new Headers(res.headers ?? {}),
      body: res.body ?? null,
    } as Response;
  });
  vi.stubGlobal("fetch", impl);
  return calls;
};

beforeEach(() => {
  h.activities = [activity()];
  h.thrown = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mediaCredential", () => {
  it("prefers the scoped API key pair over the account token", () => {
    expect(
      mediaCredential({
        TWILIO_API_KEY_SID: "SK1",
        TWILIO_API_KEY_SECRET: "secret",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "token",
      })
    ).toEqual({ user: "SK1", pass: "secret" });
  });

  it("falls back to the account pair when no API key is set", () => {
    expect(mediaCredential({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "token" })).toEqual({
      user: "AC1",
      pass: "token",
    });
  });

  // The bug this pins: a well-formed credential that always 401s, from an env that reads as
  // configured — and rule 6 turns every 401 into our 502, so the symptom never names the cause.
  it("NEVER completes a half-set API key from the account token", () => {
    expect(mediaCredential({ TWILIO_API_KEY_SID: "SK1", TWILIO_AUTH_TOKEN: "token" })).toBeNull();
    expect(mediaCredential({ TWILIO_API_KEY_SECRET: "secret", TWILIO_ACCOUNT_SID: "AC1" })).toBeNull();
  });

  it("treats whitespace-only values as unset", () => {
    expect(mediaCredential({ TWILIO_ACCOUNT_SID: "  ", TWILIO_AUTH_TOKEN: "token" })).toBeNull();
  });

  it("is null on an empty environment", () => {
    expect(mediaCredential({})).toBeNull();
  });
});

describe("GET /api/calls/recording", () => {
  const armed = () => {
    vi.stubEnv("TWILIO_API_KEY_SID", "SK1");
    vi.stubEnv("TWILIO_API_KEY_SECRET", "secret");
  };

  it("400s an ill-formed sid before any store read", async () => {
    const spy = fakeFetch({ status: 200 });
    const res = await GET(req("?sid=../../etc/passwd"));
    expect(res.status).toBe(400);
    expect(spy).toHaveLength(0);
  });

  it("400s a missing sid", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("404s a sid with no activity row", async () => {
    h.activities = [];
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(404);
  });

  it("503s a failed lookup rather than reporting no recording", async () => {
    h.thrown = new Error("pg down");
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(503);
  });

  it("503s when no credential is configured — not 404", async () => {
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(503);
  });

  // The whole reason the route is addressed by sid: a foreign host never gets our credential.
  it("refuses a foreign stored host and fetches nothing", async () => {
    armed();
    h.activities = [activity({ recordingUrl: "https://api.twilio.com.evil.example/x.mp3" })];
    const spy = fakeFetch({ status: 200 });
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(404);
    expect(spy).toHaveLength(0);
  });

  it("streams a 200 with the stored url, basic auth, and no-store headers", async () => {
    armed();
    const spy = fakeFetch({ status: 200, headers: { "content-type": "audio/mpeg", "content-length": "9" } });
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(200);
    expect(spy[0].url).toBe(URL_OK);
    expect(spy[0].headers.Authorization).toBe(`Basic ${Buffer.from("SK1:secret").toString("base64")}`);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cdn-cache-control")).toBe("no-store");
    // Absent upstream on a full response; without it the player offers no scrub bar at all.
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  // Collapse this to 200 and <audio> marks the stream unseekable: every moment row still
  // renders a time, and clicking one moves the playhead nowhere.
  it("forwards Range and keeps a 206 a 206", async () => {
    armed();
    const spy = fakeFetch({
      status: 206,
      headers: { "content-type": "audio/mpeg", "content-range": "bytes 0-99/500" },
    });
    const res = await GET(req(`?sid=${SID}`, { range: "bytes=0-99" }));
    expect(spy[0].headers.Range).toBe("bytes=0-99");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-99/500");
  });

  // Their auth failure is not a prompt for OUR dashboard's password.
  it("turns an upstream 401 into 502", async () => {
    armed();
    fakeFetch({ status: 401, headers: { "www-authenticate": 'Basic realm="twilio"' } });
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(502);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("502s an HTML error page served with a 200", async () => {
    armed();
    fakeFetch({ status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(502);
  });

  it("502s a network failure instead of answering with an empty body", async () => {
    armed();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    const res = await GET(req(`?sid=${SID}`));
    expect(res.status).toBe(502);
  });
});
