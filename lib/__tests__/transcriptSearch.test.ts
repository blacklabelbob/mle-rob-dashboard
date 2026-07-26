import { describe, expect, it } from "vitest";
import {
  foldWithMap,
  searchTranscript,
  searchTurns,
  segmentSpans,
} from "@/lib/calls/transcriptSearch";
import { transcriptTurns, transcriptView } from "@/lib/calls/transcriptView";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";

function seg(p: Partial<TranscriptSegment> & { idx: number }): TranscriptSegment {
  return { startMs: p.idx * 1000, endMs: p.idx * 1000 + 900, text: `line ${p.idx}`, ...p };
}

/** A short two-speaker call, the shape inc.15's turns projection produces. */
const CALL: TranscriptSegment[] = [
  seg({ idx: 0, speaker: "0", text: "Thanks for calling, this is Rob." }),
  seg({ idx: 1, speaker: "0", text: "How can I help?" }),
  seg({ idx: 2, speaker: "1", text: "I need a quote for a new roof." }),
  seg({ idx: 3, speaker: "0", text: "We can do fifteen thousand for that roof." }),
];

function turnsOf(segments: TranscriptSegment[]) {
  return transcriptTurns(segments);
}

describe("searchTurns", () => {
  it("finds a phrase and seeks to the SEGMENT it starts in, not the turn", () => {
    const [m, ...rest] = searchTurns(turnsOf(CALL), CALL, "fifteen thousand");
    expect(rest).toHaveLength(0);
    // The turn starts at segment 3 here, but the point is the moment carries a segment.
    expect(m.idx).toBe(3);
    expect(m.startMs).toBe(3000);
    expect(m.label).toBe("Speaker 1");
  });

  it("seeks to the right segment when the turn spans several", () => {
    // "How can I help" is the SECOND segment of speaker 0's opening turn.
    const [m] = searchTurns(turnsOf(CALL), CALL, "how can i help");
    expect(m.idx).toBe(1);
    expect(m.startMs).toBe(1000);
    // ...and a hit in the first segment of that same turn still seeks to segment 0.
    expect(searchTurns(turnsOf(CALL), CALL, "this is Rob")[0].idx).toBe(0);
  });

  it("returns offsets into the verbatim text and inserts nothing into the words", () => {
    const turns = turnsOf(CALL);
    const [m] = searchTurns(turns, CALL, "new roof");
    expect(turns[m.turnIndex].text.slice(m.start, m.end)).toBe("new roof");
    expect(m.snippet).toBe(turns[m.turnIndex].text); // short turn: whole thing, uncut
    expect(m.snippet.slice(m.snippetStart, m.snippetEnd)).toBe("new roof");
    expect(m.truncatedStart).toBe(false);
    expect(m.truncatedEnd).toBe(false);
    expect(m.snippet).not.toContain("…");
    expect(m.snippet).not.toContain("**");
  });

  it("cuts long turns to a window and FLAGS the cut instead of adding an ellipsis", () => {
    const long = [
      seg({ idx: 0, speaker: "0", text: `${"a ".repeat(80)}refund${" b".repeat(80)}` }),
    ];
    const [m] = searchTurns(turnsOf(long), long, "refund", 10);
    expect(m.snippet).toBe("a a a a a refund b b b b b");
    expect(m.snippet.slice(m.snippetStart, m.snippetEnd)).toBe("refund");
    expect(m.truncatedStart).toBe(true);
    expect(m.truncatedEnd).toBe(true);
  });

  it("never matches across a turn boundary — nobody said that sentence", () => {
    // "help I need" spans speaker 0's last words and speaker 1's first.
    expect(searchTurns(turnsOf(CALL), CALL, "help? I need")).toEqual([]);
  });

  it("folds case and whitespace but nothing else — no stemming, no near-miss", () => {
    const words = [seg({ idx: 0, speaker: "0", text: "We quoted   FIFTEEN\nthousand today" })];
    expect(searchTurns(turnsOf(words), words, "fifteen thousand")).toHaveLength(1);
    // The near-miss that would cost a customer money stays a miss.
    expect(searchTurns(turnsOf(words), words, "fifty thousand")).toEqual([]);
    // ...and so does a stem.
    expect(searchTurns(turnsOf(words), words, "quoting")).toEqual([]);
  });

  it("counts non-overlapping hits, in call order", () => {
    const many = [
      seg({ idx: 0, speaker: "0", text: "roof roof" }),
      seg({ idx: 1, speaker: "1", text: "the roof" }),
    ];
    const hits = searchTurns(turnsOf(many), many, "roof");
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.idx)).toEqual([0, 0, 1]);
    // "aa" in "aaaa" is 2 hits, not 3 — the count a rep can hear.
    const aaa = [seg({ idx: 0, speaker: "0", text: "aaaa" })];
    expect(searchTurns(turnsOf(aaa), aaa, "aa")).toHaveLength(2);
  });

  it("an empty or whitespace query matches nothing, never everything", () => {
    expect(searchTurns(turnsOf(CALL), CALL, "")).toEqual([]);
    expect(searchTurns(turnsOf(CALL), CALL, "   \n ")).toEqual([]);
  });
});

describe("segmentSpans", () => {
  it("reconstructs exactly the text transcriptTurns joined — the seek map cannot drift", () => {
    const turn = turnsOf(CALL)[0];
    const byIdx = new Map(CALL.map((s) => [s.idx, s]));
    const spans = segmentSpans(turn, byIdx);
    const rebuilt = spans.map((s) => turn.text.slice(s.from, s.to)).join(" ");
    expect(rebuilt).toBe(turn.text);
  });
});

describe("foldWithMap", () => {
  it("maps every folded character back to its original index", () => {
    const { folded, map } = foldWithMap("  Hi   THERE\nRob ");
    expect(folded).toBe("hi there rob");
    expect(map).toHaveLength(folded.length);
    expect("  Hi   THERE\nRob "[map[folded.indexOf("there")]]).toBe("T");
  });

  it("keeps a character whose lowercase is not one character, rather than shifting the map", () => {
    // İ lowercases to two code units; folding it would shift every later offset.
    const { folded, map } = foldWithMap("İstanbul roof");
    expect(folded).toHaveLength(map.length);
    expect(folded).toContain("roof");
    expect("İstanbul roof"[map[folded.indexOf("roof")]]).toBe("r");
  });
});

describe("searchTranscript", () => {
  it("refuses to answer for a transcript that has not come back", () => {
    const view = transcriptView("pending", []);
    expect(searchTranscript(view, [], "refund")).toEqual({
      state: "unsearchable",
      reason: "pending",
      matches: [],
    });
    expect(searchTranscript(transcriptView("failed", []), [], "refund")).toEqual({
      state: "unsearchable",
      reason: "failed",
      matches: [],
    });
  });

  it("a finished wordless call IS a real zero, not unsearchable", () => {
    const result = searchTranscript(transcriptView("complete", []), [], "refund");
    expect(result).toEqual({ state: "results", query: "refund", matches: [] });
  });

  it("no query is idle — neither 'everything' nor 'nothing said'", () => {
    expect(searchTranscript(transcriptView("complete", CALL), CALL, " ")).toEqual({
      state: "idle",
      matches: [],
    });
  });

  it("searches a ready transcript end to end", () => {
    const view = transcriptView("complete", CALL);
    const result = searchTranscript(view, CALL, "  ROOF ");
    expect(result.state).toBe("results");
    expect(result.matches.map((m) => m.idx)).toEqual([2, 3]);
    expect(result.matches[0].label).toBe("Speaker 2");
  });
});
