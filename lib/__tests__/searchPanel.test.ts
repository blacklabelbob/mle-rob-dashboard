import { describe, expect, it } from "vitest";
import {
  searchPanel,
  searchPanelFromBody,
  searchPanelUnreadable,
} from "@/lib/calls/searchPanel";
import { transcriptPanel } from "@/lib/calls/transcriptPanel";
import { transcriptView } from "@/lib/calls/transcriptView";
import { searchTranscript } from "@/lib/calls/transcriptSearch";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";

const CALL: TranscriptSegment[] = [
  { idx: 0, startMs: 0, endMs: 900, speaker: "0", text: "Thanks for calling, this is Rob." },
  { idx: 1, startMs: 1000, endMs: 1900, speaker: "1", text: "I need a quote for a new roof." },
  {
    idx: 2,
    startMs: 2000,
    endMs: 2900,
    speaker: "0",
    text: "We can do fifteen thousand for that roof.",
  },
];

/** The panel turns a reader is actually shown, built the way the component builds them. */
function turnsOf(segments: TranscriptSegment[] = CALL) {
  return transcriptPanel({ view: transcriptView("complete", segments) }).turns;
}

function run(query: string, segments: TranscriptSegment[] = CALL) {
  const view = transcriptView("complete", segments);
  return searchPanel(searchTranscript(view, segments, query), transcriptPanel({ view }).turns);
}

describe("searchPanel — the reader-facing half of moment search", () => {
  it("places every hit on the turn it was said in, keyed by PanelTurn.key", () => {
    const panel = run("roof")!;
    expect(panel.state).toBe("results");
    // "roof" is in turn 1 (segment 1) and turn 2 (segment 2) — call order, never ranked.
    expect(panel.moments.map((m) => m.turnKey)).toEqual([1, 2]);
    expect(panel.moments.map((m) => m.idx)).toEqual([1, 2]);
    expect(panel.unplaced).toBe(0);
  });

  it("marks land on the real characters — slicing the turn text returns the phrase", () => {
    const turns = turnsOf();
    const panel = run("roof")!;
    for (const [key, marks] of Object.entries(panel.marks)) {
      const turn = turns.find((t) => t.key === Number(key))!;
      for (const mark of marks) {
        expect(turn.text.slice(mark.start, mark.end).toLowerCase()).toBe("roof");
      }
    }
  });

  it("the seek target is the segment, and the time comes from it", () => {
    const panel = run("fifteen")!;
    expect(panel.moments).toHaveLength(1);
    expect(panel.moments[0].idx).toBe(2);
    expect(panel.moments[0].time).toBe("0:02");
  });

  it("headline counts what is on screen, and never inserts anything into the words", () => {
    const panel = run("roof")!;
    expect(panel.headline).toBe('2 moments matching “roof”');
    expect(panel.moments[0].snippet).toBe("I need a quote for a new roof.");
    expect(panel.moments[0].snippet).not.toContain("*");
    expect(panel.moments[0].snippet).not.toContain("…");
  });

  it("one hit says '1 moment', not '1 moments'", () => {
    expect(run("quote")!.headline).toBe('1 moment matching “quote”');
  });

  it("a real zero says the phrase was not said — only for a call that WAS searched", () => {
    const panel = run("hail damage")!;
    expect(panel.state).toBe("results");
    expect(panel.headline).toBe('No moments — “hail damage” was not said on this call');
    expect(panel.moments).toEqual([]);
  });

  it("RULE 1: an untranscribed call is unsearchable, never a zero", () => {
    const view = transcriptView("pending", []);
    const panel = searchPanel(
      searchTranscript(view, [], "refund"),
      transcriptPanel({ view }).turns
    )!;
    expect(panel.state).toBe("unsearchable");
    expect(panel.headline).toBe("Nothing to search yet — this call has not been transcribed");
    // The one sentence this must never produce.
    expect(panel.headline).not.toContain("not said");
    expect(panel.headline).not.toContain("No moments");
  });

  it("a failed call gets its own sentence and blames no provider", () => {
    const view = transcriptView("failed", []);
    const panel = searchPanel(
      searchTranscript(view, [], "refund"),
      transcriptPanel({ view }).turns
    )!;
    expect(panel.headline).toBe("Nothing to search — this call could not be transcribed");
    expect(panel.headline.toLowerCase()).not.toContain("deepgram");
  });

  it("an un-asked query has NO panel at all — never an empty one", () => {
    expect(searchPanel({ state: "idle", matches: [] }, turnsOf())).toBeNull();
  });

  it("RULE 2: a hit for a turn that is not on screen is dropped, counted, and said", () => {
    const panel = searchPanel(
      {
        state: "results",
        query: "roof",
        matches: [
          {
            turnIndex: 99,
            speaker: "0",
            label: "Speaker 1",
            idx: 99,
            startMs: 0,
            start: 0,
            end: 4,
            snippet: "roof",
            snippetStart: 0,
            snippetEnd: 4,
            truncatedStart: false,
            truncatedEnd: false,
          },
        ],
      },
      turnsOf()
    )!;
    expect(panel.moments).toEqual([]);
    expect(panel.unplaced).toBe(1);
    expect(panel.headline).toContain("1 could not be shown");
    expect(panel.marks).toEqual({});
  });

  it("RULE 2: a range past the end of the turn is dropped, never clamped", () => {
    const turns = turnsOf();
    const panel = searchPanel(
      {
        state: "results",
        query: "roof",
        matches: [
          {
            turnIndex: 0,
            speaker: "0",
            label: "Speaker 1",
            idx: 0,
            startMs: 0,
            start: turns[0].text.length - 2,
            end: turns[0].text.length + 40,
            snippet: "…",
            snippetStart: 0,
            snippetEnd: 1,
            truncatedStart: true,
            truncatedEnd: false,
          },
        ],
      },
      turns
    )!;
    expect(panel.unplaced).toBe(1);
    expect(panel.marks).toEqual({});
  });

  it("RULE 3: overlapping marks never both render — the second is dropped", () => {
    const mk = (start: number, end: number) => ({
      turnIndex: 0,
      speaker: "0",
      label: "Speaker 1",
      idx: 0,
      startMs: 0,
      start,
      end,
      snippet: "x",
      snippetStart: 0,
      snippetEnd: 1,
      truncatedStart: false,
      truncatedEnd: false,
    });
    const panel = searchPanel(
      { state: "results", query: "th", matches: [mk(0, 6), mk(3, 9), mk(10, 14)] },
      turnsOf()
    )!;
    expect(panel.marks[0]).toEqual([
      { start: 0, end: 6 },
      { start: 10, end: 14 },
    ]);
  });
});

describe("searchPanelFromBody — the wire boundary", () => {
  const body = (search: unknown) => ({ view: {}, search });

  it("no `search` key means no panel — the caller did not ask", () => {
    expect(searchPanelFromBody({ view: {} }, turnsOf())).toBeNull();
  });

  it("a real result parses into the same panel as the in-process call", () => {
    const view = transcriptView("complete", CALL);
    const wire = JSON.parse(JSON.stringify(searchTranscript(view, CALL, "roof")));
    expect(searchPanelFromBody(body(wire), turnsOf())).toEqual(run("roof"));
  });

  it("an unsearchable section survives the wire as unsearchable", () => {
    const panel = searchPanelFromBody(
      body({ state: "unsearchable", reason: "pending", matches: [] }),
      turnsOf()
    )!;
    expect(panel.state).toBe("unsearchable");
  });

  it("ALL-OR-NOTHING: one malformed match voids the list rather than under-counting", () => {
    const view = transcriptView("complete", CALL);
    const wire = JSON.parse(JSON.stringify(searchTranscript(view, CALL, "roof")));
    delete wire.matches[1].snippet;
    const panel = searchPanelFromBody(body(wire), turnsOf())!;
    expect(panel).toEqual(searchPanelUnreadable());
    expect(panel.moments).toEqual([]);
  });

  it("an unreadable section is NOT a zero and NOT a claim about the call", () => {
    const panel = searchPanelFromBody(body({ state: "nonsense" }), turnsOf())!;
    expect(panel.state).toBe("unreadable");
    expect(panel.headline).toBe("Search result could not be read");
    expect(panel.headline).not.toContain("not said");
  });

  it("garbage bodies map without throwing", () => {
    for (const junk of [null, {}, { search: null }, { search: [] }, { search: 3 }]) {
      expect(() => searchPanelFromBody(junk, turnsOf())).not.toThrow();
    }
  });
});
