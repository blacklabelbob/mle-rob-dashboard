import { describe, expect, it } from "vitest";
import type { NetworkData, Person } from "../types";
import {
  CAPTURE_IDENTITY,
  activityIdFor,
  allParties,
  emailToActivity,
  extractAddress,
  identityGate,
  matchContact,
  n8nEmailConfigured,
  type EmailPayload,
} from "../n8nEmail";

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Someone",
  verticalId: "v1",
  status: "warm",
  signed: false,
  keyDates: {},
  phaseOne: "not-started",
  ...over,
});

const data: NetworkData = {
  people: [
    person({ id: "polk", name: "Jonathan Polk", email: "jpolk@proplogix.com" }),
    person({
      id: "proplogic",
      name: "PropLogix",
      entityKind: "company",
      email: "info@proplogix.com",
    }),
    // Rob's own record carries the capture address (Q7b enrichment) — must
    // never match as the counterpart.
    person({ id: "rob", name: "Rob Acheson", email: CAPTURE_IDENTITY }),
  ],
  edges: [],
  verticals: [{ id: "v1", name: "Title", color: "#fff" }],
  projects: [],
};

const inbound = (over: Partial<EmailPayload> = {}): EmailPayload => ({
  messageId: "m-1",
  threadId: "t-1",
  from: "Jonathan Polk <JPolk@PropLogix.com>",
  to: "Rob Acheson <rob@aivoicetech.io>",
  subject: "Re: title data",
  snippet: "Sounds good, send the agreement.",
  date: "2026-07-22T14:00:00Z",
  ...over,
});

const NOW = "2026-07-22T15:00:00.000Z";

describe("n8nEmailConfigured", () => {
  it("false with empty env — the zero-breakage gate", () => {
    expect(n8nEmailConfigured({})).toBe(false);
    expect(n8nEmailConfigured({ webhookSecret: "s" })).toBe(true);
  });
});

describe("extractAddress / allParties", () => {
  it("lowercases and strips display names", () => {
    expect(extractAddress("Rob <Rob@AIVoiceTech.io>")).toBe("rob@aivoicetech.io");
    expect(extractAddress("  jpolk@proplogix.com ")).toBe("jpolk@proplogix.com");
    expect(extractAddress("not an address")).toBe("");
  });
  it("handles string, comma-joined, and array recipients", () => {
    expect(
      allParties(inbound({ to: ["a@x.com", "B <b@y.com>"], cc: "c@z.com, d@w.com" }))
    ).toEqual(["jpolk@proplogix.com", "a@x.com", "b@y.com", "c@z.com", "d@w.com"]);
  });
});

describe("identityGate — the email-identity rule", () => {
  it("accepts mail addressed to the capture identity", () => {
    expect(identityGate(inbound())).toEqual({ ok: true });
  });
  it("hard-rejects any boostuppayments.com party, even alongside aivoicetech", () => {
    const v = identityGate(
      inbound({ to: ["rob@aivoicetech.io", "rob@boostuppayments.com"] })
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("boostuppayments.com");
  });
  it("rejects crossover mail: To: boostuppayments even though it sits in the aivoicetech inbox", () => {
    const v = identityGate(inbound({ to: "Rob <rob@boostuppayments.com>" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("never ingested");
  });
  it("rejects mail where the capture identity is not a party at all", () => {
    const v = identityGate(inbound({ to: "other@example.com" }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain(CAPTURE_IDENTITY);
  });
});

describe("matchContact", () => {
  it("matches the counterpart case-insensitively", () => {
    const m = matchContact(data, inbound());
    expect(m?.person.id).toBe("polk");
    expect(m?.email).toBe("jpolk@proplogix.com");
  });
  it("never matches Rob's own record via the capture address", () => {
    const m = matchContact(data, inbound({ from: "unknown@nowhere.com" }));
    expect(m).toBeNull();
  });
  it("matches company rows too", () => {
    const m = matchContact(data, inbound({ from: "Info <info@ProPlogix.com>" }));
    expect(m?.person.id).toBe("proplogic");
  });
});

describe("emailToActivity", () => {
  it("builds a person-anchored inbound activity with a deterministic id", () => {
    const match = matchContact(data, inbound())!;
    const a = emailToActivity(inbound(), match, NOW);
    expect(a.id).toBe(activityIdFor("m-1"));
    expect(a.personId).toBe("polk");
    expect(a.orgId).toBeUndefined();
    expect(a.type).toBe("email");
    expect(a.source).toBe("n8n");
    expect(a.sourceContext.channel).toBe("email");
    expect(a.sourceContext.direction).toBe("inbound");
    expect(a.occurredAt).toBe("2026-07-22T14:00:00.000Z");
    expect(a.createdAt).toBe(NOW);
    expect(a.bookProtected).toBe(false);
    expect(a.summary).toBe("Re: title data — Sounds good, send the agreement.");
  });
  it("anchors company matches as orgId — never both (0005 ≤1-anchor check)", () => {
    const payload = inbound({ from: "info@proplogix.com" });
    const a = emailToActivity(payload, matchContact(data, payload)!, NOW);
    expect(a.orgId).toBe("proplogic");
    expect(a.personId).toBeUndefined();
  });
  it("marks Rob-sent mail outbound and falls back to nowIso on a bad date", () => {
    const payload = inbound({
      from: "Rob <rob@aivoicetech.io>",
      to: "jpolk@proplogix.com",
      date: "not a date",
      snippet: undefined,
    });
    const a = emailToActivity(payload, matchContact(data, payload)!, NOW);
    expect(a.sourceContext.direction).toBe("outbound");
    expect(a.occurredAt).toBe(NOW);
    expect(a.summary).toBe("Re: title data");
  });
});
