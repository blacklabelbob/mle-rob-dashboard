import { describe, expect, it } from "vitest";
import { addressFromDetail, proposalDomain, suggestedNameFromDetail } from "@/lib/comms/proposalFlag";
import { proposalToFlag, proposalTitle } from "@/lib/comms/orgProposal";

describe("proposalDomain", () => {
  it("round-trips the title inc.3 writes — the two ends of the contract", () => {
    expect(proposalDomain(proposalTitle("the-title-base.com"))).toBe("the-title-base.com");
  });

  it("returns null for an ordinary finding so no create button appears on it", () => {
    expect(proposalDomain("PropLogix — business name mismatch")).toBeNull();
    // A near-miss must NOT parse: a flag Rob wrote by hand about a domain is
    // not a proposal, and offering "create company" on it invents a row.
    expect(proposalDomain("New company domains: a.com")).toBeNull();
  });

  it("treats a title with no domain as not-a-proposal, never as a blank domain", () => {
    expect(proposalDomain("New company domain: ")).toBeNull();
    expect(proposalDomain("New company domain:    ")).toBeNull();
  });
});

describe("suggestedNameFromDetail", () => {
  it("pulls the guess back out of the detail inc.3 wrote", () => {
    const flag = proposalToFlag({
      domain: "the-title-base.com",
      address: "trent@the-title-base.com",
      suggestedName: "The Title Base",
    });
    expect(suggestedNameFromDetail(flag.detail)).toBe("The Title Base");
  });

  it("returns empty when there is no suggestion — the reviewer types the name", () => {
    const flag = proposalToFlag({ domain: "x.com", address: "a@x.com", suggestedName: "" });
    expect(suggestedNameFromDetail(flag.detail)).toBe("");
    expect(suggestedNameFromDetail("some unrelated finding")).toBe("");
  });
});

describe("addressFromDetail", () => {
  const flag = proposalToFlag({
    domain: "the-title-base.com",
    address: "trent@the-title-base.com",
    suggestedName: "The Title Base",
  });

  it("round-trips the address inc.3 wrote — the provenance line's only source", () => {
    expect(addressFromDetail(flag.detail, "the-title-base.com")).toBe("trent@the-title-base.com");
  });

  it("survives a domain the reviewer's flag carries in a different case", () => {
    expect(addressFromDetail(flag.detail, "The-Title-Base.COM ")).toBe("trent@the-title-base.com");
  });

  it("REFUSES an address at another domain — a wrong provenance line is worse than none", () => {
    // A flag is prose on a shared, hand-editable table. Trusting this would
    // write "first outbound contact to someone@rival.com" onto this company's
    // record permanently.
    const tampered = flag.detail.replace("trent@the-title-base.com", "someone@rival.com");
    expect(addressFromDetail(tampered, "the-title-base.com")).toBe("");
  });

  it("reads the domain after the LAST @, so a quoted local part still verifies", () => {
    const odd = proposalToFlag({
      domain: "roofco.com",
      address: '"a@b"@roofco.com',
      suggestedName: "Roofco",
    });
    expect(addressFromDetail(odd.detail, "roofco.com")).toBe('"a@b"@roofco.com');
  });

  it("returns empty for a finding that carries no address, so the note omits the line", () => {
    expect(addressFromDetail("PropLogix — business name mismatch", "proplogix.com")).toBe("");
    expect(addressFromDetail("We sent mail to and roofco.com matches no company", "roofco.com")).toBe("");
  });

  it("returns empty for a malformed address rather than half of one", () => {
    const noAt = flag.detail.replace("trent@the-title-base.com", "the-title-base.com");
    expect(addressFromDetail(noAt, "the-title-base.com")).toBe("");
    const trailing = flag.detail.replace("trent@the-title-base.com", "trent@");
    expect(addressFromDetail(trailing, "the-title-base.com")).toBe("");
  });

  it("does not let a subdomain address claim the proposed domain", () => {
    // Exact membership, never endsWith — mail.roofco.com is not roofco.com,
    // and the ladder's domain match is exact, so these cannot legitimately differ.
    const sub = flag.detail.replace("trent@the-title-base.com", "trent@mail.the-title-base.com");
    expect(addressFromDetail(sub, "the-title-base.com")).toBe("");
  });
});
