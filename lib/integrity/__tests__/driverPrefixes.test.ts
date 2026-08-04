import { describe, it, expect } from "vitest";
import {
  composeDriverPrompt,
  precedenceLine,
  rankTag,
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
    const body = out.slice(out.indexOf(rankTag(1, 4, "ORPHANED WORK")));
    expect(body).toBe(
      `${rankTag(1, 4, "ORPHANED WORK")}OW. ${rankTag(2, 4, "UNFOLDED DUMP")}UD. ` +
        `${rankTag(3, 4, "WATCHDOG")}WD. ${rankTag(4, 4, "CLOCK GATE")}CG. ${BASE}`,
    );
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

// Q84 inc.146 — every gate text claims the front of the run in its own words. The claim is TRUE
// when it is the only gate, and overruled when it is not; the tag is how the reader is told which,
// at the sentence rather than in a header far above it.
describe("rank tags on the gate texts", () => {
  // The real sentences from crm-build-driver.sh, abbreviated only where they do not shout.
  const REAL_UNFOLDED =
    "UNFOLDED DUMP DETECTED: ... folding this dump into queue items with DoDs is THIS run's " +
    "TOP PRIORITY, before any other item. ";
  const REAL_ORPHANED = "ORPHANED WORK IN THE TREE — ... read it before ... Do this BEFORE " +
    "picking a queue item. ";

  it("tags nothing when a single gate fires — its absolute claim is the true one", () => {
    const out = composeDriverPrompt({ unfolded: REAL_UNFOLDED }, BASE);
    expect(out).not.toContain(" of 1 — ");
    expect(out).not.toContain("overruled");
    expect(out).toBe(`${REAL_UNFOLDED.trim()} ${BASE}`);
  });

  it("tags the loser's own 'TOP PRIORITY' with the rank that overrules it", () => {
    const out = composeDriverPrompt(
      { unfolded: REAL_UNFOLDED, orphaned: REAL_ORPHANED },
      BASE,
    );
    expect(out).toContain(`${rankTag(2, 2, "UNFOLDED DUMP")}${REAL_UNFOLDED.trim()}`);
    expect(out).toContain(`${rankTag(1, 2, "ORPHANED WORK")}${REAL_ORPHANED.trim()}`);
  });

  it("leaves the gate text itself byte-for-byte the wrapper's", () => {
    const out = composeDriverPrompt({ unfolded: REAL_UNFOLDED, clockGate: "CG." }, BASE);
    expect(out).toContain(REAL_UNFOLDED.trim());
  });

  it("tags rank 1 too — the winner is stated, not left to be inferred from silence", () => {
    const out = composeDriverPrompt({ orphaned: "OW.", clockGate: "CG." }, BASE);
    expect(out).toContain(rankTag(1, 2, "ORPHANED WORK"));
  });

  it("does not tell the winner its claim was overruled — that would be a false sentence", () => {
    const first = rankTag(1, 3, "ORPHANED WORK");
    expect(first).toContain(`its "first" stands`);
    expect(first).not.toContain("overruled");
    expect(rankTag(2, 3, "UNFOLDED DUMP")).toContain("overruled");
  });

  it("counts only the gates that actually fired, not the four on the ladder", () => {
    const out = composeDriverPrompt({ watchdog: "WD.", clockGate: "CG." }, BASE);
    expect(out).toContain(" of 2 — ");
    expect(out).not.toContain(" of 4 — ");
  });

  it("says which slot and that the sentence's own claim lost", () => {
    const tag = rankTag(3, 4, "WATCHDOG");
    expect(tag).toContain("3 of 4");
    expect(tag).toContain("WATCHDOG");
    expect(tag).toContain("overruled");
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
