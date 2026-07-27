// Q69 inc.13 — the real POST handler over a fake store, closing the one gap
// inc.12 left: every piece of the people half is unit-tested, and the WIRING
// between them is not. inc.12's own failure mode was that both pure modules
// passed their tests while nothing called either, so mail still filed on the
// company with the human invisible. Unit tests could not see that; this can.
//
// Four claims the route makes that only the route can prove:
//  • a rung-3 email creates the person AND lands the activity — both writes;
//  • the capture mailbox is filtered out BEFORE planning, so Rob's own record
//    (which carries that address) is never merged by his own mail;
//  • a failed person write still ingests the email — one missing contact must
//    not cost us the conversation too;
//  • an empty plan touches `upsertPerson` zero times, so a known, complete
//    contact is never rewritten by every message they send.
//
// orgProposalsRoute precedent: no network, no env beyond the secret, no Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, NetworkData, Person } from "../types";

const h = vi.hoisted(() => ({
  people: [] as Person[],
  activities: [] as Activity[],
  failPerson: null as string | null,
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

// Rob's own row carries the capture address — the reason the route filters the
// mailbox out of the party list before planning. Roof Co owns roofco.com, so
// mail from an unknown human there anchors on rung 3.
const NETWORK: NetworkData = {
  people: [
    person({ id: "rob", name: "Rob Acheson", email: "rob@aivoicetech.io" }),
    person({
      id: "roof-co",
      name: "Roof Co",
      entityKind: "company",
      website: "https://www.roofco.com",
    }),
    person({
      id: "trent-brands",
      name: "Trent Brands",
      email: "trent@thetitlebase.com",
      orgId: "title-base",
      keyDates: { met: "2026-01-01" },
    }),
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
      if (h.failPerson && p.id === h.failPerson) {
        throw new Error(`store said no to ${p.id}`);
      }
      h.people.push(p);
    },
    upsertActivity: async (a: Activity) => {
      h.activities.push(a);
    },
  }),
}));

// The no-match branch queues org proposals through Supabase; nothing here
// exercises that path, and an unconfigured sink is its own documented state.
vi.mock("../comms/orgProposalSink", () => ({ supabaseProposalSink: () => null }));

import { POST } from "../../app/api/webhooks/n8n-email/route";

const SECRET = "test-secret";

const post = (body: unknown, secret = SECRET) =>
  POST({
    headers: { get: (k: string) => (k === "x-n8n-secret" ? secret : null) },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]);

const mail = (over: Record<string, unknown> = {}) => ({
  messageId: "m-1",
  from: "Dana Reyes <dana@roofco.com>",
  to: "rob@aivoicetech.io",
  subject: "Re: the Naples job",
  date: "2026-07-26T14:00:00.000Z",
  ...over,
});

beforeEach(() => {
  process.env.N8N_EMAIL_WEBHOOK_SECRET = SECRET;
  h.people = [];
  h.activities = [];
  h.failPerson = null;
});

describe("POST /api/webhooks/n8n-email — the people half, wired", () => {
  // The whole point of inc.12. Before it, this message produced an activity and
  // no human; the assertion that would have caught the dead code is `h.people`.
  it("a rung-3 email creates the person AND lands the activity", async () => {
    const res = await post(mail());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ingested: true });
    expect(body.peopleCreated).toEqual(["dana-reyes"]);

    expect(h.people).toHaveLength(1);
    expect(h.people[0]).toMatchObject({
      id: "dana-reyes",
      name: "Dana Reyes", // from the display name — never invented from the local part
      email: "dana@roofco.com",
      orgId: "roof-co",
    });

    // Rung 3 means the human was not in the CRM, so the mail anchors on the org.
    expect(h.activities).toHaveLength(1);
    expect(h.activities[0]).toMatchObject({ orgId: "roof-co", type: "email" });
    expect(h.activities[0].personId).toBeUndefined();
  });

  // Rob's record carries rob@aivoicetech.io. Left in the party list, EVERY
  // captured message would plan a merge onto Rob — the address is on all of them.
  it("never writes the capture mailbox's own record", async () => {
    await post(mail({ to: ["rob@aivoicetech.io", "Sam Cole <sam@roofco.com>"] }));
    expect(h.people.map((p) => p.id)).toEqual(["dana-reyes", "sam-cole"]);
    expect(h.people.some((p) => p.id === "rob")).toBe(false);
  });

  // One missing contact must not cost us the conversation as well. The activity
  // upsert runs after the people writes and independently of their outcome.
  it("still ingests the email when a person write fails", async () => {
    h.failPerson = "dana-reyes";
    const res = await post(mail());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ingested: true });
    expect(body.peopleCreated).toEqual([]);
    expect(h.people).toHaveLength(0);
    expect(h.activities).toHaveLength(1);
    expect(h.activities[0].orgId).toBe("roof-co");
  });

  // Rung 1: we already know this human. The email may only FILL what is blank —
  // Trent's typed name survives, his missing `business` gets filled from the org.
  it("merges a known contact without overwriting anything already typed", async () => {
    const res = await post(
      mail({ messageId: "m-2", from: "T. Brands <trent@thetitlebase.com>" })
    );
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ingested: true, peopleCreated: [] });
    expect(body.peopleMerged).toEqual(["trent-brands"]);

    expect(h.people).toHaveLength(1);
    expect(h.people[0]).toMatchObject({
      id: "trent-brands",
      name: "Trent Brands", // NOT "T. Brands" — a filled field is never overwritten
      business: "The Title Base", // blank before, filled now
      keyDates: { met: "2026-01-01" }, // LEAST, so the older met wins over this email
    });
    // Rung 1 matched the human, so this one lands on the person, not the org.
    expect(h.activities[0]).toMatchObject({ personId: "trent-brands" });
  });

  // Role accounts sit below rungs 1–3 by design: billing@ correctly anchors its
  // mail to the org, and must NOT also become a human in the rep's contact list.
  it("touches upsertPerson zero times when every party is skipped", async () => {
    const res = await post(
      mail({ messageId: "m-3", from: "Billing <billing@roofco.com>" })
    );
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ingested: true });
    expect(body.peopleCreated).toEqual([]);
    expect(body.peopleMerged).toEqual([]);
    expect(h.people).toEqual([]);
    expect(h.activities[0]).toMatchObject({ orgId: "roof-co" });
  });

  // The gates in front of all of the above still hold from the route's side.
  it("refuses a bad secret before reading the body", async () => {
    const res = await post(mail(), "wrong");
    expect(res.status).toBe(403);
    expect(h.people).toEqual([]);
    expect(h.activities).toEqual([]);
  });

  it("refuses an unregistered mailbox with a 200 n8n will not retry", async () => {
    const res = await post(mail({ mailbox: "rob@boostuppayments.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ingested: false });
    expect(h.people).toEqual([]);
    expect(h.activities).toEqual([]);
  });
});
