import { describe, expect, it } from "vitest";
import {
  actionCandidates,
  benefitCandidates,
  candidatesFromNextSteps,
  painCandidates,
  talkingPointCandidates,
  type NextStepsResult,
} from "../nextStepsAdapter";
import { buildMeetingIntel } from "../meetingIntel";

const OPTS = { meetingId: "A-MTG-2026-07-28-OMEGA", url: "https://example.invalid/m" };

const RESULT: NextStepsResult = {
  ranked: [
    {
      id: "A2",
      kind: "action",
      title: "Send the title-plant scoping doc",
      source_line: "Rob to send over the scoping doc this week.",
      owner: "Rob",
      owner_side: "us",
      rank: 1,
    },
    {
      id: "A1",
      kind: "action",
      title: "Confirm the underwriter contact",
      source_line: "We'll dig up who the underwriter is.",
      owner: "UNRESOLVED",
      owner_side: "UNRESOLVED",
      rank: 2,
    },
  ],
  constraints: [
    {
      id: "C1",
      kind: "constraint",
      title: "Out of office the first week of August",
      source_line: "I'm out the first week of August.",
      rank: null,
    },
  ],
  pain_points: [
    { quote: "Our IT sucks.", speaker: "Dana", speaker_side: "them" },
    { quote: "We can help them streamline.", speaker: "Rob", speaker_side: "us" },
  ],
  talking_points: [
    { point: "They care about turnaround time", why: "raised twice", source_line: "Turnaround is what kills us." },
  ],
  benefits_to_us: [
    { benefit: "Opens the title vertical", type: "expansion path", source_line: "We work with four other title shops." },
  ],
};

describe("nextStepsAdapter — rank is carried, never computed", () => {
  it("carries the scorer's rank onto action candidates", () => {
    const actions = actionCandidates(RESULT, OPTS);
    expect(actions.map((a) => a.rank)).toEqual([1, 2]);
  });

  it("does not reorder — the scorer's array order survives, ranking is meetingIntel's job", () => {
    // A2 is first in ranked[] and stays first here; sorting happens once, downstream.
    const actions = actionCandidates(RESULT, OPTS);
    expect(actions[0].text).toBe("Send the title-plant scoping doc");
  });

  it("leaves an unranked action unranked rather than inventing a position", () => {
    const partial: NextStepsResult = {
      ranked: [
        { id: "A1", kind: "action", title: "Do the thing", source_line: "line", owner: "Rob", rank: 1 },
        { id: "A2", kind: "action", title: "Other thing", source_line: "line two", owner: "Rob" },
      ],
    };
    expect(actionCandidates(partial, OPTS).map((a) => a.rank)).toEqual([1, undefined]);
  });

  it("degrades the whole block to source order when the ranking is partial", () => {
    const partial: NextStepsResult = {
      ranked: [
        { id: "A1", kind: "action", title: "Do the thing", source_line: "line", owner: "Rob", rank: 1 },
        { id: "A2", kind: "action", title: "Other thing", source_line: "line two", owner: "Rob" },
      ],
    };
    const intel = buildMeetingIntel(candidatesFromNextSteps(partial, OPTS));
    const actions = intel.blocks.find((b) => b.kind === "action-items")!;
    // Half a ranking read as a ranking is worse than none.
    expect(actions.ordering).toBe("source-order");
  });

  it("actually sorts by rank — proven with array order deliberately AGAINST rank order", () => {
    // If this seam or meetingIntel silently used array position as the order, this passes
    // by luck everywhere the scorer already emitted sorted rows. Here it cannot.
    const outOfOrder: NextStepsResult = {
      ranked: [
        { id: "A9", kind: "action", title: "Third", source_line: "l3", owner: "Rob", rank: 3 },
        { id: "A1", kind: "action", title: "First", source_line: "l1", owner: "Rob", rank: 1 },
        { id: "A5", kind: "action", title: "Second", source_line: "l2", owner: "Rob", rank: 2 },
      ],
    };
    expect(actionCandidates(outOfOrder, OPTS).map((a) => a.text)).toEqual(["Third", "First", "Second"]);
    const intel = buildMeetingIntel(candidatesFromNextSteps(outOfOrder, OPTS));
    const actions = intel.blocks.find((b) => b.kind === "action-items")!;
    expect(actions.ordering).toBe("ranked");
    expect(actions.items.map((i) => i.text)).toEqual(["First", "Second", "Third"]);
  });

  it("reports 'ranked' end to end when every action carried a rank", () => {
    const intel = buildMeetingIntel(candidatesFromNextSteps(RESULT, OPTS));
    const actions = intel.blocks.find((b) => b.kind === "action-items")!;
    expect(actions.ordering).toBe("ranked");
    expect(actions.items.map((i) => i.text)).toEqual([
      "Send the title-plant scoping doc",
      "Confirm the underwriter contact",
    ]);
  });
});

describe("nextStepsAdapter — a constraint is not an action", () => {
  it("does not map constraints into the action block at all", () => {
    const texts = actionCandidates(RESULT, OPTS).map((a) => a.text);
    expect(texts).not.toContain("Out of office the first week of August");
  });

  it("keeps a constraint out of the #1 slot by never admitting it", () => {
    const intel = buildMeetingIntel(candidatesFromNextSteps(RESULT, OPTS));
    const actions = intel.blocks.find((b) => b.kind === "action-items")!;
    expect(actions.items[0].text).toBe("Send the title-plant scoping doc");
  });
});

describe("nextStepsAdapter — owner", () => {
  it("renders a resolved owner", () => {
    expect(actionCandidates(RESULT, OPTS)[0].owner).toBe("Rob");
  });

  it("drops the literal UNRESOLVED rather than printing it as a person", () => {
    expect(actionCandidates(RESULT, OPTS)[1].owner).toBeUndefined();
  });

  it("drops UNRESOLVED even when the scorer appended a reason to it", () => {
    const r: NextStepsResult = {
      ranked: [
        { id: "A1", kind: "action", title: "T", source_line: "l", owner: "UNRESOLVED - record does not say", rank: 1 },
      ],
    };
    expect(actionCandidates(r, OPTS)[0].owner).toBeUndefined();
  });
});

describe("nextStepsAdapter — pain points cross unedited", () => {
  it("passes the quote through byte-identical", () => {
    expect(painCandidates(RESULT, OPTS)[0].text).toBe("Our IT sucks.");
  });

  it("re-applies the side filter so our own words never file as their pain", () => {
    const quotes = painCandidates(RESULT, OPTS).map((p) => p.text);
    expect(quotes).not.toContain("We can help them streamline.");
    expect(quotes).toHaveLength(1);
  });

  it("survives meetingIntel's verbatim check, because quote and excerpt are the same string", () => {
    const intel = buildMeetingIntel(candidatesFromNextSteps(RESULT, OPTS));
    const pains = intel.blocks.find((b) => b.kind === "pain-points")!;
    expect(pains.isEmpty).toBe(false);
    expect(pains.items[0].text).toBe("Our IT sucks.");
  });
});

describe("nextStepsAdapter — provenance", () => {
  it("addresses every item inside the meeting, never by meeting alone", () => {
    for (const c of candidatesFromNextSteps(RESULT, OPTS)) {
      expect(c.provenance?.meetingId).toBe(OPTS.meetingId);
      expect(c.provenance?.sourceRef).toBeTruthy();
      expect(c.provenance?.sourceRef).not.toBe(OPTS.meetingId);
    }
  });

  it("carries the scorer's source_line as the checkable excerpt", () => {
    expect(talkingPointCandidates(RESULT, OPTS)[0].provenance?.excerpt).toBe("Turnaround is what kills us.");
    expect(benefitCandidates(RESULT, OPTS)[0].provenance?.excerpt).toBe("We work with four other title shops.");
  });

  it("never fabricates a url when none was supplied", () => {
    const c = actionCandidates(RESULT, { meetingId: "M1" })[0];
    expect(c.provenance?.url).toBeUndefined();
  });

  it("stamps context only when the surface supplies one", () => {
    const withCtx = actionCandidates(RESULT, { ...OPTS, context: "Omega Title" })[0];
    expect(withCtx.provenance?.context).toBe("Omega Title");
    expect(actionCandidates(RESULT, OPTS)[0].provenance?.context).toBeUndefined();
  });

  it("gives two items quoting the same line separate addresses", () => {
    const r: NextStepsResult = {
      ranked: [
        { id: "A1", kind: "action", title: "First read", source_line: "same line", owner: "Rob", rank: 1 },
        { id: "A2", kind: "action", title: "Second read", source_line: "same line", owner: "Rob", rank: 2 },
      ],
    };
    const refs = actionCandidates(r, OPTS).map((a) => a.provenance?.sourceRef);
    expect(new Set(refs).size).toBe(2);
  });
});

describe("nextStepsAdapter — an absent section is empty, never invented", () => {
  it("returns nothing for every block on an empty result", () => {
    expect(candidatesFromNextSteps({}, OPTS)).toEqual([]);
  });

  it("renders the four blocks empty-with-a-reason rather than filled with plausible text", () => {
    const intel = buildMeetingIntel(candidatesFromNextSteps({}, OPTS));
    expect(intel.isEmpty).toBe(true);
    for (const b of intel.blocks) {
      expect(b.isEmpty).toBe(true);
      expect(b.emptyReason).not.toBe("");
    }
  });

  it("is deterministic — same input twice, identical output", () => {
    expect(candidatesFromNextSteps(RESULT, OPTS)).toEqual(candidatesFromNextSteps(RESULT, OPTS));
  });
});

describe("nextStepsAdapter — all four blocks arrive", () => {
  it("emits one candidate per kind in contract render order", () => {
    const kinds = candidatesFromNextSteps(RESULT, OPTS).map((c) => c.kind);
    expect(kinds).toEqual([
      "action-items",
      "action-items",
      "talking-points",
      "pain-points",
      "benefits-us",
    ]);
  });
});
