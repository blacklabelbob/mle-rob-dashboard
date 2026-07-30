import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RepStageGuidance from "@/components/RepStageGuidance";
import { guidanceViewFor, STAGE_GUIDANCE, type GuidanceKind } from "@/lib/rep/stageGuidance";
import type { DealStage } from "@/lib/types";

// Q46 R9 inc.2 — the render half of the guidance line.
//
// The module's own suite already grades the WORDS (length cap, kind, no
// newlines). What only a render can prove is the claim this increment was
// picked to make: THE THREE KINDS LOOK LIKE THREE DIFFERENT THINGS. A rep
// scanning an account reads colour before prose, so `advance`, `waiting` and
// `closed` rendering the same markup would be the defect even with three
// perfectly-written sentences behind it.

const KIND_SAMPLE: Record<GuidanceKind, DealStage> = {
  advance: "new_lead",
  waiting: "quote_sent",
  closed: "lost",
};

function markupFor(stage: DealStage) {
  return renderToStaticMarkup(<RepStageGuidance view={guidanceViewFor(stage)} />);
}

describe("RepStageGuidance", () => {
  it("renders the module's line verbatim — the surface never rewords guidance", () => {
    for (const stage of Object.keys(STAGE_GUIDANCE) as DealStage[]) {
      const html = markupFor(stage);
      // Escaped by React; compare on the words rather than the entities.
      const text = html.replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
      expect(text).toContain(STAGE_GUIDANCE[stage].line);
    }
  });

  it("gives each kind its own chip label AND its own colour", () => {
    const kinds = Object.keys(KIND_SAMPLE) as GuidanceKind[];
    const markups = kinds.map((k) => markupFor(KIND_SAMPLE[k]));

    // Distinct label text…
    expect(new Set(markups.map((m) => /uppercase[^>]*">([^<]+)</.exec(m)?.[1])).size).toBe(3);
    // …and distinct colour classes. Same label + same tint would be one thing
    // wearing three names.
    const tints = markups.map((m) => (m.match(/(emerald|amber|slate|white)-[0-9/]+/g) ?? []).join("|"));
    expect(new Set(tints).size).toBe(3);
  });

  it("colours the rep's own move green and nobody else's", () => {
    expect(markupFor(KIND_SAMPLE.advance)).toContain("emerald");
    expect(markupFor(KIND_SAMPLE.waiting)).not.toContain("emerald");
    expect(markupFor(KIND_SAMPLE.closed)).not.toContain("emerald");
  });

  it("renders NOTHING when there is no deal — the stage chip above already says why", () => {
    expect(renderToStaticMarkup(<RepStageGuidance view={guidanceViewFor(undefined)} />)).toBe("");
  });

  it("would fail if a kind lost its distinct rendering (failure injection)", () => {
    // Proves the distinctness assertions above are not vacuous: two kinds
    // pointed at the SAME stage must collapse the sets they are asserted on.
    const same = [markupFor("quote_sent"), markupFor("quote_sent")];
    expect(new Set(same).size).toBe(1);
    expect(new Set([markupFor("new_lead"), markupFor("quote_sent")]).size).toBe(2);
  });
});
