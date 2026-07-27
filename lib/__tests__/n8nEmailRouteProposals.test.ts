// Q69 inc.14 — the DoD sentence itself, proved at the route.
//
// "Sending to a new domain creates the org; receiving from one does not" is the
// whole item, and the branch that decides it — the no-match path in
// app/api/webhooks/n8n-email/route.ts — has never been driven by a test with a
// sink attached. inc.13 covered the MATCHED path and deliberately mocked the
// sink to null, which is the documented unconfigured state, not the live one.
// So today the two lines that could invert the rule (`directionOf(payload, link)`
// and the `!== link.address` counterpart filter) are wiring nothing checks.
//
// The failure this file exists to catch is not a crash: it is a route that
// cheerfully queues a company for every newsletter Rob receives, which is the
// exact "auto-created org is cleanup" outcome rung 6 was written to prevent.
// Every module below it already passes its own tests in both directions.
//
// n8nEmailRoute.test.ts precedent: fake store, fake sink, no network, no Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, NetworkData, Person } from "../types";
import type { OrgProposalFlag } from "../comms/orgProposal";

const h = vi.hoisted(() => ({
  people: [] as unknown[],
  activities: [] as unknown[],
  inserted: [] as { title: string; entityName: string; detail: string }[],
  existing: [] as string[],
  sinkThrows: null as string | null,
  lookups: 0,
}));

const person = (over: Partial<Person>): Person => ({
  id: "x",
  name: "X",
  verticalId: "roofing",
  status: "unlit",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

// Only two records exist: Rob (carrying the capture address) and one known
// company. Every other domain in this file is a stranger.
const NETWORK: NetworkData = {
  people: [
    person({ id: "rob", name: "Rob Acheson", email: "rob@aivoicetech.io" }),
    person({
      id: "title-base",
      name: "The Title Base",
      entityKind: "company",
      website: "thetitlebase.com",
    }),
  ],
  edges: [],
  verticals: [{ id: "roofing", name: "Roofing", color: "#111" }],
  projects: [],
};

vi.mock("../storage", () => ({
  getStore: () => ({
    getNetwork: async () => NETWORK,
    upsertPerson: async (p: Person) => {
      h.people.push(p);
    },
    upsertActivity: async (a: Activity) => {
      h.activities.push(a);
    },
  }),
}));

// The live shape of the sink, not the null stand-in: `existingTitles` is what
// makes the ledger stop arguing with a decision Rob already made, so a test
// that skips it cannot see a re-queue.
vi.mock("../comms/orgProposalSink", () => ({
  supabaseProposalSink: () => ({
    async existingTitles(titles: string[]): Promise<string[]> {
      h.lookups += 1;
      if (h.sinkThrows === "read") throw new Error("ledger unreadable");
      return titles.filter((t) => h.existing.includes(t));
    },
    async insert(flags: OrgProposalFlag[]): Promise<void> {
      if (h.sinkThrows === "write") throw new Error("insert refused");
      for (const f of flags) {
        h.inserted.push({ title: f.title, entityName: f.entityName, detail: f.detail });
      }
    },
  }),
}));

import { POST } from "../../app/api/webhooks/n8n-email/route";

const SECRET = "test-secret";
const ROB = "rob@aivoicetech.io";

const post = (body: unknown) =>
  POST({
    headers: { get: (k: string) => (k === "x-n8n-secret" ? SECRET : null) },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]);

/** Rob writing out to a stranger — the only direction allowed to propose. */
const sent = (over: Record<string, unknown> = {}) => ({
  messageId: "m-out",
  from: `Rob Acheson <${ROB}>`,
  to: "Dana Reyes <dana@napleroofing.com>",
  subject: "Following up on the Naples job",
  date: "2026-07-27T14:00:00.000Z",
  ...over,
});

/** A stranger writing in — must leave no trace anywhere. */
const received = (over: Record<string, unknown> = {}) => ({
  messageId: "m-in",
  from: "Dana Reyes <dana@napleroofing.com>",
  to: ROB,
  subject: "Quote request",
  date: "2026-07-27T14:00:00.000Z",
  ...over,
});

beforeEach(() => {
  process.env.N8N_EMAIL_WEBHOOK_SECRET = SECRET;
  h.people = [];
  h.activities = [];
  h.inserted = [];
  h.existing = [];
  h.sinkThrows = null;
  h.lookups = 0;
});

describe("POST /api/webhooks/n8n-email — rung 6 at the route (the Q69 DoD)", () => {
  it("SENDING to a new domain queues the company — and creates nothing", async () => {
    const res = await post(sent());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, ingested: false, reason: "no contact match" });
    expect(body.proposedOrgs).toEqual(["napleroofing.com"]);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0].title).toBe("New company domain: napleroofing.com");
    expect(h.inserted[0].entityName).toBe("napleroofing.com");
    expect(h.inserted[0].detail).toContain("dana@napleroofing.com");

    // PROPOSES, NEVER CREATES. A queued flag is reviewable; an org row is cleanup.
    expect(h.people).toEqual([]);
    expect(h.activities).toEqual([]);
  });

  it("RECEIVING from a new domain queues nothing and never touches the ledger", async () => {
    const res = await post(received());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, ingested: false });
    expect(body.proposedOrgs).toEqual([]);
    expect(h.inserted).toEqual([]);
    // Not merely "inserted nothing" — the ledger is not even read, so an inbound
    // flood cannot cost a query per newsletter.
    expect(h.lookups).toBe(0);
    expect(h.people).toEqual([]);
    expect(h.activities).toEqual([]);
  });

  // The counterpart filter, from the other side: Rob's own address rides on
  // every captured message. Left in, `aivoicetech.io` — his own company —
  // queues itself as a new company to create, forever.
  it("never proposes the capture mailbox's own domain", async () => {
    await post(sent({ to: [ROB, "Dana Reyes <dana@napleroofing.com>"] }));
    expect(h.inserted.map((f) => f.entityName)).toEqual(["napleroofing.com"]);
  });

  // A cc'd introduction legitimately opens two companies at once; two people at
  // the same company is still one company.
  it("queues one flag per DOMAIN across the whole party list", async () => {
    await post(
      sent({
        to: ["dana@napleroofing.com", "Sam Cole <sam@napleroofing.com>"],
        cc: "intro@gulfsiding.com",
      })
    );
    expect(h.inserted.map((f) => f.entityName)).toEqual(["napleroofing.com", "gulfsiding.com"]);
  });

  // Rob resolving a flag is a decision. The route re-queuing it on his next
  // email to the same company would make the ledger argue with him.
  it("does not re-queue a domain already on the ledger", async () => {
    h.existing = ["New company domain: napleroofing.com"];
    const res = await post(sent());
    expect((await res.json()).proposedOrgs).toEqual([]);
    expect(h.inserted).toEqual([]);
  });

  // The blocklist gates CREATION: mail sent to a stranger's gmail must not
  // propose a company called "Gmail", and a known company still outranks it.
  it("never proposes a generic mail host", async () => {
    await post(sent({ to: "someone@gmail.com" }));
    expect(h.inserted).toEqual([]);
  });

  it("still answers 200 when the ledger write fails, and claims nothing queued", async () => {
    h.sinkThrows = "write";
    const res = await post(sent());
    // n8n must not retry-loop on our outage; the proposal is logged loudly by
    // the route instead of reported as queued when it is not.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ingested: false, proposedOrgs: [] });
    expect(h.inserted).toEqual([]);
  });

  it("does not queue behind an unreadable ledger", async () => {
    // An unreadable dedupe read must not fall through to "nothing exists yet" —
    // that turns one outage into a duplicate flag per email sent during it.
    h.sinkThrows = "read";
    const res = await post(sent());
    expect(res.status).toBe(200);
    expect((await res.json()).proposedOrgs).toEqual([]);
    expect(h.inserted).toEqual([]);
  });
});
