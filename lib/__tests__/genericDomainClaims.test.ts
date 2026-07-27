import { describe, it, expect } from "vitest";
import {
  describeDomainClaim,
  unknownDomainClaim,
  orgHoldsDomain,
  claimLinks,
  type ClaimingOrg,
} from "@/lib/comms/genericDomainClaims";

// Q69 inc.27 — the read-only "is the company it already made still here?" check.
// The whole point of these tests is the three-state distinction: found /
// found-nothing / couldn't-look. Collapsing the third into the second is the
// bug this module exists to prevent.

const org = (over: Partial<ClaimingOrg> = {}): ClaimingOrg => ({
  id: "org-bigmailer",
  name: "BigMailer Inc",
  domain: "bigmailer.com",
  ...over,
});

describe("orgHoldsDomain", () => {
  it("matches case-insensitively, like migration 0022's lower(domain) index", () => {
    expect(orgHoldsDomain(org({ domain: "BigMailer.COM" }), "bigmailer.com")).toBe(true);
    expect(orgHoldsDomain(org({ domain: " bigmailer.com " }), "bigmailer.com")).toBe(true);
  });

  it("never matches on blank — 0022 excludes blank from the key on purpose", () => {
    expect(orgHoldsDomain(org({ domain: "" }), "")).toBe(false);
    expect(orgHoldsDomain(org({ domain: "   " }), "bigmailer.com")).toBe(false);
    expect(orgHoldsDomain(org({ domain: null }), "bigmailer.com")).toBe(false);
  });

  it("does not match a different domain", () => {
    expect(orgHoldsDomain(org({ domain: "roofco.com" }), "bigmailer.com")).toBe(false);
  });
});

describe("describeDomainClaim", () => {
  it("reports none when a successful read found nothing", () => {
    const c = describeDomainClaim("bigmailer.com", [], 0);
    expect(c.kind).toBe("none");
    expect(c.text).toBe("");
  });

  it("names the company, its contacts, and that the block is forward-only", () => {
    const c = describeDomainClaim("bigmailer.com", [org()], 12);
    expect(c.kind).toBe("claimed");
    expect(c.text).toContain("BigMailer Inc");
    expect(c.text).toContain("12 contacts");
    // The non-negotiable sentence: blocking does not undo the record.
    expect(c.text).toContain("does not remove or change");
    expect(c.text).toContain("stops NEW companies");
  });

  it("singularizes one contact and one record", () => {
    const c = describeDomainClaim("bigmailer.com", [org()], 1);
    expect(c.text).toContain("1 contact ");
    expect(c.text).toContain("that record");
    expect(c.text).not.toContain("1 contacts");
  });

  it("omits the contact count rather than guessing zero when uncounted", () => {
    const c = describeDomainClaim("bigmailer.com", [org()], null);
    expect(c.text).not.toContain("contact");
    expect(c.text).toContain("BigMailer Inc");
  });

  it("handles two rows holding the same domain (pre-0022 data) in the plural", () => {
    const c = describeDomainClaim("bigmailer.com", [org(), org({ id: "org-bm2", name: "BigMailer LLC" })], 3);
    expect(c.kind).toBe("claimed");
    expect(c.text).toContain("BigMailer Inc, BigMailer LLC");
    expect(c.text).toContain("those records");
  });

  it("ignores rows that do not actually hold the domain", () => {
    const c = describeDomainClaim("bigmailer.com", [org({ id: "org-roof", name: "RoofCo", domain: "roofco.com" })], 9);
    expect(c.kind).toBe("none");
  });
});

describe("unknownDomainClaim", () => {
  it("is never phrased as 'nothing holds it'", () => {
    const c = unknownDomainClaim("bigmailer.com", "read failed");
    expect(c.kind).toBe("unknown");
    expect(c.text).toContain("Couldn't check");
    expect(c.text).toContain("read failed");
    expect(c.text.toLowerCase()).not.toContain("no company holds");
  });

  it("still confirms the block itself applied", () => {
    expect(unknownDomainClaim("bigmailer.com").text).toContain("block still applies");
  });
});

describe("claimLinks", () => {
  it("links each claiming org to its company record", () => {
    const c = describeDomainClaim("bigmailer.com", [org()], 2);
    expect(claimLinks(c)).toEqual([
      { id: "org-bigmailer", name: "BigMailer Inc", href: "/companies/org-bigmailer" },
    ]);
  });

  it("has nothing to link for none/unknown", () => {
    expect(claimLinks(describeDomainClaim("bigmailer.com", [], 0))).toEqual([]);
    expect(claimLinks(unknownDomainClaim("bigmailer.com"))).toEqual([]);
  });
});
