import { describe, expect, it } from "vitest";
import { dataDisclosure, type ServingMode } from "@/lib/ui/dataDisclosure";

// Q71 Phase 2 — the banner's whole job is to never let one kind of data pass
// for another, so the test is written as the full truth table rather than the
// two cases that happen to be reachable today.

const ALL: Array<[ServingMode, boolean]> = [
  [null, false],
  [null, true],
  ["configured", false],
  ["configured", true],
  ["fallback", false],
  ["fallback", true],
];

describe("dataDisclosure", () => {
  it("says nothing only when the live store is serving", () => {
    // The one silent state, and it stays silent even if a synthetic flag
    // somehow rode along — mode null means Supabase answered, and a demo
    // banner over live rows would be its own lie.
    expect(dataDisclosure(null, false)).toBeNull();
    expect(dataDisclosure(null, true)).toBeNull();
  });

  it("announces demo mode when the file store serves generated rows", () => {
    const d = dataDisclosure("configured", true);
    expect(d?.tone).toBe("demo");
    expect(d?.label).toBe("Demo mode");
    expect(d?.message).toMatch(/no real people/i);
  });

  it("keeps the old snapshot warning when the file store serves real rows", () => {
    const d = dataDisclosure("configured", false);
    expect(d?.tone).toBe("warn");
    expect(d?.message).toMatch(/not live Supabase/i);
    // Must NOT claim demo — real snapshot rows are exactly what they look like.
    expect(d?.message).not.toMatch(/sample|generated|demo/i);
  });

  it("escalates when Supabase is down AND the fallback is generated", () => {
    // The pair that only exists because inc.6 swapped the fallback file:
    // prod losing Supabase now renders invented numbers on the money panels.
    const d = dataDisclosure("fallback", true);
    expect(d?.tone).toBe("alarm");
    expect(d?.label).toMatch(/NOT YOUR RECORDS/);
    expect(d?.message).toMatch(/invented/i);
    expect(d?.message).toMatch(/do not read or act/i);
  });

  it("keeps the plain outage warning when the fallback is a real snapshot", () => {
    const d = dataDisclosure("fallback", false);
    expect(d?.tone).toBe("warn");
    expect(d?.message).toMatch(/Edits are paused/i);
  });

  it("gives every non-silent state a tone, a label and an actionable sentence", () => {
    for (const [mode, synthetic] of ALL) {
      const d = dataDisclosure(mode, synthetic);
      if (mode === null) {
        expect(d).toBeNull();
        continue;
      }
      expect(d).not.toBeNull();
      expect(["demo", "warn", "alarm"]).toContain(d!.tone);
      expect(d!.label.length).toBeGreaterThan(0);
      expect(d!.message.length).toBeGreaterThan(20);
    }
  });

  it("never describes synthetic rows without saying so, in either mode", () => {
    // The property that actually matters, asserted over the flag rather than
    // over the two hand-written synthetic cases above: if the rows are
    // generated, the banner has to use a word that says they are made up.
    for (const mode of ["configured", "fallback"] as const) {
      const d = dataDisclosure(mode, true);
      expect(d!.label + " " + d!.message).toMatch(/generated|sample|demo|invented/i);
    }
  });
});
