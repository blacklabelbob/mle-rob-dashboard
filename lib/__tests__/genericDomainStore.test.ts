import { describe, expect, it } from "vitest";
import { GENERIC_EMAIL_DOMAINS, genericDomainSet } from "../comms/genericDomains";
import { normalizeExtraDomains } from "../comms/genericDomainStore";
import { buildGraphIndex } from "../comms/emailGraphIndex";
import type { NetworkData, Person } from "../types";

// Q69 inc.24 — migration 0023's extras table, normalized. The invariant under
// every test here: the table ADDS to the hardcoded floor and can never lower it.

const person = (over: Partial<Person>): Person =>
  ({
    id: "x",
    name: "X",
    entityKind: "person",
    status: "unlit",
    signed: false,
    keyDates: [],
    ...over,
  }) as Person;

const net = (people: Person[]): NetworkData =>
  ({ people, verticals: [], activities: [] }) as unknown as NetworkData;

describe("normalizeExtraDomains", () => {
  it("normalizes case and whitespace — that is typing, not intent", () => {
    expect(normalizeExtraDomains(["  MailChimp.COM " ]).domains).toEqual(["mailchimp.com"]);
  });

  it("refuses an address rather than narrowing it to its domain half", () => {
    const out = normalizeExtraDomains(["billing@roofco.com"]);
    expect(out.domains).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/address/);
  });

  it("refuses values that would sit in the table matching nothing forever", () => {
    for (const bad of ["gmail", ".com", "com", "http://mailchimp.com", "mail chimp.com", "roofco.com/x"]) {
      expect(normalizeExtraDomains([bad]).domains, bad).toEqual([]);
    }
  });

  it("counts every refusal so a wrong row is visible, never silently dropped", () => {
    const out = normalizeExtraDomains(["gmail", "billing@x.com", 7]);
    expect(out.skipped.map((s) => s.reason)).toHaveLength(3);
  });

  it("ignores blank rows without calling them errors", () => {
    expect(normalizeExtraDomains(["", "   "])).toEqual({ domains: [], skipped: [] });
  });

  it("dedupes, so one domain typed twice is one entry", () => {
    expect(normalizeExtraDomains(["a.com", "A.com"]).domains).toEqual(["a.com"]);
  });
});

describe("the floor cannot be lowered from the database", () => {
  it("keeps every hardcoded domain generic when the table is empty", () => {
    const set = genericDomainSet(normalizeExtraDomains([]).domains);
    for (const d of GENERIC_EMAIL_DOMAINS) expect(set.has(d)).toBe(true);
  });

  it("keeps gmail.com generic even if the table is unreadable (extras empty)", () => {
    // The unreadable-read path hands the caller domains: [] — identical to the
    // empty-table path by design. Nothing about the floor changes.
    expect(genericDomainSet([]).has("gmail.com")).toBe(true);
  });

  it("an added domain stops a company claiming it in the graph index", () => {
    const data = net([person({ id: "org-bulk", entityKind: "company", website: "newsblast.io" })]);
    expect(buildGraphIndex(data).orgIdByDomain.get("newsblast.io")).toBe("org-bulk");
    expect(buildGraphIndex(data, ["newsblast.io"]).orgIdByDomain.has("newsblast.io")).toBe(false);
  });

  it("an added domain never removes an exact-address match (rung 1 untouched)", () => {
    const data = net([
      person({ id: "p-1", email: "dana@newsblast.io" }),
      person({ id: "org-bulk", entityKind: "company", website: "newsblast.io" }),
    ]);
    const index = buildGraphIndex(data, ["newsblast.io"]);
    expect(index.personIdByEmail.get("dana@newsblast.io")).toBe("p-1");
  });
});
