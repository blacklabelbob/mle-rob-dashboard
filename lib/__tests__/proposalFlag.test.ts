import { describe, expect, it } from "vitest";
import { proposalDomain, suggestedNameFromDetail } from "@/lib/comms/proposalFlag";
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
