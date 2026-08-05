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

  it("returns null when nothing was stored — an absent excerpt never becomes a fabricated one", () => {
    const item = itemFrom({
      kind: "action-items",
      text: "Send the Phase 1 agreement",
      provenance: { meetingId: "A-MTG-2026-07-22-GULFCOAST", sourceRef: "line 12" },
    });
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
