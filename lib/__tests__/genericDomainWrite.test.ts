import { describe, expect, it } from "vitest";
import { genericDomainSet } from "../comms/genericDomains";
import { planGenericDomainAdd, planGenericDomainRemove } from "../comms/genericDomainWrite";

// Q69 inc.25 — the write door's rules. The invariant carried over from inc.24:
// the table ADDS to the hardcoded floor and can never lower it. What is new
// here is the second invariant: the door never reports an outcome it did not
// produce, and never guesses a wrong row into shape.

const floor = genericDomainSet();

describe("planGenericDomainAdd", () => {
  it("accepts a new domain, normalized (case/whitespace is typing, not intent)", () => {
    expect(planGenericDomainAdd("  Constant-Contact.COM ", floor)).toEqual({
      kind: "add",
      domain: "constant-contact.com",
    });
  });

  it("refuses an address rather than narrowing it to its domain half", () => {
    const plan = planGenericDomainAdd("billing@roofco.com", floor);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") throw new Error("unreachable");
    expect(plan.reason).toBe("looks like an address, not a domain");
    // The whole point: roofco.com must NOT appear as the thing about to be blocked.
    expect(JSON.stringify(plan)).not.toContain('"roofco.com"');
    expect(plan.detail).toContain("too broad");
  });

  it.each([
    ["gmail", "no interior dot"],
    [".com", "not a bare host"],
    ["http://x.com", "not a bare host"],
    ["two words.com", "not a bare host"],
  ])("refuses %s — it would sit there looking blocked while matching nothing", (value, reason) => {
    const plan = planGenericDomainAdd(value, floor);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") throw new Error("unreachable");
    expect(plan.reason).toBe(reason);
  });

  it("refuses empty input with an instruction, not a stack trace", () => {
    for (const empty of ["", "   ", null, undefined, 7]) {
      const plan = planGenericDomainAdd(empty, floor);
      expect(plan.kind).toBe("refused");
      if (plan.kind !== "refused") throw new Error("unreachable");
      expect(plan.detail.length).toBeGreaterThan(10);
    }
  });

  it("says a built-in domain is already blocked instead of writing a redundant row", () => {
    const plan = planGenericDomainAdd("GMAIL.com", floor);
    expect(plan.kind).toBe("already-in-floor");
    if (plan.kind !== "already-in-floor") throw new Error("unreachable");
    expect(plan.detail).toContain("built-in");
  });
});

describe("planGenericDomainRemove", () => {
  it("removes a row-added domain", () => {
    expect(planGenericDomainRemove("constant-contact.com", floor)).toEqual({
      kind: "remove",
      domain: "constant-contact.com",
    });
  });

  it("REFUSES to remove a built-in domain — the floor cannot be lowered from the DB", () => {
    const plan = planGenericDomainRemove("gmail.com", floor);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") throw new Error("unreachable");
    expect(plan.reason).toBe("in-code-floor");
    // A success here would be a button that changes nothing: the read path
    // always unions GENERIC_EMAIL_DOMAINS back in.
    expect(plan.detail).toContain("would not unblock it");
  });

  it("refuses a malformed removal the same way as a malformed add", () => {
    const plan = planGenericDomainRemove("billing@roofco.com", floor);
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") throw new Error("unreachable");
    expect(plan.reason).toBe("looks like an address, not a domain");
  });
});
