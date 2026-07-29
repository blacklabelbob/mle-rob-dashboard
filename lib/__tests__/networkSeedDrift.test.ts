import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs generator, shared with the seed CLI and this guard
import { REGEN_COMMAND, SEED, buildNetwork, describeSeedDrift, serializeNetwork } from "../../scripts/seed-synthetic.mjs";

// Q71 Phase 2 item 3 — the drift guard.
//
// The committed data/network.json is generator output, and the failure this
// catches is someone editing it in place: a demo name tweaked by hand, a row
// pasted in, a merge resolved by picking one side. That edit passes every other
// test in the suite (the file is still valid, still synthetic, still populated)
// and silently breaks the one property Phase 2 bought — that the committed seed
// IS the generator's output, so nothing can enter it that the generator could
// not have produced. A hand-edited seed is exactly how a real phone number gets
// back into git after Phase 1 took them all out.

const COMMITTED_PATH = join(process.cwd(), "data", "network.json");
const committed = readFileSync(COMMITTED_PATH, "utf8");

describe("committed seed matches the generator (Phase 2 DoD)", () => {
  it("data/network.json is byte-identical to a fresh in-memory build", () => {
    // Not expect(committed).toBe(expected) on purpose: on failure that prints a
    // thousand-line diff of a 41-record file. describeSeedDrift returns the one
    // divergent line plus the fix command.
    expect(describeSeedDrift(committed)).toBeNull();
  });

  it("the on-disk file is what serializeNetwork produces, trailing newline included", () => {
    expect(committed).toBe(serializeNetwork(buildNetwork(SEED)));
    expect(committed.endsWith("}\n")).toBe(true);
  });
});

describe("the guard actually fires (failure injection)", () => {
  // A guard asserted only against a passing file proves it can say yes. These
  // hand it the three shapes of real drift and prove it says no.

  it("catches a one-character hand-edit and names the fix command", () => {
    const edited = committed.replace('"name"', '"nome"');
    expect(edited).not.toBe(committed); // the mutation landed — otherwise this test is vacuous
    const drift = describeSeedDrift(edited);
    expect(drift).not.toBeNull();
    expect(drift).toContain(REGEN_COMMAND);
    expect(drift).toContain("Do not hand-edit");
    expect(drift).toMatch(/first difference at line \d+/);
  });

  it("catches a pasted-in row, not just a substitution", () => {
    const withExtra = committed.replace('"people": [', '"people": [\n    { "id": "P-9999", "name": "Hand Added" },');
    const drift = describeSeedDrift(withExtra);
    expect(drift).not.toBeNull();
    expect(drift).toContain("P-9999");
  });

  it("catches a whitespace-only reformat — formatting is contract, not cosmetics", () => {
    const reflowed = `${JSON.stringify(JSON.parse(committed))}\n`; // same data, no indentation
    expect(JSON.parse(reflowed)).toEqual(JSON.parse(committed)); // semantically identical…
    expect(describeSeedDrift(reflowed)).not.toBeNull(); // …and still drift
  });

  it("reports the divergent line rather than a bare boolean", () => {
    const lines = committed.split("\n");
    const target = lines.findIndex((l) => l.includes('"phone"'));
    expect(target).toBeGreaterThan(-1);
    lines[target] = lines[target].replace(/555-01\d\d/, "555-0999");
    const drift = describeSeedDrift(lines.join("\n"));
    expect(drift).toContain(`first difference at line ${target + 1}`);
    expect(drift).toContain("555-0999"); // shows what is actually on disk
  });
});

describe("the guard is pinned to a seed, not to a snapshot", () => {
  it("a generator change (modelled as a seed change) is drift, and says so", () => {
    // Regenerating with a different seed is what "I changed the generator and
    // forgot to re-run it" looks like from the file's point of view.
    const drift = describeSeedDrift(serializeNetwork(buildNetwork("some-other-seed")));
    expect(drift).not.toBeNull();
    expect(drift).toContain(SEED); // the seed the committed file is supposed to match
  });

  it("passes when checked against the same seed it was generated with", () => {
    expect(describeSeedDrift(serializeNetwork(buildNetwork("some-other-seed")), "some-other-seed")).toBeNull();
  });
});
