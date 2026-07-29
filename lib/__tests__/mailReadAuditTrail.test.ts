// Q76 inc.3 — the ONE DoD clause inc.1/inc.2 left open: the audit TRAIL.
//
// `MAIL_READ_SCOPES` declares that every row the n8n Gmail capture writes is
// stamped `source='n8n'`. Until this file, that was a promise: the scan proved
// the route is the only declared mail door, and nothing proved the door writes
// a traceable row. "What has an agent read off our mail?" is only answerable by
// query if the rows are actually stamped — so the claim is driven here, through
// the REAL route handler over a fake store, and the expected values are read
// FROM THE DECLARATION rather than typed in. That direction is load-bearing:
// change `auditActivitySource` without changing the route (or the route without
// the declaration) and this suite goes red, which is the only thing that keeps
// the two from drifting apart quietly.
//
// n8nEmailRoute.test.ts precedent for the harness: no network, no Postgres, no
// env beyond the shared secret.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, NetworkData, Person } from "../types";
import {
  auditTrailBreaches,
  MAIL_READ_SCOPES,
  type AuditedRow,
} from "../comms/mailReadScope";

const h = vi.hoisted(() => ({
  activities: [] as Activity[],
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

// Trent is a known contact, so the message anchors on rung 1 and no person
// write is planned — the trail claim is about the ACTIVITY row, and a simpler
// path to it means a failure here can only be the trail.
const NETWORK: NetworkData = {
  people: [
    person({ id: "rob", name: "Rob Acheson", email: "rob@aivoicetech.io" }),
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
    upsertPerson: async () => {},
    upsertActivity: async (a: Activity) => {
      h.activities.push(a);
    },
  }),
}));

vi.mock("../comms/orgProposalSink", () => ({ supabaseProposalSink: () => null }));

import { POST } from "../../app/api/webhooks/n8n-email/route";

const SECRET = "test-secret";

const post = (body: unknown, secret = SECRET) =>
  POST({
    headers: { get: (k: string) => (k === "x-n8n-secret" ? secret : null) },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]);

const mail = (over: Record<string, unknown> = {}) => ({
  messageId: "m-trail-1",
  from: "Trent Brands <trent@thetitlebase.com>",
  to: "rob@aivoicetech.io",
  subject: "Phase 1 paperwork",
  date: "2026-07-29T14:00:00.000Z",
  ...over,
});

// The scope under test is the declaration itself, not a fixture copy of it.
const GMAIL_SCOPE = MAIL_READ_SCOPES.find((s) => s.sourceId === "n8n-gmail-capture")!;

beforeEach(() => {
  process.env.N8N_EMAIL_WEBHOOK_SECRET = SECRET;
  h.activities = [];
});

describe("Q76 audit trail — the declared stamp, driven through the real route", () => {
  it("the one declared mail reader exists and names a stamp to check", () => {
    expect(GMAIL_SCOPE).toBeDefined();
    expect(GMAIL_SCOPE.auditActivitySource.trim()).not.toBe("");
  });

  it("a captured message writes a row carrying the DECLARED stamp", async () => {
    const res = await post(mail());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ingested: true });

    // One row, and it satisfies the declaration — checked through the same
    // function a future source would be checked with, not by eyeballing fields.
    expect(h.activities).toHaveLength(1);
    expect(auditTrailBreaches(h.activities as AuditedRow[], GMAIL_SCOPE)).toEqual([]);

    // Named explicitly too, so a reader of this file sees WHAT the trail is:
    // query activities where source='n8n' and you have every mail read.
    expect(h.activities[0].source).toBe(GMAIL_SCOPE.auditActivitySource);
    expect(h.activities[0].createdBy).toBe(GMAIL_SCOPE.sourceId);
  });

  // Declaration drift is the failure this exists to catch: the route keeps
  // stamping 'n8n' while someone renames the declared source. The real captured
  // row is replayed against a mutated scope, so the red path is driven on live
  // data rather than on a hand-built row.
  it("goes red when the declaration and the route disagree", async () => {
    await post(mail());
    const drifted = { ...GMAIL_SCOPE, auditActivitySource: "gmail-v2" };
    const breaches = auditTrailBreaches(h.activities as AuditedRow[], drifted);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].kind).toBe("unstamped-row");
    expect(breaches[0].detail).toContain("gmail-v2");
  });

  // The failure mode where the check passes because there is no trail at all.
  it("treats a capture that wrote NO row as a breach, not a pass", () => {
    const breaches = auditTrailBreaches([], GMAIL_SCOPE);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({ kind: "no-audit-trail", subject: "n8n-gmail-capture" });
  });

  it("flags a row written under some other source's name", () => {
    const rows: AuditedRow[] = [{ id: "a-1", source: "manual", createdBy: "rep-ui" }];
    const breaches = auditTrailBreaches(rows, GMAIL_SCOPE);
    expect(breaches.map((b) => b.kind)).toEqual(["unstamped-row", "unstamped-row"]);
    expect(breaches.every((b) => b.subject === "a-1")).toBe(true);
  });

  // The gate the identity rule owns: crossover mail must leave no trail because
  // it must never be read into the CRM at all. Absence is the correct result
  // HERE — which is why the trail check is only run on rows from a capture that
  // was accepted, and why this case is asserted separately rather than folded in.
  it("a refused message writes nothing at all", async () => {
    const res = await post(
      mail({ messageId: "m-crossover", to: ["rob@aivoicetech.io", "rob@boostuppayments.com"] })
    );
    expect(await res.json()).toMatchObject({ ok: true, ingested: false });
    expect(h.activities).toHaveLength(0);
  });
});
