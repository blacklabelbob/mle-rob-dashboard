import { describe, expect, it } from "vitest";
import {
  transcriptPanel,
  transcriptPanelUnavailable,
  UNCERTAIN_BELOW,
} from "@/lib/calls/transcriptPanel";
import type { TranscriptTurn, TranscriptView } from "@/lib/calls/transcriptView";
import { callDetail } from "@/lib/calls/callTimeline";

function turn(over: Partial<TranscriptTurn> = {}): TranscriptTurn {
  return {
    speaker: "0",
    label: "Speaker 1",
    startMs: 7000,
    endMs: 9000,
    text: "we need the roof done before the storm",
    idx: [3, 4],
    minConfidence: 0.92,
    ...over,
  };
}

function view(over: Partial<TranscriptView> = {}): TranscriptView {
  return { state: "ready", turns: [turn()], speakerCount: 2, endMs: 9000, ...over };
}

describe("transcriptPanel — a ready call", () => {
  it("renders the turn verbatim with its seek time and stable key", () => {
    const p = transcriptPanel({ view: view() });
    expect(p.state).toBe("ready");
    expect(p.headline).toBeNull();
    expect(p.turns).toEqual([
      {
        key: 3,
        label: "Speaker 1",
        time: "0:07",
        text: "we need the roof done before the storm",
        confidence: "ok",
      },
    ]);
    expect(p.speakerCount).toBe(2);
    expect(p.notice).toBeNull();
  });

  it("never re-punctuates or truncates the words", () => {
    const text = "  no—we said TUESDAY, not thursday...  ok?";
    const p = transcriptPanel({ view: view({ turns: [turn({ text })] }) });
    expect(p.turns[0].text).toBe(text);
  });

  it("keeps an unusable start time null rather than printing 0:00", () => {
    const p = transcriptPanel({ view: view({ turns: [turn({ startMs: -1 })] }) });
    expect(p.turns[0].time).toBeNull();
  });
});

describe("transcriptPanel — confidence is three-valued", () => {
  it("marks a weak turn low", () => {
    const p = transcriptPanel({ view: view({ turns: [turn({ minConfidence: UNCERTAIN_BELOW - 0.01 })] }) });
    expect(p.turns[0].confidence).toBe("low");
  });

  it("does not mark a turn exactly at the threshold", () => {
    const p = transcriptPanel({ view: view({ turns: [turn({ minConfidence: UNCERTAIN_BELOW })] }) });
    expect(p.turns[0].confidence).toBe("ok");
  });

  it("an unmeasured turn is `unknown`, never `low` and never `ok`", () => {
    const p = transcriptPanel({ view: view({ turns: [turn({ minConfidence: null })] }) });
    expect(p.turns[0].confidence).toBe("unknown");
  });

  it("never exposes the raw number to the reader", () => {
    const p = transcriptPanel({ view: view({ turns: [turn({ minConfidence: 0.874 })] }) });
    expect(JSON.stringify(p)).not.toContain("0.874");
  });
});

describe("transcriptPanel — the four states are four different sentences", () => {
  const states = ["pending", "failed", "empty"] as const;

  it("gives each state its own headline and no turns", () => {
    const lines = states.map((state) => {
      const p = transcriptPanel({ view: view({ state, turns: [] }) });
      expect(p.turns).toEqual([]);
      expect(p.headline).toBeTruthy();
      return p.headline as string;
    });
    expect(new Set(lines).size).toBe(states.length);
  });

  it("a silent call does not read as a failure, and a failure names no cause", () => {
    const empty = transcriptPanel({ view: view({ state: "empty", turns: [] }) }).headline!;
    const failed = transcriptPanel({ view: view({ state: "failed", turns: [] }) }).headline!;
    expect(empty.toLowerCase()).not.toMatch(/fail|error|broke/);
    expect(failed.toLowerCase()).not.toMatch(/deepgram|key|disabled|timeout|silent/);
  });

  it("pending does not claim the call has no words", () => {
    const p = transcriptPanel({ view: view({ state: "pending", turns: [] }) });
    expect(p.headline!.toLowerCase()).not.toMatch(/no words|nothing was said/);
  });

  it("DROPS turns that arrive on a non-ready body — the wire is not trusted", () => {
    const p = transcriptPanel({ view: view({ state: "failed", turns: [turn()] }) });
    expect(p.turns).toEqual([]);
    expect(p.speakerCount).toBe(0);
    expect(JSON.stringify(p)).not.toContain("roof");
  });
});

describe("transcriptPanel — diagnostics are operator notices", () => {
  it("reports an unreadable row by column name, apart from the headline", () => {
    const p = transcriptPanel({
      view: view({ state: "failed", turns: [] }),
      diagnostics: { unreadable: "status" },
    });
    expect(p.notice).toContain("status");
    expect(p.headline).not.toContain("status");
  });

  it("reports dropped segments, and stays silent when there are none", () => {
    expect(transcriptPanel({ view: view(), diagnostics: { droppedSegments: 2 } }).notice).toContain("2");
    expect(transcriptPanel({ view: view(), diagnostics: { droppedSegments: 0 } }).notice).toBeNull();
    expect(transcriptPanel({ view: view(), diagnostics: {} }).notice).toBeNull();
  });

  it("a diagnostic never suppresses the transcript itself", () => {
    const p = transcriptPanel({ view: view(), diagnostics: { droppedSegments: 1 } });
    expect(p.state).toBe("ready");
    expect(p.turns).toHaveLength(1);
  });
});

describe("transcriptPanelUnavailable", () => {
  it("is its own state, separate from every answer about the call", () => {
    const p = transcriptPanelUnavailable(503);
    expect(p.state).toBe("unavailable");
    expect(p.turns).toEqual([]);
    expect(p.notice).toContain("503");
    for (const state of ["pending", "failed", "empty"] as const) {
      expect(p.headline).not.toBe(transcriptPanel({ view: view({ state, turns: [] }) }).headline);
    }
  });

  it("a 400 is not blamed on the call", () => {
    const p = transcriptPanelUnavailable(400);
    expect(p.headline!.toLowerCase()).not.toMatch(/could not be transcribed|nothing was said/);
  });

  it("works with no status at all", () => {
    expect(transcriptPanelUnavailable().notice).toBeNull();
  });
});

describe("callDetail exposes the sid the panel asks with", () => {
  it("carries recordingSid off the activity row's context", () => {
    const d = callDetail({
      type: "call",
      source_context: { recordingSid: "RE" + "a".repeat(32), direction: "inbound" },
    })!;
    expect(d.recordingSid).toBe("RE" + "a".repeat(32));
  });

  it("is null when the row carries none — no empty-sid request is ever made", () => {
    expect(callDetail({ type: "call", source_context: {} })!.recordingSid).toBeNull();
    expect(callDetail({ type: "call" })!.recordingSid).toBeNull();
  });
});
