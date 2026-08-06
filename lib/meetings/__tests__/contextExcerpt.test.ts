import { describe, expect, it } from "vitest";
import { buildMeetingIntel, contextExcerpt, type IntelCandidate, type IntelItem } from "../meetingIntel";

// Q89 inc.16 — critic-rob punch #4. The claim on a company page has to be checkable.
// No in-CRM anchor exists to link to (see contextExcerpt's own comment), so the check is
// the source line rendered beside the claim. These cases pin the two ways that could go
// wrong: the evidence going missing, and the evidence being printed twice as if it were
// two separate sources.

function itemFrom(candidate: IntelCandidate): IntelItem {
  const intel = buildMeetingIntel([candidate]);
  const items = intel.blocks.flatMap((b) => b.items);
  expect(items).toHaveLength(1);
  return items[0];
}

describe("contextExcerpt", () => {
  it("returns the surrounding source line when it says more than the claim", () => {
    const item = itemFrom({
      kind: "pain-points",
      text: "I can't send fucking Facebook messages anymore",
      provenance: {
        meetingId: "A-MTG-2026-07-22-GULFCOAST",
        sourceRef: "line 146",
        excerpt:
          "and now I can't send fucking Facebook messages anymore, so that whole channel is just dead for us",
      },
    });
    expect(contextExcerpt(item)).toContain("that whole channel is just dead");
  });

  it("suppresses the excerpt when it is the claim itself — one source must not read as two", () => {
    const said = "We have to replace that asset every time.";
    const item = itemFrom({
      kind: "pain-points",
      text: said,
      provenance: { meetingId: "A-MTG-2026-07-22-GULFCOAST", sourceRef: "line 659", excerpt: said },
    });
    expect(contextExcerpt(item)).toBeNull();
  });

  it("stays suppressed when the only difference is punctuation, spacing or case", () => {
    const item = itemFrom({
      kind: "pain-points",
      text: "we have to replace that asset every time",
      provenance: {
        meetingId: "A-MTG-2026-07-22-GULFCOAST",
        sourceRef: "line 659",
        excerpt: "  We  have to replace that asset every time!  ",
      },
    });
    expect(contextExcerpt(item)).toBeNull();
  });

  // Q89 inc.22 changed what this case MEANS, so it is split rather than deleted.
  //
  // It used to read "an action item with no excerpt survives the gate and prints no source
  // line". Since punch #9 the gate rejects that item outright, for every kind — so the old
  // assertion would now pass for a reason that has nothing to do with contextExcerpt, which
  // is a vacuous test wearing a green tick. The two real facts are asserted separately.
  it("an item with no excerpt no longer reaches the surface at all — the gate rejects every kind", () => {
    const intel = buildMeetingIntel([
      {
        kind: "action-items",
        text: "Send the Phase 1 agreement",
        provenance: { meetingId: "A-MTG-2026-07-22-GULFCOAST", sourceRef: "line 12" },
      },
    ]);
    expect(intel.blocks.flatMap((b) => b.items)).toHaveLength(0);
    expect(intel.rejected.map((r) => r.reason)).toEqual(["no-excerpt-to-check"]);
  });

  it("still returns null rather than fabricating one, if an excerpt-less item ever reaches it", () => {
    // Constructed directly, NOT through the gate — this pins contextExcerpt's own defensive
    // branch, which must keep holding even though the gate now makes it unreachable from here.
    const item: IntelItem = {
      kind: "action-items",
      text: "Send the Phase 1 agreement",
      provenance: { meetingId: "A-MTG-2026-07-22-GULFCOAST", sourceRef: "line 12" },
    };
    expect(contextExcerpt(item)).toBeNull();
  });

  it("carries the excerpt on non-pain blocks too — traceability is not a pain-point-only rule", () => {
    const item = itemFrom({
      kind: "benefits-us",
      text: "Multi-location rollout is the expansion path",
      provenance: {
        meetingId: "A-MTG-2026-07-22-GULFCOAST",
        sourceRef: "line 401",
        excerpt: "he mentioned four other offices that would want the same build",
      },
    });
    expect(contextExcerpt(item)).toBe("he mentioned four other offices that would want the same build");
  });
});
