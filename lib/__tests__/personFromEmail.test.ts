import { describe, expect, it } from "vitest";
import {
  displayNameFrom,
  earliestMet,
  personIdFor,
  planPersonFromEmail,
  usableMet,
  type AnchorOrg,
} from "../comms/personFromEmail";
import type { GraphIndex, GraphPlan } from "../comms/emailGraph";
import { genericDomainSet } from "../comms/genericDomains";
import type { Person } from "../types";

const index = (): GraphIndex => ({
  personIdByEmail: new Map(),
  orgIdByDomain: new Map([["roofco.com", "roofco"]]),
  genericDomains: genericDomainSet(),
  contestedDomains: new Set(),
});

const ORG: AnchorOrg = { id: "roofco", name: "RoofCo", verticalId: "roofing" };

const orgPlan = (address: string): GraphPlan => ({
  kind: "org",
  orgId: "roofco",
  address,
  domain: address.slice(address.lastIndexOf("@") + 1),
});

const person = (over: Partial<Person> = {}): Person => ({
  id: "dana-reyes",
  name: "Dana Reyes",
  verticalId: "roofing",
  status: "lit",
  signed: false,
  keyDates: {},
  phaseOne: {} as Person["phaseOne"],
  ...over,
});

describe("planPersonFromEmail — creation (rung 3)", () => {
  it("creates the human behind mail that only anchored the company", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("dana@roofco.com"),
      party: { address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" },
      index: index(),
      org: ORG,
      capturedAtISO: "2026-07-27",
      emailDateISO: "2026-07-26T14:02:00Z",
    });
    expect(plan.kind).toBe("create");
    if (plan.kind !== "create") return;
    expect(plan.person).toMatchObject({
      id: "dana-reyes",
      name: "Dana Reyes",
      email: "dana@roofco.com",
      orgId: "roofco",
      business: "RoofCo",
      verticalId: "roofing",
      entityKind: "person",
      nodeType: "lead",
      status: "unlit",
      metISO: "2026-07-26",
    });
    // The HARD LIMIT as a type: an email cannot reach a money or commitment
    // field, so those keys do not exist on the row at all.
    expect(Object.keys(plan.person)).not.toContain("quotedAmount");
    expect(Object.keys(plan.person)).not.toContain("signed");
  });

  it("REFUSES a role account — rung 3 files its mail, it is not a human", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("billing@roofco.com"),
      party: { address: "billing@roofco.com", raw: "Billing <billing@roofco.com>" },
      index: index(),
      org: ORG,
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "role-account" });
  });

  it("REFUSES a plus-tagged role account too", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("billing+jul@roofco.com"),
      party: { address: "billing+jul@roofco.com" },
      index: index(),
      org: ORG,
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "role-account" });
  });

  it("REFUSES a generic domain even if an org somehow claims it", () => {
    const plan = planPersonFromEmail({
      plan: { kind: "org", orgId: "roofco", address: "dana@gmail.com", domain: "gmail.com" },
      party: { address: "dana@gmail.com", raw: "Dana <dana@gmail.com>" },
      index: index(),
      org: ORG,
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "generic-domain" });
  });

  it("REFUSES when the anchored org row was not supplied", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("dana@roofco.com"),
      party: { address: "dana@roofco.com" },
      index: index(),
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "unknown-org" });
  });

  it("REFUSES when the supplied org is not the one the ladder anchored", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("dana@roofco.com"),
      party: { address: "dana@roofco.com" },
      index: index(),
      org: { id: "someone-else", verticalId: "roofing" },
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "unknown-org" });
  });

  it("creates NOTHING for rung 6 or a refusal — a person follows a company, never leads", () => {
    for (const plan of [
      { kind: "propose-org", address: "dana@newco.com", domain: "newco.com" } as GraphPlan,
      {
        kind: "none",
        reason: "inbound-unknown-domain",
        address: "dana@newco.com",
        domain: "newco.com",
      } as GraphPlan,
    ]) {
      expect(
        planPersonFromEmail({
          plan,
          party: { address: "dana@newco.com" },
          index: index(),
          capturedAtISO: "2026-07-27",
        })
      ).toMatchObject({ kind: "skip", reason: "no-anchor" });
    }
  });

  it("never collides an id with a row that already exists", () => {
    const plan = planPersonFromEmail({
      plan: orgPlan("dana@roofco.com"),
      party: { address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" },
      index: index(),
      org: ORG,
      takenIds: ["dana-reyes"],
      capturedAtISO: "2026-07-27",
    });
    expect(plan.kind === "create" && plan.person.id).toBe("dana-reyes-2");
  });
});

describe("planPersonFromEmail — merge (rungs 1/2), COALESCE semantics", () => {
  it("fills only the blanks and never overwrites what Rob typed", () => {
    const existing = person({
      name: "Dana R.",
      phone: "555-0100",
      quotedAmount: 12000,
      signed: true,
      keyDates: { met: "2026-05-01", signed: "2026-06-01" },
      email: "dana.reyes@roofco.com",
    });
    const plan = planPersonFromEmail({
      plan: { kind: "person", personId: "dana-reyes", address: "dana@roofco.com", domain: "roofco.com" },
      party: { address: "dana@roofco.com", raw: "DANA THE ROOFER <dana@roofco.com>" },
      index: index(),
      org: ORG,
      existing,
      capturedAtISO: "2026-07-27",
      emailDateISO: "2026-07-26T09:00:00Z",
    });
    expect(plan.kind).toBe("merge");
    if (plan.kind !== "merge") return;
    // orgId and business were blank → filled. email, name, phone, met, and
    // every money field were not → absent from `fills` entirely.
    expect(plan.fills).toEqual({ orgId: "roofco", business: "RoofCo" });
  });

  it("fills a blank email and a blank met date", () => {
    const plan = planPersonFromEmail({
      plan: { kind: "person", personId: "dana-reyes", address: "dana@roofco.com", domain: "roofco.com" },
      party: { address: "dana@roofco.com" },
      index: index(),
      org: ORG,
      existing: person({ orgId: "roofco", business: "RoofCo" }),
      capturedAtISO: "2026-07-27",
      emailDateISO: "2026-07-20T09:00:00Z",
    });
    expect(plan.kind === "merge" && plan.fills).toEqual({
      email: "dana@roofco.com",
      met: "2026-07-20",
    });
  });

  it("skips when the email knows nothing the row does not", () => {
    const plan = planPersonFromEmail({
      plan: { kind: "person", personId: "dana-reyes", address: "dana@roofco.com", domain: "roofco.com" },
      party: { address: "dana@roofco.com" },
      index: index(),
      org: ORG,
      existing: person({
        email: "dana@roofco.com",
        orgId: "roofco",
        business: "RoofCo",
        keyDates: { met: "2020-01-01" },
      }),
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "nothing-to-merge" });
  });

  it("refuses to merge into a row it was not given", () => {
    const plan = planPersonFromEmail({
      plan: { kind: "person", personId: "ghost", address: "dana@roofco.com", domain: "roofco.com" },
      party: { address: "dana@roofco.com" },
      index: index(),
      capturedAtISO: "2026-07-27",
    });
    expect(plan).toMatchObject({ kind: "skip", reason: "nothing-to-merge" });
  });
});

describe("earliestMet — LEAST, one direction only", () => {
  it("moves met BACK when the email proves earlier contact", () => {
    expect(earliestMet("2026-05-01", "2026-03-02")).toBe("2026-03-02");
  });

  it("never moves met FORWARD — a reply says nothing about when we met", () => {
    expect(earliestMet("2026-05-01", "2026-07-26")).toBeUndefined();
    expect(earliestMet("2026-05-01", "2026-05-01")).toBeUndefined();
  });

  it("treats a blank or malformed date as absent, not as the earliest", () => {
    expect(earliestMet(undefined, "2026-07-26")).toBe("2026-07-26");
    expect(earliestMet("sometime in May", "2026-07-26")).toBe("2026-07-26");
  });
});

describe("usableMet — a header Date is not evidence on its own", () => {
  it("uses the email's own date when it is sane", () => {
    expect(usableMet("2026-07-26T14:02:00Z", "2026-07-27")).toBe("2026-07-26");
  });

  it("ignores an epoch/pre-2000 stamp rather than back-dating met to 1970", () => {
    expect(usableMet("1970-01-01T00:00:00Z", "2026-07-27")).toBe("2026-07-27");
  });

  it("ignores a future stamp", () => {
    expect(usableMet("2099-01-01T00:00:00Z", "2026-07-27")).toBe("2026-07-27");
  });

  it("falls back to capture time when there is no parseable date", () => {
    expect(usableMet(undefined, "2026-07-27")).toBe("2026-07-27");
    expect(usableMet("Mon, 27 Jul 2026 09:00:00 -0500", "2026-07-27")).toBe("2026-07-27");
  });
});

describe("displayNameFrom — never invented", () => {
  it("takes the header display name", () => {
    expect(displayNameFrom({ address: "dana@roofco.com", raw: "Dana Reyes <dana@roofco.com>" })).toBe(
      "Dana Reyes"
    );
  });

  it("strips surrounding quotes", () => {
    expect(displayNameFrom({ address: "dana@roofco.com", raw: '"Reyes, Dana" <dana@roofco.com>' })).toBe(
      "Reyes, Dana"
    );
  });

  it("falls back to the ADDRESS, never a prettified local part", () => {
    expect(displayNameFrom({ address: "j.smith22@roofco.com", raw: "<j.smith22@roofco.com>" })).toBe(
      "j.smith22@roofco.com"
    );
    expect(displayNameFrom({ address: "j.smith22@roofco.com" })).toBe("j.smith22@roofco.com");
  });

  it("does not accept the address repeated as a name", () => {
    expect(
      displayNameFrom({ address: "dana@roofco.com", raw: "dana@roofco.com <dana@roofco.com>" })
    ).toBe("dana@roofco.com");
  });
});

describe("personIdFor", () => {
  it("slugs the name, falls back to the local part, then to 'person'", () => {
    expect(personIdFor("Dana Reyes", "dana@roofco.com", new Set())).toBe("dana-reyes");
    expect(personIdFor("!!!", "dana.reyes@roofco.com", new Set())).toBe("dana-reyes");
    expect(personIdFor("", "", new Set())).toBe("person");
  });
});
