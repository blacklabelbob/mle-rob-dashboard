import { describe, expect, it } from "vitest";
import {
  addressFromDetail,
  createOutcomeMessage,
  proposalDomain,
  suggestedNameFromDetail,
} from "@/lib/comms/proposalFlag";
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

// Q69 inc.16 — the outcome the route reports and the button used to erase.
//
// The create route writes twice: the org row (guaranteed by the 2xx) and then
// the ledger flag's resolve, which it lets fail on purpose. Before this, the
// component rendered one green "Created X ✓" for every outcome — so the failure
// the route took care to describe was invisible, and the next click on the
// still-open flag answered 409 `domain-already-known`, which reads as a broken
// button on the exact domain that just worked.
describe("createOutcomeMessage", () => {
  it("says done, with the name and the tick, only when the flag actually closed", () => {
    const out = createOutcomeMessage("The Title Base", true);
    expect(out.resolved).toBe(true);
    expect(out.text).toBe("Created The Title Base ✓");
  });

  it("still says CREATED when the resolve failed — the company does exist", () => {
    // The org write is what the 2xx is about. Reporting the create as failed
    // because the second write failed would send Rob to create it again, and
    // inc.9's unique index would refuse him.
    const out = createOutcomeMessage("The Title Base", false);
    expect(out.text.startsWith("Created The Title Base")).toBe(true);
    expect(out.resolved).toBe(false);
    expect(out.text).toContain("stays open");
  });

  it("treats a missing flagResolved as unknown, never as resolved", () => {
    // Reached when the response body fails to parse or the shape drifts. A
    // glance at the ledger costs a second; a flag believed handled outlives
    // the session.
    const out = createOutcomeMessage("The Title Base", undefined);
    expect(out.resolved).toBe(false);
    expect(out.text).toContain("check the ledger");
  });

  it("never renders a name it wasn't given", () => {
    for (const name of [undefined, "", "   "]) {
      const out = createOutcomeMessage(name, true);
      expect(out.text).toBe("Created ✓");
      expect(out.text).not.toContain("undefined");
    }
  });

  it("trims the name the route echoes back rather than printing its padding", () => {
    expect(createOutcomeMessage("  Gulf Coast Roofing  ", true).text).toBe(
      "Created Gulf Coast Roofing ✓"
    );
  });

  it("only the resolved outcome carries the tick — the unresolved ones must not", () => {
    // The colour is chosen off `resolved`, but the text is what gets read back
    // in a screenshot. A ✓ on an unclosed item is the same false 'handled'.
    expect(createOutcomeMessage("Acme", false).text).not.toContain("✓");
    expect(createOutcomeMessage("Acme", undefined).text).not.toContain("✓");
  });

  it("distinguishes 'we know it failed' from 'we don't know' — different sentences", () => {
    // Folding undefined into false would tell Rob the resolve failed when the
    // truth is we never heard. Both keep him on the ledger; only one is honest
    // about why.
    const failed = createOutcomeMessage("Acme", false).text;
    const unknown = createOutcomeMessage("Acme", undefined).text;
    expect(failed).not.toBe(unknown);
  });
});
