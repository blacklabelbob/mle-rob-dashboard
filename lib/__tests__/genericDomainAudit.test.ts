import { describe, it, expect } from "vitest";
import {
  auditBlockedDomains,
  emptyBlocklistAudit,
  uncheckedBlocklistAudit,
} from "@/lib/comms/genericDomainAudit";
import type { ClaimingOrg } from "@/lib/comms/genericDomainClaims";

const org = (id: string, name: string, domain: string | null): ClaimingOrg => ({ id, name, domain });

describe("Q69 inc.28 — standing blocklist claim audit", () => {
  it("reports a company that still holds a blocked domain", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "BigMailer", "bigmailer.com")]);
    expect(a.kind).toBe("checked");
    expect(a.findings).toHaveLength(1);
    expect(a.findings[0].domain).toBe("bigmailer.com");
    expect(a.findings[0].orgs[0].href).toBe("/companies/o1");
    expect(a.text).toContain("1 of the 1 domain you blocked");
  });

  it("says plainly that the block did NOT change the record", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "BigMailer", "bigmailer.com")]);
    expect(a.findings[0].text).toContain("did not change that record");
    expect(a.findings[0].text).toContain("stops NEW companies");
  });

  it("matches case-insensitively, mirroring 0022's lower(domain) index", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "BigMailer", "BigMailer.COM")]);
    expect(a.findings).toHaveLength(1);
  });

  it("normalizes and de-duplicates the blocked list before counting", () => {
    const a = auditBlockedDomains([" BigMailer.com ", "bigmailer.com", ""], []);
    expect(a.kind === "checked" && a.checkedCount).toBe(1);
  });

  it("an unheld domain produces no finding and no text", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "Roof Co", "roofco.com")]);
    expect(a.findings).toHaveLength(0);
    expect(a.text).toBe("");
  });

  it("ignores orgs with no domain — a null never matches", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "No Domain Co", null), org("o2", "Blank", "  ")]);
    expect(a.findings).toHaveLength(0);
  });

  it("groups every org holding the same domain into one finding", () => {
    const a = auditBlockedDomains(
      ["bigmailer.com"],
      [org("o1", "BigMailer", "bigmailer.com"), org("o2", "Big Mailer Inc", "bigmailer.com")]
    );
    expect(a.findings).toHaveLength(1);
    expect(a.findings[0].orgs.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(a.findings[0].text).toContain("those records");
    expect(a.findings[0].text).toContain("hold bigmailer.com");
  });

  it("counts findings against domains checked, not orgs found", () => {
    const a = auditBlockedDomains(
      ["bigmailer.com", "blast.io", "quiet.dev"],
      [org("o1", "BigMailer", "bigmailer.com"), org("o2", "Big Mailer Inc", "bigmailer.com")]
    );
    expect(a.findings).toHaveLength(1);
    expect(a.text).toContain("1 of the 3 domains you blocked");
    expect(a.text).toContain("is still held");
  });

  it("reports each held domain separately", () => {
    const a = auditBlockedDomains(
      ["bigmailer.com", "blast.io"],
      [org("o1", "BigMailer", "bigmailer.com"), org("o2", "Blast", "blast.io")]
    );
    expect(a.findings.map((f) => f.domain)).toEqual(["bigmailer.com", "blast.io"]);
    expect(a.text).toContain("2 of the 2 domains");
    expect(a.text).toContain("are still held");
  });

  it("a failed read is UNCHECKED, never a clean checked result", () => {
    const a = uncheckedBlocklistAudit(3, "timeout");
    expect(a.kind).toBe("unchecked");
    expect(a.findings).toHaveLength(0);
    expect(a.text).toContain("Couldn't check");
    expect(a.text).toContain("timeout");
    // The distinction the whole module exists for: an unchecked sweep must not
    // be readable as "nothing holds them".
    expect(a.text).not.toContain("still held");
  });

  it("an unchecked sweep still says the blocks themselves are fine", () => {
    expect(uncheckedBlocklistAudit(1).text).toContain("blocks themselves are unaffected");
  });

  it("no added domains = checked and empty, with nothing to render", () => {
    const a = emptyBlocklistAudit();
    expect(a.kind).toBe("checked");
    expect(a.checkedCount).toBe(0);
    expect(a.text).toBe("");
  });

  it("is pure — same inputs, same output", () => {
    const orgs = [org("o1", "BigMailer", "bigmailer.com")];
    expect(auditBlockedDomains(["bigmailer.com"], orgs)).toEqual(
      auditBlockedDomains(["bigmailer.com"], orgs)
    );
  });

  it("never emits a mutating instruction — findings are links only", () => {
    const a = auditBlockedDomains(["bigmailer.com"], [org("o1", "BigMailer", "bigmailer.com")]);
    const blob = JSON.stringify(a).toLowerCase();
    for (const verb of ["delete", "merge", "rename", "remove the company"]) {
      expect(blob).not.toContain(verb);
    }
  });
});
