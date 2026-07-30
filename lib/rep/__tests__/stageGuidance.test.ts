// Q46 R9 inc.1 — the guidance line, graded before it renders.
//
// Two defects these pins exist to make impossible:
//  1. A line that tells a rep to chase something that is OURS to do (the
//     `signed` / `invoiced` / `delivering` stages must never read `advance`).
//  2. This file quietly growing into the playbook research told us not to build
//     — hence a hard character cap and a one-sentence pin, asserted, not hoped.

import { describe, expect, it } from "vitest";
import {
  GUIDANCE_MAX_CHARS,
  STAGE_GUIDANCE,
  guidanceFor,
  guidanceViewFor,
} from "../stageGuidance";
import { STAGE_LABELS } from "../../labels";
import type { DealStage } from "../../types";

const ALL_STAGES = Object.keys(STAGE_LABELS) as DealStage[];

describe("STAGE_GUIDANCE coverage", () => {
  it("covers every stage in the ladder with no holes", () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_GUIDANCE[stage], stage).toBeDefined();
    }
    expect(Object.keys(STAGE_GUIDANCE).sort()).toEqual([...ALL_STAGES].sort());
  });

  it("never ships an empty or whitespace line", () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_GUIDANCE[stage].line.trim(), stage).not.toBe("");
    }
  });
});

describe("the cap is the feature (research §2.7)", () => {
  it("keeps every line inside GUIDANCE_MAX_CHARS", () => {
    for (const stage of ALL_STAGES) {
      const { line } = STAGE_GUIDANCE[stage];
      expect(line.length, `${stage}: ${line.length} chars`).toBeLessThanOrEqual(
        GUIDANCE_MAX_CHARS,
      );
    }
  });

  it("keeps every line to at most two sentences — a rail, not a paragraph", () => {
    for (const stage of ALL_STAGES) {
      const sentences = STAGE_GUIDANCE[stage].line
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      expect(sentences.length, stage).toBeLessThanOrEqual(2);
    }
  });

  it("carries no newline, so it cannot render as a block of advice", () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_GUIDANCE[stage].line, stage).not.toMatch(/\n/);
    }
  });
});

describe("the kind is what stops a rep chasing our own work", () => {
  it.each(["signed", "invoiced", "delivering"] as DealStage[])(
    "%s is waiting, never advance — the ball is ours",
    (stage) => {
      expect(STAGE_GUIDANCE[stage].kind).toBe("waiting");
    },
  );

  it("quote_sent is waiting — the customer holds it, not the rep", () => {
    expect(STAGE_GUIDANCE.quote_sent.kind).toBe("waiting");
  });

  it("lost is the only closed stage", () => {
    const closed = ALL_STAGES.filter((s) => STAGE_GUIDANCE[s].kind === "closed");
    expect(closed).toEqual(["lost"]);
  });

  it("stalled still advances — a stalled deal is exactly what needs a call", () => {
    expect(STAGE_GUIDANCE.stalled.kind).toBe("advance");
  });

  it("every pre-signature selling stage puts the next move on the rep", () => {
    for (const stage of [
      "new_lead",
      "contacted",
      "meeting_booked",
      "meeting_held",
      "negotiating",
    ] as DealStage[]) {
      expect(STAGE_GUIDANCE[stage].kind, stage).toBe("advance");
    }
  });
});

describe("guidanceFor", () => {
  it("returns the line for a real stage", () => {
    expect(guidanceFor("meeting_held")).toEqual(STAGE_GUIDANCE.meeting_held);
  });

  it("returns nothing for no stage — no deal is not stage zero", () => {
    expect(guidanceFor(undefined)).toBeUndefined();
  });
});

describe("guidanceViewFor", () => {
  it("hands the surface both the line and the stage label, so nothing re-derives it", () => {
    const view = guidanceViewFor("paid");
    expect(view.guidance).toEqual(STAGE_GUIDANCE.paid);
    expect(view.stageLabel).toBe(STAGE_LABELS.paid);
    expect(view.blocker).toBeUndefined();
  });

  it("refuses with a sentence when there is no anchored deal, never a blank", () => {
    const view = guidanceViewFor(undefined);
    expect(view.guidance).toBeUndefined();
    expect(view.stageLabel).toBeUndefined();
    expect(view.blocker).toMatch(/no deal/i);
  });

  it("populates blocker exactly when guidance is absent, across every stage", () => {
    for (const stage of ALL_STAGES) {
      const view = guidanceViewFor(stage);
      expect(Boolean(view.blocker), stage).toBe(false);
      expect(Boolean(view.guidance), stage).toBe(true);
    }
  });
});
