import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { familyEscapes, familyMemberDefect, familyShapeLines } from "../familyShape";
import { DEPARTURE_FAMILY, LEDGER_FILERS, findSharedNamespaces, keysOverlap } from "../keyNamespace";
import { departureKey } from "../../integrity/wrapperClock";

const CENSUS_PATH = join(process.cwd(), "docs/integrity/wrapper-census.json");

function censusNames(): string[] {
  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
  return [
    ...census.wrappers.map((w: { name: string }) => w.name),
    ...(census.openDepartures ?? []).map((d: { name: string }) => d.name),
  ];
}

describe("familyMemberDefect", () => {
  it("accepts the keys the filer actually mints today", () => {
    expect(familyMemberDefect(departureKey("daily-driver.sh"), DEPARTURE_FAMILY)).toBeNull();
    expect(familyMemberDefect(departureKey("judge-cover.py"), DEPARTURE_FAMILY)).toBeNull();
  });

  it("catches a name that invents a namespace no filer declares", () => {
    const key = departureKey("scripts/seed-local-crm.mjs");
    expect(familyMemberDefect(key, DEPARTURE_FAMILY)).toContain("wrapper-census-departure:scripts");
    // The consequence, not just the spelling: that key is inside a namespace the registry's own
    // shape report has never heard of, so the report describes a key set prod is not using.
    const declared = findSharedNamespaces(LEDGER_FILERS).map((s) => s.namespace);
    expect(declared).not.toContain("wrapper-census-departure:scripts");
  });

  it("catches a name that turns a literal key into a pattern", () => {
    const key = departureKey("weird*");
    expect(familyMemberDefect(key, DEPARTURE_FAMILY)).toContain('ends in "*"');
    // Proof of the harm rather than a restatement of the rule: two distinct rows, and every
    // reader here says one swallows the other — which is how a phantom collision gets reported.
    expect(keysOverlap(key, departureKey("weirdly.sh"))).toBe(true);
  });

  it("catches a name the ledger read can never ask about again (inc.168, reused not re-listed)", () => {
    expect(familyMemberDefect(departureKey("run,thing.sh"), DEPARTURE_FAMILY)).toContain(
      "does not survive",
    );
  });

  it("catches a key that is not in the family at all", () => {
    expect(familyMemberDefect("unapplied-migrations", DEPARTURE_FAMILY)).toContain(
      "not in this family at all",
    );
  });
});

describe("familyEscapes against the committed census", () => {
  // The measurement inc.187 was asked to take, pinned so it stays an answer instead of a memory.
  it("every name in the census mints a key inside the family it advertises", () => {
    const names = censusNames();
    expect(names.length).toBeGreaterThan(0);
    expect(familyEscapes(departureKey, names, DEPARTURE_FAMILY)).toEqual([]);
  });

  it("reports the escape, with the name a reader has to go fix, when one appears", () => {
    const escapes = familyEscapes(departureKey, ["ok.sh", "a/b.sh"], DEPARTURE_FAMILY);
    expect(escapes).toHaveLength(1);
    expect(escapes[0].name).toBe("a/b.sh");
    expect(escapes[0].key).toBe("wrapper-census-departure:a/b.sh");
    expect(familyShapeLines(escapes)[0]).toContain("KEY LEAVES ITS FAMILY");
  });

  it("says nothing when there is nothing to say", () => {
    expect(familyShapeLines([])).toEqual([]);
  });
});
