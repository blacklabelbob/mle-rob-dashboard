// Q84 inc.67 — the two hosts on prod flag #133 are the fixtures. `cgroofing.net` and
// `gulfregroup.com` are what the recordings actually carried; `cgroofinggroup.com` and
// `gulfcoastregroup.com` are what the CRM actually stores. If this module ever stops
// proposing on those two, the ledger row silently reverts to "go search the CRM".

import { describe, expect, it } from "vitest";
import type { CrmOrg } from "../activityPlan";
import { hostLabel, hostWriteSlot, proposalText, proposeOrgForHost, writeSlotText } from "../hostProposal";

const CG: CrmOrg = { id: "C-0001", name: "CG Roofing Group", domain: "cgroofinggroup.com" };
const GULF: CrmOrg = { id: "C-0002", name: "Gulf Coast RE Group", website: "https://www.gulfcoastregroup.com/about" };
const OTHER: CrmOrg = { id: "C-0003", name: "PropLogix", domain: "proplogix.com" };
const ORGS = [CG, GULF, OTHER];

describe("hostLabel", () => {
  it("takes the label before the TLD, subdomains and all", () => {
    expect(hostLabel("cgroofinggroup.com")).toBe("cgroofinggroup");
    expect(hostLabel("https://mail.cgroofing.net/inbox")).toBe("cgroofing");
  });

  it("returns nothing for a value that is not a host", () => {
    expect(hostLabel("Gulf Coast RE Group")).toBe("");
    expect(hostLabel("")).toBe("");
  });
});

describe("proposeOrgForHost", () => {
  it("proposes the org whose name is the host with one word dropped — both live cases", () => {
    const cg = proposeOrgForHost("cgroofing.net", ORGS);
    expect(cg?.pick?.id).toBe("C-0001");
    expect(cg?.candidates[0].reason).toEqual({ rung: "name-drop-word", missingWord: "group" });

    const gulf = proposeOrgForHost("gulfregroup.com", ORGS);
    expect(gulf?.pick?.id).toBe("C-0002");
    expect(gulf?.candidates[0].reason).toEqual({ rung: "name-drop-word", missingWord: "coast" });
  });

  it("prefers an exact name match over a weaker rung, and lists only the best rung", () => {
    const twin: CrmOrg = { id: "C-0009", name: "CG Roofing", domain: "cgroofingllc.com" };
    const out = proposeOrgForHost("cgroofing.net", [CG, twin]);
    // "cgroofing" IS twin's whole name squashed — that beats CG Roofing Group's dropped word,
    // and the weaker candidate is dropped rather than listed underneath as a runner-up.
    expect(out?.pick?.id).toBe("C-0009");
    expect(out?.candidates).toHaveLength(1);
  });

  it("picks nothing when two orgs tie on the same rung", () => {
    const twin: CrmOrg = { id: "C-0010", name: "CG Roofing Co", domain: "cgroofingco.com" };
    const out = proposeOrgForHost("cgroofing.net", [CG, twin]);
    expect(out?.pick).toBeNull();
    expect(out?.candidates.map((c) => c.org.id).sort()).toEqual(["C-0001", "C-0010"]);
    expect(proposalText(out)).toContain("2 orgs look equally close");
    expect(proposalText(out)).toContain("say which one");
  });

  it("returns null when the CRM holds nothing close — silence, not a filler guess", () => {
    expect(proposeOrgForHost("omegatitle.com", ORGS)).toBeNull();
    expect(proposalText(null)).toBe("");
  });

  it("never proposes on a one- or two-word name by dropping a word", () => {
    // "PropLogix" minus its only word is nothing; "Red Rock" minus a word is a bare common
    // word that would match half the CRM. Both must stay silent.
    const red: CrmOrg = { id: "C-0011", name: "Red Rock", domain: "redrockroofing.com" };
    expect(proposeOrgForHost("rock.com", [OTHER, red])).toBeNull();
  });

  it("falls back to a shared host prefix, and says which stored host it is comparing to", () => {
    const noName: CrmOrg = { id: "C-0012", name: "Acme Holdings LLC", domain: "acmeroof.com" };
    const out = proposeOrgForHost("acmeroofing.io", [noName]);
    expect(out?.pick?.id).toBe("C-0012");
    expect(out?.candidates[0].reason).toEqual({ rung: "stored-prefix", storedLabel: "acmeroof" });
    expect(proposalText(out)).toContain("acmeroof");
  });

  it("never proposes an org that already stores the exact host — that side matched first", () => {
    // Reaching this module with a host an org owns would mean the two ladders disagree.
    expect(proposeOrgForHost("proplogix.com", [{ id: "C-0013", name: "Nothing Alike", domain: "proplogix.com" }]))
      .toBeNull();
  });

  it("states the reason as a comparison and always ends in a human's confirmation", () => {
    const text = proposalText(proposeOrgForHost("gulfregroup.com", ORGS));
    expect(text).toContain("Gulf Coast RE Group [C-0002]");
    expect(text).toContain("without the word “coast”");
    expect(text).toContain("Confirm it");
    expect(text).not.toMatch(/%|score|confiden/i);
  });
});

// Q84 inc.68 — the ask says "put it in the Domain field". An org has TWO host slots and no more,
// so that sentence is only true while `domain` is empty. On prod all 19 orgs read null today; this
// pins the check that keeps it true, and is the precondition a one-click confirm would need.
describe("hostWriteSlot", () => {
  it("calls the slot free when the org stores no second host — both live cases", () => {
    expect(hostWriteSlot("gulfregroup.com", GULF)).toEqual({ kind: "free" });
    expect(hostWriteSlot("acme.com", { id: "C-0020", name: "Acme", domain: "" })).toEqual({ kind: "free" });
  });

  it("calls it occupied when a DIFFERENT host is already in the domain field", () => {
    expect(hostWriteSlot("cgroofing.net", CG)).toEqual({ kind: "occupied", storedHost: "cgroofinggroup.com" });
  });

  it("reads the stored value through the same host parser, URL or bare", () => {
    const urlish: CrmOrg = { id: "C-0021", name: "Acme Roofing Co", domain: "https://WWW.Acme.com/x" };
    expect(hostWriteSlot("acmeroof.net", urlish)).toEqual({ kind: "occupied", storedHost: "acme.com" });
    expect(hostWriteSlot("ACME.com", urlish)).toEqual({ kind: "already" });
    // A subdomain is a DIFFERENT host, not the same one — `extractHost` keeps it, and treating
    // `mail.acme.com` as already-stored would call a slot taken that is actually free.
    expect(hostWriteSlot("mail.acme.com", urlish)).toEqual({ kind: "occupied", storedHost: "acme.com" });
  });

  it("never tells a reader to fill a field that is taken", () => {
    expect(writeSlotText({ kind: "free" })).toContain("empty");
    const taken = writeSlotText(hostWriteSlot("cgroofing.net", CG));
    expect(taken).toContain("cgroofinggroup.com");
    expect(taken).toContain("two hosts at most");
    expect(taken).not.toMatch(/fill|replace|overwrite/i);
  });

  it("puts the slot on the ledger line beside the org it names", () => {
    // Free: the ask stays actionable and says so.
    expect(proposalText(proposeOrgForHost("gulfregroup.com", ORGS))).toContain("Domain field is empty");
    // Occupied: same pick, but the reader is told the field is spoken for rather than to fill it.
    const cgText = proposalText(proposeOrgForHost("cgroofing.net", ORGS));
    expect(cgText).toContain("CG Roofing Group [C-0001]");
    expect(cgText).toContain("already holds cgroofinggroup.com");
  });
});
