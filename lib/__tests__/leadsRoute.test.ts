// Task 5.1 route DoD: per-product bearer tokens on POST /api/leads —
// AIDRE test key creates person+deal with source details populated;
// missing/wrong token → 401; no keys in env → 503, fully inert.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Activity, Deal, NetworkData, Person } from "../types";
import { INTAKE_WORKED_EXAMPLES } from "../leads/intakePayload";
import {
  bearerToken,
  leadKeysFromEnv,
  leadsConfigured,
  productsForToken,
} from "../leads/intakeAuth";

describe("intakeAuth (pure)", () => {
  it("reads only set+non-blank env keys", () => {
    expect(leadKeysFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
    expect(leadsConfigured({})).toBe(false);
    const keys = leadKeysFromEnv({ LEADS_KEY_AIDRE: " k1 ", LEADS_KEY_AIVA: "" } as NodeJS.ProcessEnv);
    expect(keys).toEqual({ aidre: "k1" });
    expect(leadsConfigured(keys)).toBe(true);
  });

  it("bearerToken parses the header strictly", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("k1")).toBeNull();
    expect(bearerToken("Bearer k1")).toBe("k1");
    expect(bearerToken("bearer k1")).toBe("k1"); // scheme case-insensitive
  });

  it("token → product scoping; same key in both slots grants both", () => {
    expect(productsForToken({ aidre: "a", aiva: "b" }, "a")).toEqual(["aidre"]);
    expect(productsForToken({ aidre: "a", aiva: "b" }, "b")).toEqual(["aiva"]);
    expect(productsForToken({ aidre: "a", aiva: "b" }, "x")).toEqual([]);
    expect(productsForToken({ aidre: "s", aiva: "s" }, "s")).toEqual(["aidre", "aiva"]);
  });
});

describe("checkRateLimit (pure, clock injected)", () => {
  it("blocks at the limit and frees as the window slides", async () => {
    const { checkRateLimit } = await import("../leads/rateLimit");
    const hits = new Map<string, number[]>();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(hits, "aidre", t0 + i, 3, 1000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(hits, "aidre", t0 + 10, 3, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1); // oldest hit ages out within a second
    // Other keys are independent buckets.
    expect(checkRateLimit(hits, "aiva", t0 + 10, 3, 1000).allowed).toBe(true);
    // Window slides past the oldest hits → allowed again.
    expect(checkRateLimit(hits, "aidre", t0 + 1001, 3, 1000).allowed).toBe(true);
  });
});

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Someone",
  verticalId: "roofing",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const data: NetworkData = {
  people: [
    person({ id: "dale-hutchins", name: "Dale H", email: "owner@peakridgeroofing.com" }),
  ],
  edges: [],
  verticals: [{ id: "roofing", name: "Roofing", color: "#fff" }],
  projects: [],
};

describe("POST /api/leads", () => {
  const persons: Person[] = [];
  const deals: Deal[] = [];
  const activities: Activity[] = [];
  beforeEach(() => {
    persons.length = deals.length = activities.length = 0;
    process.env.LEADS_KEY_AIDRE = "aidre-test-key";
    process.env.LEADS_KEY_AIVA = "aiva-test-key";
    vi.doMock("@/lib/storage", () => ({
      getStore: () => ({
        getNetwork: async () => data,
        listDeals: async () => [...deals],
        upsertPerson: async (p: Person) => void persons.push(p),
        upsertDeal: async (d: Deal) => void deals.push(d),
        upsertActivity: async (a: Activity) => void activities.push(a),
      }),
    }));
  });
  afterEach(() => {
    delete process.env.LEADS_KEY_AIDRE;
    delete process.env.LEADS_KEY_AIVA;
    vi.doUnmock("@/lib/storage");
    vi.resetModules();
  });

  const post = async (body: unknown, token?: string, extraHeaders?: Record<string, string>) => {
    const { POST } = await import("../../app/api/leads/route");
    return POST(
      new Request("http://local/api/leads", {
        method: "POST",
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...extraHeaders,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      })
    );
  };

  it("503 inert when no keys are configured", async () => {
    delete process.env.LEADS_KEY_AIDRE;
    delete process.env.LEADS_KEY_AIVA;
    expect((await post(INTAKE_WORKED_EXAMPLES.aidre, "aidre-test-key")).status).toBe(503);
    expect(persons.length + deals.length + activities.length).toBe(0);
  });

  it("401 on missing, wrong, and cross-product tokens (DoD)", async () => {
    expect((await post(INTAKE_WORKED_EXAMPLES.aidre)).status).toBe(401);
    expect((await post(INTAKE_WORKED_EXAMPLES.aidre, "nope")).status).toBe(401);
    // AIVA's key may not submit an AIDRE lead
    expect((await post(INTAKE_WORKED_EXAMPLES.aidre, "aiva-test-key")).status).toBe(401);
    expect(persons.length + deals.length + activities.length).toBe(0);
  });

  it("400 reports every payload problem", async () => {
    const res = await post({ product: "aidre", contact: { name: "X" } }, "aidre-test-key");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.join(" ")).toContain("email/phone");
    expect(body.errors.join(" ")).toContain("source_context");
    expect((await post("not json{", "aidre-test-key")).status).toBe(400);
  });

  it("AIDRE key + worked example → matched person, deal at intake stage, activity with source details (DoD)", async () => {
    const res = await post(INTAKE_WORKED_EXAMPLES.aidre, "aidre-test-key");
    expect(res.status).toBe(201);
    const body = await res.json();
    // Email-exact match to the seeded ledger row — attach, don't duplicate.
    expect(body.person).toMatchObject({ action: "match", id: "dale-hutchins" });
    expect(deals).toHaveLength(1);
    expect(deals[0].personId).toBe("dale-hutchins");
    expect(deals[0].stage).toBe("new_lead");
    expect(activities).toHaveLength(1);
    expect(activities[0].source).toBe("aidre");
    expect(activities[0].sourceContext).toMatchObject({
      source_type: "email_reply",
      product: "aidre",
    });
    // Match fills empty contact fields only (phone/role/business were blank).
    expect(persons).toHaveLength(1);
    expect(persons[0].id).toBe("dale-hutchins");
    expect(persons[0].phone).toBe("+18135550142");
    expect(persons[0].status).toBe("warm"); // status untouched — whitelist holds
  });

  // ---- Task 5.2: idempotency + rate limit ----

  it("same Idempotency-Key twice → one person, one deal, one activity (Task 5.2 DoD)", async () => {
    const key = "aiva-evt-12345";
    const first = await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key", {
      "idempotency-key": key,
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.dealId).toBe(`lead-aiva-${key}`); // id derived from (product, key)

    const second = await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key", {
      "idempotency-key": key,
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.replayed).toBe(true);
    expect(secondBody.dealId).toBe(firstBody.dealId);
    expect(secondBody.activityId).toBe(firstBody.activityId);
    expect(secondBody.person.id).toBe(firstBody.person.id);
    // The DoD, literally: replay wrote NOTHING.
    expect(persons).toHaveLength(1);
    expect(deals).toHaveLength(1);
    expect(activities).toHaveLength(1);
  });

  it("different Idempotency-Keys are independent submits; keys are product-scoped", async () => {
    await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key", { "idempotency-key": "k-1" });
    await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key", { "idempotency-key": "k-2" });
    expect(deals.map((d) => d.id).sort()).toEqual(["lead-aiva-k-1", "lead-aiva-k-2"]);
    // AIDRE's "k-1" can never collide with AIVA's "k-1".
    const res = await post(INTAKE_WORKED_EXAMPLES.aidre, "aidre-test-key", {
      "idempotency-key": "k-1",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).dealId).toBe("lead-aidre-k-1");
  });

  it("malformed Idempotency-Key → 400, zero writes", async () => {
    const res = await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key", {
      "idempotency-key": "spaces and $ymbols",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Idempotency-Key");
    expect(persons.length + deals.length + activities.length).toBe(0);
  });

  it("61st request in the window → 429 with Retry-After, zero writes", async () => {
    // Invalid body: passes auth + rate accounting but never reaches the store.
    for (let i = 0; i < 60; i++) {
      expect((await post({ product: "aidre" }, "aidre-test-key")).status).toBe(400);
    }
    const res = await post({ product: "aidre" }, "aidre-test-key");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Rate buckets are per product — AIVA's quota is untouched.
    expect((await post({ product: "aiva" }, "aiva-test-key")).status).toBe(400);
    expect(persons.length + deals.length + activities.length).toBe(0);
  });

  it("AIVA key + worked example → creates a new person, source=api, product truth in context", async () => {
    const res = await post(INTAKE_WORKED_EXAMPLES.aiva, "aiva-test-key");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.person.action).toBe("create");
    expect(body.verticalUnmatched).toBe("real-estate-title"); // honest: not in registry
    expect(persons[0].name).toBe("Marisol Vega");
    expect(persons[0].notes).toContain("[lead: aiva]");
    expect(activities[0].source).toBe("api");
    expect(activities[0].sourceContext.product).toBe("aiva");
  });
});
