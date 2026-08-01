import { describe, it, expect } from "vitest";
import { hostClaimConflict, hostClaimMessage } from "../hostClaim";
import type { CrmOrg } from "../activityPlan";

// Q84 inc.69 — the live shape, read off prod this run: 19 orgs, hosts almost entirely on
// `website`. EXACTLY ONE org carries a `domain`: C-2010 (The Title Base) stores
// `thetitlebase.com`, which is also its own website host — the `own-website` case below,
// live in the table today. (inc.68 recorded "all 19 read domain: null"; that census was
// wrong, and the fixture below is shaped so the correction stays visible in the tests.)
// C-2017 is CG Roofing Group (cgroofinggroup.com), C-2018 is Gulf Coast RE Group
// (gulfcoastregroup.com), and the two guest hosts the ledger proposes are cgroofing.net
// and gulfregroup.com.
const cg: CrmOrg = { id: "C-2017", name: "CG Roofing Group", website: "https://cgroofinggroup.com", domain: null };
const gulf: CrmOrg = { id: "C-2018", name: "Gulf Coast RE Group", website: "gulfcoastregroup.com", domain: null };
const omega: CrmOrg = { id: "C-2019", name: "Omega Title (FL)", website: null, domain: "omegatitlefl.com" };
// The live row, verbatim off prod: both slots spent on one host.
const titleBase: CrmOrg = {
  id: "C-2010",
  name: "The Title Base",
  website: "https://thetitlebase.com",
  domain: "thetitlebase.com",
};
const ORGS = [cg, gulf, omega, titleBase];

describe("hostClaimConflict", () => {
  it("clears the two hosts the ledger actually proposes", () => {
    expect(hostClaimConflict("cgroofing.net", cg, ORGS)).toEqual({ kind: "clear" });
    expect(hostClaimConflict("gulfregroup.com", gulf, ORGS)).toEqual({ kind: "clear" });
  });

  it("refuses the org's own website host — the slot would be spent on a match it already has", () => {
    expect(hostClaimConflict("https://cgroofinggroup.com", cg, ORGS)).toEqual({ kind: "own-website" });
  });

  it("refuses a host another org resolves by, and says which record and which field", () => {
    expect(hostClaimConflict("gulfcoastregroup.com", cg, ORGS)).toEqual({
      kind: "other-org",
      org: gulf,
      field: "website",
    });
    expect(hostClaimConflict("omegatitlefl.com", cg, ORGS)).toEqual({
      kind: "other-org",
      org: omega,
      field: "domain",
    });
  });

  it("skips the org itself by id, so a caller never has to pre-filter", () => {
    // cg is in ORGS; matching against its own stored website must read as own-website,
    // never as a collision with some other record.
    expect(hostClaimConflict("cgroofinggroup.com", cg, ORGS).kind).toBe("own-website");
  });

  it("reads the ONE live duplicate in the table today as own-website, not as a collision", () => {
    // C-2010 already stores its own website host in `domain`. It is not a break —
    // `indexOrgsByHost` de-dupes the bucket by org id, so the org still resolves — but the
    // slot is spent, and re-typing that host must read as own-website rather than as a
    // conflict with some other record.
    expect(hostClaimConflict("thetitlebase.com", titleBase, ORGS)).toEqual({ kind: "own-website" });
    // And no OTHER org may claim it, because C-2010 genuinely holds it.
    expect(hostClaimConflict("thetitlebase.com", cg, ORGS)).toEqual({
      kind: "other-org",
      org: titleBase,
      field: "website",
    });
  });

  it("treats a subdomain as a different host, exactly as inc.68's slot check does", () => {
    expect(hostClaimConflict("mail.cgroofinggroup.com", cg, ORGS)).toEqual({ kind: "clear" });
  });

  it("is not a format validator — a value naming no host is clear, not refused", () => {
    expect(hostClaimConflict("", cg, ORGS)).toEqual({ kind: "clear" });
    expect(hostClaimConflict("   ", cg, ORGS)).toEqual({ kind: "clear" });
  });
});

describe("hostClaimMessage", () => {
  it("says nothing when there is nothing to say", () => {
    expect(hostClaimMessage({ kind: "clear" }, "cgroofing.net")).toBe("");
  });

  it("names the other record and its id, so nobody has to go hunting for it", () => {
    const claim = hostClaimConflict("gulfcoastregroup.com", cg, ORGS);
    const said = hostClaimMessage(claim, "https://gulfcoastregroup.com/");
    expect(said).toContain("Gulf Coast RE Group");
    expect(said).toContain("[C-2018]");
    expect(said).toContain("Website");
    // The host is printed as the host, not as whatever was pasted.
    expect(said).toContain("gulfcoastregroup.com");
    expect(said).not.toContain("https://");
  });

  it("explains the own-website refusal in terms of the slot, not validity", () => {
    const said = hostClaimMessage({ kind: "own-website" }, "cgroofinggroup.com");
    expect(said).toContain("already this company's Website");
    expect(said).not.toMatch(/invalid|error/i);
  });
});
