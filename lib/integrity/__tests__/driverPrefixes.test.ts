import { describe, it, expect } from "vitest";
import {
  composeDriverPrompt,
  precedenceLine,
  GATE_ORDER,
  PRECEDENCE_MARKER,
} from "../driverPrefixes";

const BASE = "PRIORITY 1 — Rob dev-chat: ...";

describe("composeDriverPrompt", () => {
  it("returns the base prompt byte-identical when no gate fired", () => {
    expect(composeDriverPrompt({}, BASE)).toBe(BASE);
  });

  it("treats empty and whitespace-only gates as not fired", () => {
    expect(composeDriverPrompt({ orphaned: "", unfolded: "   ", clockGate: null }, BASE)).toBe(BASE);
  });

  it("adds no precedence line for a single gate — there is nothing to resolve", () => {
    const out = composeDriverPrompt({ clockGate: "CLOCK GATE: rogue stamp." }, BASE);
    expect(out).not.toContain(PRECEDENCE_MARKER);
    expect(out).toBe(`CLOCK GATE: rogue stamp. ${BASE}`);
  });

  it("orders gates by the ladder, not by the order they were handed in", () => {
    const out = composeDriverPrompt(
      { clockGate: "CG.", watchdog: "WD.", unfolded: "UD.", orphaned: "OW." },
      BASE,
    );
    const body = out.slice(out.indexOf("OW."));
    expect(body).toBe(`OW. UD. WD. CG. ${BASE}`);
  });

  it("puts Rob's unfolded dump ahead of the machine's own clock gate", () => {
    const out = composeDriverPrompt({ clockGate: "CG.", unfolded: "UD." }, BASE);
    expect(out.indexOf("UD.")).toBeLessThan(out.indexOf("CG."));
  });

  it("keeps the standing prompt last, and the gate texts verbatim", () => {
    const gate = "ORPHANED WORK IN THE TREE — read it BEFORE picking a queue item.";
    const out = composeDriverPrompt({ orphaned: gate }, BASE);
    expect(out).toContain(gate);
    expect(out.endsWith(BASE)).toBe(true);
  });
});

describe("precedenceLine", () => {
  it("is silent for zero and one gate", () => {
    expect(precedenceLine({})).toBe("");
    expect(precedenceLine({ watchdog: "WD." })).toBe("");
  });

  it("names every fired gate, numbered in ladder order, with its reason", () => {
    const line = precedenceLine({ clockGate: "CG.", orphaned: "OW.", watchdog: "WD." });
    expect(line.startsWith(PRECEDENCE_MARKER)).toBe(true);
    expect(line).toContain("3 gates fired");
    expect(line).toContain("1) ORPHANED WORK");
    expect(line).toContain("2) WATCHDOG");
    expect(line).toContain("3) CLOCK GATE");
    expect(line).not.toContain("UNFOLDED");
  });

  it("says out loud that the ladder beats the wording inside the gates", () => {
    const line = precedenceLine({ orphaned: "OW.", unfolded: "UD." });
    expect(line).toContain("wins over the wording inside them");
  });
});

describe("GATE_ORDER", () => {
  it("is the ladder inc.145 decided, in that order", () => {
    expect(GATE_ORDER.map((g) => g.key)).toEqual(["orphaned", "unfolded", "watchdog", "clockGate"]);
  });

  it("gives every gate a reason, so the ladder cannot be reordered without restating why", () => {
    for (const gate of GATE_ORDER) {
      expect(gate.why.length).toBeGreaterThan(20);
      expect(gate.label.length).toBeGreaterThan(0);
    }
  });
});
