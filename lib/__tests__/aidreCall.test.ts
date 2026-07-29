import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Activity, NetworkData, Person } from "../types";
import {
  activityIdFor,
  aidreConfigured,
  callToActivity,
  matchCaller,
  type AidreCallPayload,
} from "../aidreCall";

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Jonathan Polk",
  verticalId: "v1",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const data: NetworkData = {
  people: [
    person({ id: "polk", name: "Jonathan Polk", phone: "+1 (239) 555-0142" }),
    person({
      id: "proplogic",
      name: "PropLogix",
      entityKind: "company",
      phone: "999-444-7142",
    }),
    person({ id: "nophone", name: "No Phone" }),
  ],
  edges: [],
  verticals: [{ id: "v1", name: "Title", color: "#fff" }],
  projects: [],
};

const payload = (over: Partial<AidreCallPayload> = {}): AidreCallPayload => ({
  callId: "c-100",
  callerNumber: "2395550142",
  ...over,
});

const NOW = "2026-07-22T15:00:00.000Z";

describe("aidreConfigured", () => {
  it("false with empty env — the zero-breakage gate", () => {
    expect(aidreConfigured({})).toBe(false);
    expect(aidreConfigured({ webhookSecret: "s" })).toBe(true);
  });
});

describe("activityIdFor", () => {
  it("is deterministic off the AIDRE call id — re-delivery idempotent", () => {
    expect(activityIdFor("c-100")).toBe("aidre-call-c-100");
    expect(activityIdFor("c-100")).toBe(activityIdFor("c-100"));
  });
});

describe("matchCaller", () => {
  it("matches on last-10-digit normalize, any formatting", () => {
    expect(matchCaller(data, payload({ callerNumber: "+1 (239) 555-0142" }))?.person.id).toBe(
      "polk"
    );
    expect(matchCaller(data, payload({ callerNumber: "239.555.0142" }))?.person.id).toBe("polk");
  });
  it("null for unknown numbers and empty input", () => {
    expect(matchCaller(data, payload({ callerNumber: "0000000000" }))).toBeNull();
    expect(matchCaller(data, payload({ callerNumber: "" }))).toBeNull();
  });
});

describe("callToActivity", () => {
  it("builds a type=call source=aidre row anchored to the matched person", () => {
    const match = matchCaller(data, payload())!;
    const a = callToActivity(
      payload({
        direction: "inbound",
        outcome: "booked",
        durationSeconds: 95,
        summary: "Booked a demo for Thursday",
        recordingUrl: "https://x/rec.mp3",
        transcriptUrl: "https://x/t.txt",
        startedAt: "2026-07-22T14:30:00Z",
      }),
      match,
      NOW
    );
    expect(a.id).toBe("aidre-call-c-100");
    expect(a.personId).toBe("polk");
    expect(a.orgId).toBeUndefined();
    expect(a.type).toBe("call");
    expect(a.source).toBe("aidre");
    expect(a.summary).toBe("Booked a demo for Thursday");
    expect(a.recordingUrl).toBe("https://x/rec.mp3");
    expect(a.transcriptUrl).toBe("https://x/t.txt");
    expect(a.occurredAt).toBe("2026-07-22T14:30:00.000Z");
    expect(a.createdAt).toBe(NOW);
    expect(a.sourceContext).toMatchObject({
      channel: "phone",
      direction: "inbound",
      outcome: "booked",
      aidreCallId: "c-100",
      callerNumber: "2395550142",
      durationSeconds: 95,
    });
  });

  it("company match anchors as orgId, never both (0005 check)", () => {
    const match = matchCaller(data, payload({ callerNumber: "999-444-7142" }))!;
    const a = callToActivity(payload(), match, NOW);
    expect(a.orgId).toBe("proplogic");
    expect(a.personId).toBeUndefined();
  });

  it("degrades gracefully: no summary/outcome/startedAt → honest defaults", () => {
    const match = matchCaller(data, payload())!;
    const a = callToActivity(payload({ startedAt: "not-a-date" }), match, NOW);
    expect(a.summary).toBe("AIDRE inbound call — completed");
    expect(a.occurredAt).toBe(NOW); // unparseable startedAt → receive time
    expect(a.sourceContext.outcome).toBe("completed");
  });
});

// Synthetic-POST DoD: the route creates one correctly-linked activity row.
describe("POST /api/webhooks/aidre-call", () => {
  const upserted: Activity[] = [];
  beforeEach(() => {
    upserted.length = 0;
    process.env.AIDRE_WEBHOOK_SECRET = "topsecret";
    vi.doMock("@/lib/storage", () => ({
      getStore: () => ({
        getNetwork: async () => data,
        upsertActivity: async (a: Activity) => {
          upserted.push(a);
          return a;
        },
      }),
    }));
  });
  afterEach(() => {
    delete process.env.AIDRE_WEBHOOK_SECRET;
    vi.doUnmock("@/lib/storage");
    vi.resetModules();
  });

  const post = async (body: unknown, secret?: string) => {
    const { POST } = await import("../../app/api/webhooks/aidre-call/route");
    return POST(
      new Request("http://local/api/webhooks/aidre-call", {
        method: "POST",
        headers: secret ? { "x-aidre-secret": secret } : {},
        body: JSON.stringify(body),
      })
    );
  };

  it("secret gates: 403 missing/bad; 503 when env unset", async () => {
    expect((await post(payload())).status).toBe(403);
    expect((await post(payload(), "wrong")).status).toBe(403);
    delete process.env.AIDRE_WEBHOOK_SECRET;
    vi.resetModules();
    expect((await post(payload(), "topsecret")).status).toBe(503);
    expect(upserted).toHaveLength(0);
  });

  it("synthetic POST → exactly one correctly-linked row (DoD)", async () => {
    const res = await post(payload({ outcome: "missed" }), "topsecret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ingested: true, activityId: "aidre-call-c-100" });
    expect(upserted).toHaveLength(1);
    expect(upserted[0].personId).toBe("polk");
    expect(upserted[0].type).toBe("call");
    expect(upserted[0].source).toBe("aidre");
  });

  it("unknown caller → 200 ingested:false, zero rows (no anchorless writes)", async () => {
    const res = await post(payload({ callerNumber: "555-000-9999" }), "topsecret");
    expect(res.status).toBe(200);
    expect((await res.json()).ingested).toBe(false);
    expect(upserted).toHaveLength(0);
  });

  it("missing callId/callerNumber → 400", async () => {
    expect((await post({ callerNumber: "2395550142" }, "topsecret")).status).toBe(400);
    expect((await post({ callId: "c-1" }, "topsecret")).status).toBe(400);
  });
});
