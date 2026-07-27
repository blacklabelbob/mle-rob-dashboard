import { describe, expect, it } from "vitest";
import {
  ORG_DOMAIN_UNIQUE_INDEX,
  domainRaceDetail,
  isOrgDomainConflict,
  newOrgToPerson,
  orgIdFor,
  planOrgFromProposal,
  type ReviewedProposal,
} from "../comms/orgFromProposal";
import type { GraphIndex } from "../comms/emailGraph";
import { genericDomainSet } from "../comms/genericDomains";

const VERTICALS = ["core", "roofing", "title", "payments"];

const index = (orgsByDomain: Record<string, string> = {}): GraphIndex => ({
  personIdByEmail: new Map(),
  orgIdByDomain: new Map(Object.entries(orgsByDomain)),
  genericDomains: genericDomainSet(),
  contestedDomains: new Set(),
});

const reviewed = (over: Partial<ReviewedProposal> = {}): ReviewedProposal => ({
  domain: "the-title-base.com",
  name: "The Title Base",
  verticalId: "title",
  address: "trent@the-title-base.com",
  ...over,
});

describe("planOrgFromProposal", () => {
  it("creates the org a reviewer confirmed", () => {
    const plan = planOrgFromProposal(reviewed(), index(), [], VERTICALS, "2026-07-26");
    expect(plan.kind).toBe("create");
    if (plan.kind !== "create") return;
    expect(plan.org.id).toBe("the-title-base");
    expect(plan.org.name).toBe("The Title Base");
    expect(plan.org.domain).toBe("the-title-base.com");
    expect(plan.org.website).toBe("https://the-title-base.com");
    expect(plan.org.verticalId).toBe("title");
    expect(plan.org.entityKind).toBe("company");
  });

  // A company known only from one outbound email is a LEAD at `unlit`.
  // Anything warmer is a claim about a relationship that has not happened.
  it("starts the company as an unlit lead, never a client", () => {
    const plan = planOrgFromProposal(reviewed(), index(), [], VERTICALS);
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.org.nodeType).toBe("lead");
    expect(plan.org.status).toBe("unlit");
  });

  // HARD LIMIT: money and commitment fields are structurally unreachable here.
  it("never carries a money or signed field", () => {
    const plan = planOrgFromProposal(reviewed(), index(), [], VERTICALS);
    if (plan.kind !== "create") throw new Error("expected create");
    const keys = Object.keys(plan.org);
    for (const banned of ["quotedAmount", "quoted_amount", "signed", "paid", "amount"]) {
      expect(keys).not.toContain(banned);
    }
  });

  // The race inc.4 has to survive: queued Monday, created by hand Tuesday,
  // reviewed Wednesday. Creating anyway splits one company across two rows.
  it("refuses when an org already owns the domain", () => {
    const plan = planOrgFromProposal(
      reviewed(),
      index({ "the-title-base.com": "the-title-base" }),
      ["the-title-base"],
      VERTICALS
    );
    expect(plan).toMatchObject({ kind: "refused", reason: "domain-already-known" });
  });

  // The blocklist gates CREATION at every layer — including a reviewer's click.
  it("refuses a generic domain even with a confirmed name", () => {
    const plan = planOrgFromProposal(
      reviewed({ domain: "gmail.com", name: "Some Roofer" }),
      index(),
      [],
      VERTICALS
    );
    expect(plan).toMatchObject({ kind: "refused", reason: "generic-domain" });
  });

  // inc.3's rule surviving into creation: the guess is a suggestion, and an
  // unconfirmed one would put a company called "Mail" in Rob's CRM forever.
  it("refuses to create without a confirmed name", () => {
    const plan = planOrgFromProposal(reviewed({ name: "   " }), index(), [], VERTICALS);
    expect(plan).toMatchObject({ kind: "refused", reason: "name-required" });
  });

  it("refuses a missing or unregistered vertical rather than failing the FK", () => {
    expect(planOrgFromProposal(reviewed({ verticalId: "" }), index(), [], VERTICALS)).toMatchObject({
      kind: "refused",
      reason: "vertical-required",
    });
    expect(planOrgFromProposal(reviewed({ verticalId: "rooofing" }), index(), [], VERTICALS)).toMatchObject({
      kind: "refused",
      reason: "unknown-vertical",
    });
  });

  it("refuses anything that is not a domain", () => {
    for (const domain of ["", "roofco", "trent@roofco.com", "roof co.com"]) {
      expect(planOrgFromProposal(reviewed({ domain }), index(), [], VERTICALS)).toMatchObject({
        kind: "refused",
        reason: "invalid-domain",
      });
    }
  });

  it("normalises the domain the flag carried", () => {
    const plan = planOrgFromProposal(reviewed({ domain: " RoofCo.COM. " }), index(), [], VERTICALS);
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.org.domain).toBe("roofco.com");
    expect(plan.org.website).toBe("https://roofco.com");
  });

  it("stamps provenance without reaching for a clock", () => {
    const withDate = planOrgFromProposal(reviewed(), index(), [], VERTICALS, "2026-07-26");
    const without = planOrgFromProposal(reviewed(), index(), [], VERTICALS);
    if (withDate.kind !== "create" || without.kind !== "create") throw new Error("expected create");
    expect(withDate.org.notes).toContain("trent@the-title-base.com");
    expect(withDate.org.notes).toContain("2026-07-26");
    expect(without.org.notes).not.toContain("undefined");
  });
});

// Q69 inc.5: the plan has to reach the store without widening into the money
// fields `NewOrgRow` deliberately omits.
describe("newOrgToPerson", () => {
  const created = () => {
    const plan = planOrgFromProposal(reviewed(), index(), [], VERTICALS, "2026-07-26");
    if (plan.kind !== "create") throw new Error("expected create");
    return newOrgToPerson(plan.org);
  };

  it("carries the plan's row through verbatim", () => {
    const person = created();
    expect(person.id).toBe("the-title-base");
    expect(person.name).toBe("The Title Base");
    expect(person.entityKind).toBe("company");
    expect(person.nodeType).toBe("lead");
    expect(person.status).toBe("unlit");
    expect(person.verticalId).toBe("title");
    expect(person.website).toBe("https://the-title-base.com");
    expect(person.notes).toContain("the-title-base.com");
  });

  // HARD LIMIT: one outbound email must never produce a money or commitment
  // fact. `Person` carries those fields even though `NewOrgRow` does not, so
  // this is where the narrowness has to be re-proved.
  it("sets no money, signed or key-date fact", () => {
    const person = created();
    expect(person.signed).toBe(false);
    expect(person.quotedAmount).toBeUndefined();
    expect(person.keyDates).toEqual({});
    expect(person.phaseOne).toBe("not-started");
  });
});

// Q69 inc.9: when the DATABASE is the one refusing (0022's orgs_domain_unique),
// the reviewer must read the same refusal they would have read a second earlier
// — not a 500. Every case here is a message shape the store can actually hand
// the route (`supabaseStore.upsertPerson` flattens the Postgres error, so the
// constraint name is the only surviving part of the original).
describe("isOrgDomainConflict", () => {
  it("recognises the domain index through the store's wrapping", () => {
    expect(
      isOrgDomainConflict(
        new Error(
          'supabase upsertPerson failed: duplicate key value violates unique constraint "orgs_domain_unique"'
        )
      )
    ).toBe(true);
  });

  // A pkey collision means `orgIdFor` handed out a taken id — a real bug.
  // Dressing it as "that domain already belongs to someone" buries it.
  it("does NOT treat another unique violation as a domain conflict", () => {
    expect(
      isOrgDomainConflict(
        new Error(
          'supabase upsertPerson failed: duplicate key value violates unique constraint "orgs_pkey"'
        )
      )
    ).toBe(false);
  });

  // Total, so the caller rethrows rather than swallowing an unknown failure.
  it("is false for unrelated, empty and non-Error failures", () => {
    expect(isOrgDomainConflict(new Error("supabase upsertPerson failed: timeout"))).toBe(false);
    expect(isOrgDomainConflict(null)).toBe(false);
    expect(isOrgDomainConflict(undefined)).toBe(false);
    expect(isOrgDomainConflict({ code: "23505" })).toBe(false);
    expect(isOrgDomainConflict("")).toBe(false);
  });

  it("reads a raw string error too — the store is not the only caller", () => {
    expect(isOrgDomainConflict('violates unique constraint "orgs_domain_unique"')).toBe(true);
  });

  // The name is the contract with migration 0022. If the index is ever renamed
  // without this constant following it, every race becomes a 500 again.
  it("keys on the index name migration 0022 created", () => {
    expect(ORG_DOMAIN_UNIQUE_INDEX).toBe("orgs_domain_unique");
  });

  it("tells the reviewer what actually happened, naming the domain", () => {
    expect(domainRaceDetail("roofco.com")).toContain("roofco.com");
    expect(domainRaceDetail("roofco.com")).toMatch(/created by someone else/i);
  });
});

describe("orgIdFor", () => {
  it("suffixes rather than reusing a taken id", () => {
    expect(orgIdFor("Roof Co", "roofco.com", new Set(["roof-co"]))).toBe("roof-co-2");
    expect(orgIdFor("Roof Co", "roofco.com", new Set(["roof-co", "roof-co-2"]))).toBe("roof-co-3");
  });

  // A name of pure punctuation slugs to "" — an empty id collides with itself.
  it("falls back to the domain label, then to `org`, never to an empty id", () => {
    expect(orgIdFor("!!!", "roofco.com", new Set())).toBe("roofco");
    expect(orgIdFor("!!!", "...", new Set())).toBe("org");
  });
});
