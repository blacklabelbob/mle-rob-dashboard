import { describe, expect, it } from "vitest";

import {
  BLOCK_TITLES,
  buildMeetingIntel,
  INTEL_BLOCK_KINDS,
  isVerbatim,
  sourceLabel,
  type IntelCandidate,
} from "../meetingIntel";

const OMEGA = "meeting-2026-07-28";

function candidate(over: Partial<IntelCandidate> & Pick<IntelCandidate, "kind">): IntelCandidate {
  return {
    text: "Send Scott the Phase 1 scope",
    provenance: { meetingId: OMEGA, sourceRef: "block-412" },
    ...over,
  };
}

function block(intel: ReturnType<typeof buildMeetingIntel>, kind: (typeof INTEL_BLOCK_KINDS)[number]) {
  return intel.blocks.find((b) => b.kind === kind)!;
}

describe("buildMeetingIntel — the four blocks", () => {
  it("always renders all four blocks in the order Rob named them", () => {
    const intel = buildMeetingIntel([]);
    expect(intel.blocks.map((b) => b.kind)).toEqual([
      "action-items",
      "talking-points",
      "pain-points",
      "benefits-us",
    ]);
    expect(intel.blocks.map((b) => b.title)).toEqual(INTEL_BLOCK_KINDS.map((k) => BLOCK_TITLES[k]));
    expect(intel.isEmpty).toBe(true);
  });

  it("keeps an item that carries the meeting AND the line within it", () => {
    const intel = buildMeetingIntel([candidate({ kind: "action-items", owner: "Rob", status: "open" })]);
    const b = block(intel, "action-items");
    expect(b.items).toHaveLength(1);
    expect(b.items[0].provenance).toEqual({ meetingId: OMEGA, sourceRef: "block-412" });
    expect(b.items[0].owner).toBe("Rob");
    expect(b.isEmpty).toBe(false);
    expect(b.emptyReason).toBe("");
  });
});

describe("no provenance, no render", () => {
  it("rejects an item with no meeting", () => {
    const intel = buildMeetingIntel([candidate({ kind: "talking-points", provenance: {} })]);
    expect(block(intel, "talking-points").items).toHaveLength(0);
    expect(intel.rejected[0].reason).toBe("no-provenance");
  });

  it("rejects an item that names the meeting but no line inside it", () => {
    const intel = buildMeetingIntel([
      candidate({ kind: "talking-points", provenance: { meetingId: OMEGA } }),
    ]);
    expect(intel.rejected[0].reason).toBe("no-source-ref");
    // "Somewhere in the transcript" is exactly the class Q84 exists to stop.
    expect(intel.rejected[0].message).toContain("not traceability");
  });

  it("rejects an empty-text candidate rather than rendering a blank row", () => {
    const intel = buildMeetingIntel([candidate({ kind: "benefits-us", text: "   " })]);
    expect(intel.rejected[0].reason).toBe("empty-text");
  });
});

describe("pain points are verbatim or they are nothing", () => {
  const said =
    "Speaker 2: honestly the files just sit there for a week and a half before anyone touches them.";

  it("keeps a pain point that occurs in its own source excerpt", () => {
    const intel = buildMeetingIntel([
      candidate({
        kind: "pain-points",
        text: "the files just sit there for a week and a half before anyone touches them",
        provenance: { meetingId: OMEGA, sourceRef: "block-88", excerpt: said },
      }),
    ]);
    expect(block(intel, "pain-points").items).toHaveLength(1);
  });

  it("REJECTS the pain rewritten as a benefit — Rob's hard rule", () => {
    const intel = buildMeetingIntel([
      candidate({
        kind: "pain-points",
        text: "opportunity to streamline their file turnaround workflow",
        provenance: { meetingId: OMEGA, sourceRef: "block-88", excerpt: said },
      }),
    ]);
    const b = block(intel, "pain-points");
    expect(b.items).toHaveLength(0);
    expect(b.rejected[0].reason).toBe("paraphrased-pain");
    expect(b.rejected[0].message).toContain("our wording, not theirs");
  });

  it("rejects a pain point with no excerpt, because verbatim cannot be checked", () => {
    const intel = buildMeetingIntel([
      candidate({
        kind: "pain-points",
        text: "the files just sit there",
        provenance: { meetingId: OMEGA, sourceRef: "block-88" },
      }),
    ]);
    expect(intel.rejected[0].reason).toBe("no-excerpt-to-check");
  });

  it("treats whitespace, case and smart quotes as formatting, not as different words", () => {
    expect(isVerbatim("It’s   A MESS", 'Speaker 1: "it\'s a mess" is what he said')).toBe(true);
    expect(isVerbatim("it is a mess", "he said it's a mess")).toBe(false);
  });

  it("holds the other three blocks to provenance but NOT to verbatim", () => {
    // benefits-us is our commercial read on purpose — it is allowed to be our words.
    const intel = buildMeetingIntel([
      candidate({
        kind: "benefits-us",
        text: "Stiber's JV with Alex routes Gulf Coast files through Omega — land Omega and the JV volume follows.",
        provenance: { meetingId: OMEGA, sourceRef: "block-120", excerpt: "unrelated source text" },
      }),
    ]);
    expect(block(intel, "benefits-us").items).toHaveLength(1);
  });
});

describe("an empty block says WHY, and the two whys are different facts", () => {
  it("distinguishes nothing-captured from nothing-provable", () => {
    const intel = buildMeetingIntel([
      candidate({ kind: "talking-points", provenance: {} }),
      candidate({ kind: "talking-points", provenance: {} }),
    ]);
    expect(block(intel, "talking-points").emptyReason).toContain("2 candidates did not survive");
    expect(block(intel, "talking-points").emptyReason).toContain("no-provenance");
    // A block nobody offered anything for reads differently — and never as "none exist".
    expect(block(intel, "action-items").emptyReason).toContain("none were captured");
  });

  it("never drops a rejection silently — every one surfaces at the top level too", () => {
    const intel = buildMeetingIntel([
      candidate({ kind: "action-items", provenance: {} }),
      candidate({ kind: "pain-points", text: "our summary", provenance: { meetingId: OMEGA, sourceRef: "b1", excerpt: "their words" } }),
    ]);
    expect(intel.rejected).toHaveLength(2);
    expect(intel.rejected.map((r) => r.reason).sort()).toEqual(["no-provenance", "paraphrased-pain"]);
  });
});

describe("this module renders a ranking, it never invents one", () => {
  it("ships source order when no rank was supplied, and says so", () => {
    const intel = buildMeetingIntel([
      candidate({ kind: "action-items", text: "second in the transcript" }),
      candidate({ kind: "action-items", text: "third in the transcript" }),
    ]);
    const b = block(intel, "action-items");
    expect(b.ordering).toBe("source-order");
    expect(b.items.map((i) => i.text)).toEqual(["second in the transcript", "third in the transcript"]);
  });

  it("honours an external rank when EVERY item carries one", () => {
    const intel = buildMeetingIntel([
      candidate({ kind: "action-items", text: "low", rank: 9 }),
      candidate({ kind: "action-items", text: "high", rank: 1 }),
    ]);
    const b = block(intel, "action-items");
    expect(b.ordering).toBe("ranked");
    expect(b.items.map((i) => i.text)).toEqual(["high", "low"]);
  });

  it("stays in source order when the ranking is only partial", () => {
    // Half a ranking read as a ranking is worse than none — meeting-next-steps owns this,
    // and until it has ranked everything the honest answer is "unranked".
    const intel = buildMeetingIntel([
      candidate({ kind: "action-items", text: "unranked" }),
      candidate({ kind: "action-items", text: "ranked", rank: 1 }),
    ]);
    const b = block(intel, "action-items");
    expect(b.ordering).toBe("source-order");
    expect(b.items.map((i) => i.text)).toEqual(["unranked", "ranked"]);
  });
});

describe("sourceLabel", () => {
  it("names the line inside the meeting, not just the meeting", () => {
    // The rendered address has to be enough to go and check. A bare meeting id sends a
    // reader to a 114k-char transcript and calls that traceability.
    expect(sourceLabel({ meetingId: OMEGA, sourceRef: "block-412" })).toBe(
      "meeting-2026-07-28 · block-412",
    );
  });
});
