import { describe, it, expect } from "vitest";
import {
  flagOutcome,
  heldDomainFlagPayload,
  heldDomainFlagTitle,
  heldFlagDomain,
} from "@/lib/comms/heldDomainFlag";
import type { AuditFinding } from "@/lib/comms/genericDomainAudit";

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    domain: "bigmailer.com",
    orgs: [{ id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" }],
    text: "Big Mailer LLC still holds bigmailer.com, which is on your blocklist.",
    ...over,
  };
}

describe("held-domain flag title", () => {
  it("round-trips the domain through the title contract", () => {
    expect(heldFlagDomain(heldDomainFlagTitle("bigmailer.com"))).toBe("bigmailer.com");
  });

  it("normalizes case so one domain cannot produce two ledger titles", () => {
    expect(heldDomainFlagTitle(" BigMailer.com ")).toBe(heldDomainFlagTitle("bigmailer.com"));
  });

  it("returns null for an ordinary ledger row", () => {
    expect(heldFlagDomain("New company domain: roofco.com")).toBeNull();
    expect(heldFlagDomain("Invoice missing")).toBeNull();
  });
});

describe("held-domain flag payload", () => {
  it("files a single-company finding ON that company's record", () => {
    const p = heldDomainFlagPayload(finding())!;
    expect(p.entityId).toBe("org-1");
    expect(p.entityName).toBe("Big Mailer LLC");
    expect(p.title).toBe(heldDomainFlagTitle("bigmailer.com"));
  });

  it("refuses to pick one of several companies — the subject is the domain", () => {
    const p = heldDomainFlagPayload(
      finding({
        orgs: [
          { id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" },
          { id: "org-2", name: "Mailer Holdings", href: "/companies/org-2" },
        ],
      })
    )!;
    // entity_id drives the record-page link and the person filter; attaching a
    // two-company finding to one of them is a quiet mis-filing.
    expect(p.entityId).toBeNull();
    expect(p.entityName).toBe("bigmailer.com");
    expect(p.detail).toContain("Big Mailer LLC");
    expect(p.detail).toContain("Mailer Holdings");
  });

  it("names every company and links to every record", () => {
    const p = heldDomainFlagPayload(
      finding({
        orgs: [
          { id: "org-1", name: "Big Mailer LLC", href: "/companies/org-1" },
          { id: "org-2", name: "Mailer Holdings", href: "/companies/org-2" },
        ],
      })
    )!;
    expect(p.detail).toContain("/companies/org-1");
    expect(p.detail).toContain("/companies/org-2");
  });

  it("says in words what flagging does NOT change — read-only, still blocked", () => {
    const p = heldDomainFlagPayload(finding())!;
    expect(p.detail).toMatch(/Nothing above was changed/);
    expect(p.detail).toMatch(/stays blocked/);
    // HARD LIMIT: nothing here instructs or implies a delete/merge/rename.
    expect(p.detail).not.toMatch(/delete|merge|rename|removed/i);
  });

  it("is medium severity — a review item, not an emergency", () => {
    expect(heldDomainFlagPayload(finding())!.severity).toBe("medium");
  });

  it("refuses a finding with no company rather than filing an unactionable row", () => {
    expect(heldDomainFlagPayload(finding({ orgs: [] }))).toBeNull();
  });

  it("refuses a finding with no domain", () => {
    expect(heldDomainFlagPayload(finding({ domain: "  " }))).toBeNull();
  });
});

describe("flag outcome", () => {
  it("reports success only on a 200 that actually said ok", () => {
    const o = flagOutcome(200, { ok: true });
    expect(o.flagged).toBe(true);
    expect(o.tone).toBe("ok");
    expect(o.text).toMatch(/Things to Address/);
  });

  it("does NOT claim a write on a 200 whose shape drifted", () => {
    const o = flagOutcome(200, { flags: [] });
    expect(o.flagged).toBe(false);
    expect(o.tone).toBe("error");
  });

  it("shows the server's own sentence on a refusal", () => {
    const o = flagOutcome(400, { error: "need entityName, title, detail" });
    expect(o.text).toBe("need entityName, title, detail");
    expect(o.flagged).toBe(false);
  });

  it("still says something actionable when the server explains nothing", () => {
    expect(flagOutcome(500, null).text).toMatch(/500/);
  });

  it("asks for a look, not a re-click, when the request never came back", () => {
    const o = flagOutcome(null, null);
    expect(o.flagged).toBe(false);
    expect(o.text).toMatch(/check Things to Address/);
  });
});
