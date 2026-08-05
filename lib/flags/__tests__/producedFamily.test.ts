import { describe, expect, it } from "vitest";
import { FAMILY_PROBES, deriveKeyFamily, familyPattern } from "../producedFamily";
import { DEPARTURE_FAMILY, keysOverlap } from "../keyNamespace";
import { departureKey } from "../../integrity/wrapperClock";

describe("deriveKeyFamily", () => {
  it("derives the family of a producer that appends its argument verbatim", () => {
    const derived = deriveKeyFamily((name) => `ns:${name}`);
    expect(derived).toEqual({ pattern: "ns:*", prefix: "ns:" });
  });

  it("refuses a producer that decorates AFTER the argument", () => {
    // The plausible edit this whole file exists for: probing with "" still returns a string, and
    // that string is a prefix of nothing real.
    const derived = deriveKeyFamily((name) => `ns:${name}:v2`);
    expect(derived).toEqual({
      refused: expect.stringContaining("does not append its argument verbatim"),
    });
    // And the refused prefix is exactly the confident-wrong pattern the old line would have shipped.
    expect(`${((name: string) => `ns:${name}:v2`)("")}*`).toBe("ns::v2*");
  });

  it("refuses a producer that transforms its argument", () => {
    expect(deriveKeyFamily((name) => `ns:${name.trim()}`)).toEqual({
      refused: expect.stringContaining("trailing "),
    });
    expect(deriveKeyFamily((name) => `ns:${name.toUpperCase()}`)).toEqual({
      refused: expect.stringContaining("does not append its argument verbatim"),
    });
    expect(deriveKeyFamily((name) => `ns:${name.slice(0, 8)}`)).toEqual({
      refused: expect.stringContaining("does not append its argument verbatim"),
    });
  });

  it("refuses a producer whose fixed part is empty rather than advertising the bare `*`", () => {
    // `*` overlaps every key on the ledger, so this refusal is what keeps the collision check from
    // reporting a false alarm against all of it.
    expect(deriveKeyFamily((name) => name)).toEqual({
      refused: expect.stringContaining('the bare "*"'),
    });
  });

  it("refuses a fixed part that already ends in `*`", () => {
    expect(deriveKeyFamily((name) => `ns:*${name}`)).toEqual({
      refused: expect.stringContaining('already ends in "*"'),
    });
  });

  it("probes with names that catch the transforms a producer is likely to apply", () => {
    // Pinned: a shrinking probe list is how this check quietly stops checking. Each one is here
    // for a named transform — slug, separator collision, regex escaping, trim, truncation.
    expect([...FAMILY_PROBES]).toEqual(["probe", "a:b", "a.*+?[]", "trailing ", "x".repeat(64)]);
  });
});

describe("familyPattern", () => {
  it("returns the pattern when the derivation holds", () => {
    expect(familyPattern((name) => `ns:${name}`, "test")).toBe("ns:*");
  });

  it("throws, naming the family, when it cannot be derived", () => {
    expect(() => familyPattern((name) => `ns:${name}:v2`, "wrapper-census departure")).toThrow(
      /LEDGER_FILERS cannot derive the wrapper-census departure key family/,
    );
  });
});

describe("the live departure family", () => {
  it("is the same string the registry has always advertised", () => {
    // The derivation is a proof obligation, not a rename: prod rows filed under this prefix stay
    // matched. If this ever changes, keys already on Rob's ledger are orphaned — inc.103's harm.
    expect(DEPARTURE_FAMILY).toBe("wrapper-census-departure:*");
  });

  it("covers a key the producer actually makes, by the same overlap rule the registry uses", () => {
    // Reuses keysOverlap rather than re-deriving prefix matching — one rule, checked end to end
    // from the producing function to the registry's comparison.
    expect(keysOverlap(departureKey("scripts/seed-local-crm.mjs"), DEPARTURE_FAMILY)).toBe(true);
    expect(keysOverlap(departureKey(""), DEPARTURE_FAMILY)).toBe(true);
  });
});
