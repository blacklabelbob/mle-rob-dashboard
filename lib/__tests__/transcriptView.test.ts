import { describe, expect, it } from "vitest";
import { timecode, transcriptTurns, transcriptView } from "@/lib/calls/transcriptView";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";

function seg(p: Partial<TranscriptSegment> & { idx: number }): TranscriptSegment {
  return { startMs: p.idx * 1000, endMs: p.idx * 1000 + 900, text: `line ${p.idx}`, ...p };
}

describe("transcriptTurns", () => {
  it("merges consecutive segments from the same speaker into one turn", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, speaker: "0", text: "Hi there" }),
      seg({ idx: 1, speaker: "0", text: "it's Rob" }),
      seg({ idx: 2, speaker: "1", text: "Hey Rob" }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Hi there it's Rob");
    expect(turns[0].idx).toEqual([0, 1]);
    expect(turns[1].text).toBe("Hey Rob");
  });

  it("orders by idx, never by startMs — stored order is authoritative", () => {
    // Overlapping / out-of-order timestamps are exactly why idx exists.
    const turns = transcriptTurns([
      seg({ idx: 1, startMs: 500, endMs: 900, speaker: "1", text: "second" }),
      seg({ idx: 0, startMs: 700, endMs: 1200, speaker: "0", text: "first" }),
    ]);
    expect(turns.map((t) => t.text)).toEqual(["first", "second"]);
  });

  it("labels speakers by first appearance and NEVER as roles", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, speaker: "7" }),
      seg({ idx: 1, speaker: "2" }),
      seg({ idx: 2, speaker: "7" }),
    ]);
    expect(turns.map((t) => t.label)).toEqual(["Speaker 1", "Speaker 2", "Speaker 1"]);
    expect(turns.map((t) => t.speaker)).toEqual(["7", "2", "7"]);
    const text = JSON.stringify(turns).toLowerCase();
    expect(text).not.toMatch(/\brep\b|customer|caller|agent/);
  });

  it("never merges an unlabelled segment into a labelled neighbour", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, speaker: "0", text: "mine" }),
      seg({ idx: 1, text: "unattributed" }),
      seg({ idx: 2, speaker: "0", text: "mine again" }),
    ]);
    expect(turns).toHaveLength(3);
    expect(turns[1].speaker).toBeNull();
    expect(turns[1].label).toBe("Speaker");
  });

  it("keeps unlabelled segments together as one turn", () => {
    const turns = transcriptTurns([seg({ idx: 0, text: "a" }), seg({ idx: 1, text: "b" })]);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("a b");
  });

  it("does NOT split a turn on a long silence", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, startMs: 0, endMs: 1000, speaker: "0", text: "hold please" }),
      seg({ idx: 1, startMs: 95_000, endMs: 96_000, speaker: "0", text: "thanks for waiting" }),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].startMs).toBe(0);
    expect(turns[0].endMs).toBe(96_000);
  });

  it("takes the MAX end across a turn, so an overlapping segment cannot move it backwards", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, startMs: 0, endMs: 5000, speaker: "0", text: "long" }),
      seg({ idx: 1, startMs: 1000, endMs: 1200, speaker: "0", text: "short" }),
    ]);
    expect(turns[0].endMs).toBe(5000);
  });

  it("reports the weakest confidence in a turn, never an average", () => {
    const turns = transcriptTurns([
      seg({ idx: 0, speaker: "0", confidence: 0.99 }),
      seg({ idx: 1, speaker: "0", confidence: 0.4 }),
    ]);
    expect(turns[0].minConfidence).toBe(0.4);
  });

  it("reports null confidence when any segment in the turn carried none", () => {
    expect(
      transcriptTurns([
        seg({ idx: 0, speaker: "0", confidence: 0.9 }),
        seg({ idx: 1, speaker: "0" }),
      ])[0].minConfidence
    ).toBeNull();
    expect(
      transcriptTurns([
        seg({ idx: 0, speaker: "0" }),
        seg({ idx: 1, speaker: "0", confidence: 0.9 }),
      ])[0].minConfidence
    ).toBeNull();
  });

  it("keeps text verbatim and does not mutate the input", () => {
    const input = [seg({ idx: 0, speaker: "0", text: "um so like, the roof" })];
    const copy = JSON.parse(JSON.stringify(input));
    expect(transcriptTurns(input)[0].text).toBe("um so like, the roof");
    expect(input).toEqual(copy);
  });
});

describe("transcriptView", () => {
  it("is ready with turns when the transcript completed with words", () => {
    const v = transcriptView("complete", [seg({ idx: 0, speaker: "0" }), seg({ idx: 1, speaker: "1" })]);
    expect(v.state).toBe("ready");
    expect(v.speakerCount).toBe(2);
    expect(v.endMs).toBe(1900);
  });

  it("distinguishes a finished silent call (empty) from a failure", () => {
    expect(transcriptView("complete", []).state).toBe("empty");
    expect(transcriptView("failed", []).state).toBe("failed");
  });

  it("is pending — not empty — while transcription is unfinished", () => {
    const v = transcriptView("pending", []);
    expect(v.state).toBe("pending");
    expect(v.endMs).toBeNull();
  });

  it("status outranks segments: a pending row never shows partial words", () => {
    const v = transcriptView("pending", [seg({ idx: 0, speaker: "0", text: "half a call" })]);
    expect(v.state).toBe("pending");
    expect(v.turns).toEqual([]);
  });

  it("a failed row shows no words even if some were stored before it failed", () => {
    const v = transcriptView("failed", [seg({ idx: 0, speaker: "0", text: "partial" })]);
    expect(v.turns).toEqual([]);
    expect(v.speakerCount).toBe(0);
  });

  it("counts only distinct labelled speakers", () => {
    const v = transcriptView("complete", [seg({ idx: 0, speaker: "0" }), seg({ idx: 1 })]);
    expect(v.speakerCount).toBe(1);
  });

  it("is deterministic across runs", () => {
    const segs = [seg({ idx: 0, speaker: "0" }), seg({ idx: 1, speaker: "1" }), seg({ idx: 2, speaker: "0" })];
    expect(JSON.stringify(transcriptView("complete", segs))).toBe(
      JSON.stringify(transcriptView("complete", segs))
    );
  });
});

describe("timecode", () => {
  it("floors to the second so a label never reads ahead of the audio", () => {
    expect(timecode(7999)).toBe("0:07");
  });

  it("formats minutes and hours", () => {
    expect(timecode(0)).toBe("0:00");
    expect(timecode(65_000)).toBe("1:05");
    expect(timecode(3_725_000)).toBe("1:02:05");
  });

  it("refuses impossible input rather than formatting it", () => {
    expect(timecode(-1)).toBeNull();
    expect(timecode(Number.NaN)).toBeNull();
  });
});
