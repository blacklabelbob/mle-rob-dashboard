import { describe, expect, it } from "vitest";
import {
  domainOf,
  isGenericDomain,
  isRoleAccount,
  localPartOf,
  planEmailGraph,
  type GraphIndex,
} from "@/lib/comms/emailGraph";
import { GENERIC_EMAIL_DOMAINS, genericDomainSet } from "@/lib/comms/genericDomains";

function index(over: Partial<GraphIndex> = {}): GraphIndex {
  return {
    personIdByEmail: new Map(),
    orgIdByDomain: new Map(),
    genericDomains: genericDomainSet(),
    contestedDomains: new Set(),
    ...over,
  };
}

describe("domain + local part parsing", () => {
  it("reads the domain from the LAST @, not the first", () => {
    // A quoted local part is legal. indexOf would call the domain `b"@roofco.com`,
    // which matches no org forever.
    expect(domainOf('"a@b"@roofco.com')).toBe("roofco.com");
    expect(domainOf("jane@roofco.com")).toBe("roofco.com");
  });

  it("returns empty for anything that is not an address", () => {
    expect(domainOf("jane")).toBe("");
    expect(domainOf("@roofco.com")).toBe("");
    expect(domainOf("jane@")).toBe("");
  });

  it("strips plus tags off the local part", () => {
    expect(localPartOf("billing+acct-2026@roofco.com")).toBe("billing");
    expect(localPartOf("Jane.Doe@Roofco.com")).toBe("jane.doe");
  });
});

describe("the noise filters", () => {
  it("matches generic domains exactly, never by suffix", () => {
    const generic = genericDomainSet();
    expect(isGenericDomain("gmail.com", generic)).toBe(true);
    // The whole point: a real company at notgmail.com is NOT consumer mail.
    expect(isGenericDomain("notgmail.com", generic)).toBe(false);
    expect(isGenericDomain("mygmail.com", generic)).toBe(false);
    expect(isGenericDomain("roofco.com", generic)).toBe(false);
  });

  it("blocks reserved TLDs on a label boundary only", () => {
    const generic = genericDomainSet();
    expect(isGenericDomain("box.local", generic)).toBe(true);
    expect(isGenericDomain("acme.test", generic)).toBe(true);
    expect(isGenericDomain("mytest.com", generic)).toBe(false);
    expect(isGenericDomain("protest.com", generic)).toBe(false);
  });

  it("matches role accounts on the whole local part, never a substring", () => {
    expect(isRoleAccount("info@roofco.com")).toBe(true);
    expect(isRoleAccount("no-reply@roofco.com")).toBe(true);
    expect(isRoleAccount("billing+2026@roofco.com")).toBe(true);
    // infosec@ is a human being.
    expect(isRoleAccount("infosec@roofco.com")).toBe(false);
    expect(isRoleAccount("salesman@roofco.com")).toBe(false);
  });

  it("keeps real correspondents off the blocklist", () => {
    // The list's stated intent: tools, consumer brands, bulk senders — never a
    // customer, supplier, title company or bank Rob actually deals with.
    for (const d of ["thetitlebase.com", "proplogix.com", "gaf.com", "chase.com"]) {
      expect(GENERIC_EMAIL_DOMAINS).not.toContain(d);
    }
  });
});

describe("the ladder", () => {
  it("rung 1 — a known person anchors to their record", () => {
    const plan = planEmailGraph(
      "Jane@Roofco.com",
      "inbound",
      index({ personIdByEmail: new Map([["jane@roofco.com", "p-1"]]) })
    );
    expect(plan).toEqual({
      kind: "person",
      personId: "p-1",
      address: "jane@roofco.com",
      domain: "roofco.com",
    });
  });

  it("rung 3 — a new human at a known company anchors the ORG", () => {
    // This is the gap today: matchContact requires an exact people.email hit, so
    // this message currently falls off the CRM entirely.
    const plan = planEmailGraph(
      "newguy@roofco.com",
      "inbound",
      index({ orgIdByDomain: new Map([["roofco.com", "org-1"]]) })
    );
    expect(plan).toEqual({
      kind: "org",
      orgId: "org-1",
      address: "newguy@roofco.com",
      domain: "roofco.com",
    });
  });

  it("rung 3 refuses a CONTESTED domain rather than picking a claimant", () => {
    // Two company rows both claim roofco.com. `orgIdByDomain` still holds the
    // first, but which row that is depends on store order — filing a rep's mail
    // on a coin-flip company is a lie the rep cannot see.
    const plan = planEmailGraph(
      "newguy@roofco.com",
      "inbound",
      index({
        orgIdByDomain: new Map([["roofco.com", "org-1"]]),
        contestedDomains: new Set(["roofco.com"]),
      })
    );
    expect(plan).toEqual({
      kind: "none",
      reason: "contested-domain",
      address: "newguy@roofco.com",
      domain: "roofco.com",
    });
  });

  it("a contested domain does NOT fall through to rung 6 and propose a third row", () => {
    // The failure this ordering prevents: refuse the org match, then let the
    // outbound branch treat the domain as unknown and queue a create for a
    // company we already hold twice.
    const plan = planEmailGraph(
      "newguy@roofco.com",
      "outbound",
      index({
        orgIdByDomain: new Map([["roofco.com", "org-1"]]),
        contestedDomains: new Set(["roofco.com"]),
      })
    );
    expect(plan.kind).toBe("none");
  });

  it("a KNOWN human still anchors even when their company's domain is contested", () => {
    // Rung 1 is an exact address hit — it needs no company at all, so a mess at
    // the org level must not drop mail off a person record that visibly exists.
    const plan = planEmailGraph(
      "jane@roofco.com",
      "inbound",
      index({
        personIdByEmail: new Map([["jane@roofco.com", "p-4"]]),
        orgIdByDomain: new Map([["roofco.com", "org-1"]]),
        contestedDomains: new Set(["roofco.com"]),
      })
    );
    expect(plan).toMatchObject({ kind: "person", personId: "p-4" });
  });

  it("a KNOWN person on a generic domain still anchors — the blocklist gates creation, not recognition", () => {
    // A one-man roofer mails from gmail. He is already a record. Letting rung 4
    // fire first would drop his mail off a record that visibly exists.
    const plan = planEmailGraph(
      "bob@gmail.com",
      "inbound",
      index({ personIdByEmail: new Map([["bob@gmail.com", "p-9"]]) })
    );
    expect(plan.kind).toBe("person");
  });

  it("a KNOWN org domain outranks a role local part", () => {
    const plan = planEmailGraph(
      "billing@roofco.com",
      "inbound",
      index({ orgIdByDomain: new Map([["roofco.com", "org-1"]]) })
    );
    expect(plan.kind).toBe("org");
  });

  it("rung 4 — an unknown generic domain associates nothing, in either direction", () => {
    for (const direction of ["inbound", "outbound"] as const) {
      const plan = planEmailGraph("stranger@gmail.com", direction, index());
      expect(plan).toMatchObject({ kind: "none", reason: "generic-domain" });
    }
  });

  it("rung 5 — a role account at an unknown real domain associates nothing", () => {
    // Sending to noreply@ must never create "Roofco" from a robot address.
    const plan = planEmailGraph("noreply@roofco.com", "outbound", index());
    expect(plan).toMatchObject({ kind: "none", reason: "role-account" });
  });

  it("rung 6 — SENDING to an unknown domain PROPOSES an org, and does not create one", () => {
    const plan = planEmailGraph("jane@newroofco.com", "outbound", index());
    expect(plan).toEqual({
      kind: "propose-org",
      address: "jane@newroofco.com",
      domain: "newroofco.com",
    });
    // Deliberately not `{kind:"org"}` — rung 6 feeds the needs-action queue until
    // the matcher is trusted. A proposal is reviewable; a created org is cleanup.
  });

  it("rung 7 — RECEIVING from an unknown domain creates nothing (the rule)", () => {
    const plan = planEmailGraph("jane@newroofco.com", "inbound", index());
    expect(plan).toMatchObject({ kind: "none", reason: "inbound-unknown-domain" });
  });

  it("rung 7 holds for the mail that would otherwise flood the CRM", () => {
    // Cold inbound, newsletters, vendor notifications: every one of these is a
    // company row an inbox-dump CRM would have created.
    for (const addr of [
      "recruiter@somestartup.io",
      "press@bigconference.org",
      "deals@supplierco.biz",
    ]) {
      expect(planEmailGraph(addr, "inbound", index())).toMatchObject({
        kind: "none",
        reason: "inbound-unknown-domain",
      });
    }
  });

  it("an unparseable address is refused by name, not treated as a domain", () => {
    const plan = planEmailGraph("  not-an-address ", "outbound", index());
    expect(plan).toMatchObject({ kind: "none", reason: "unparseable-address", domain: "" });
  });

  it("normalises case and whitespace once, at the door", () => {
    const plan = planEmailGraph("  JANE@RoofCo.COM  ", "outbound", index());
    expect(plan).toMatchObject({ address: "jane@roofco.com", domain: "roofco.com" });
  });
});
