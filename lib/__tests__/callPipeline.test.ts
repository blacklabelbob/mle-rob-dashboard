import { describe, expect, it, vi } from "vitest";
import {
  callPipelineLog,
  processCallRecording,
  type CallPipelineDeps,
} from "@/lib/calls/callPipeline";
import type { TranscribeResult } from "@/lib/calls/transcribeRecording";
import type { SummarizeResult } from "@/lib/calls/summarizeCall";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";
import type { TranscriptDb } from "@/lib/calls/transcriptStore";
import type { Activity } from "@/lib/types";

// BUILD-QUEUE Q68 (c) inc.13 — the chain the webhook's `after()` now runs in one await.
// What is pinned here is the handover: the summariser gets the words THIS run stored (never a
// re-read), the gate decision stays in exactly one place, and neither customer speech nor
// summary prose can reach a log line.

const ACTIVITY: Activity = {
  id: "dialer-RE123",
  personId: "p-1",
  type: "call",
  source: "dialer",
  sourceContext: { callSid: "CA1", recordingSid: "RE123", matchedOn: "to" },
  recordingUrl: "https://api.twilio.com/RE123",
  bookProtected: false,
  occurredAt: "2026-07-26T18:00:00.000Z",
  createdAt: "2026-07-26T18:00:05.000Z",
};

const WORDS: TranscriptSegment[] = [
  { idx: 0, startMs: 0, endMs: 2_000, text: "Hi, this is Rob." },
  { idx: 1, startMs: 2_000, endMs: 5_000, text: "Send it Monday and we're good." },
];

const db: TranscriptDb = {
  upsertTranscript: async () => "t-1",
  upsertSegments: async () => {},
  pruneSegments: async () => {},
};

const stored = (over: Partial<Extract<TranscribeResult, { kind: "stored" }>> = {}) =>
  ({
    kind: "stored",
    status: "complete",
    transcriptId: "t-1",
    segments: WORDS.length,
    words: WORDS,
    ...over,
  }) satisfies TranscribeResult;

const WRITTEN: SummarizeResult = {
  kind: "written",
  activity: {
    ...ACTIVITY,
    summary: "Owner wants the agreement Monday.",
    actionItems: ["Send the agreement Monday"],
    buyingSignals: [{ label: "timeline stated", quote: "Send it Monday" }],
  } as Activity,
  actionItems: 1,
  buyingSignals: 1,
  truncated: false,
};

/** A rig with both halves faked: the sequence is what is under test, not the providers. */
function rig(over: Partial<CallPipelineDeps> = {}) {
  const saved: Activity[] = [];
  const transcribe = vi.fn(async () => stored());
  const summarize = vi.fn(async () => WRITTEN);
  const deps: CallPipelineDeps = {
    db,
    saveActivity: async (a) => void saved.push(a),
    transcribe: transcribe as unknown as CallPipelineDeps["transcribe"],
    summarize: summarize as unknown as CallPipelineDeps["summarize"],
    ...over,
  };
  return { deps, saved, transcribe, summarize };
}

const input = {
  activity: ACTIVITY,
  recordingSid: "RE123",
  recordingUrl: "https://api.twilio.com/RE123",
};

describe("processCallRecording — the handover", () => {
  it("hands the summariser the words this run stored, and the row the webhook holds", async () => {
    const { deps, summarize } = rig();

    const result = await processCallRecording(deps, input);

    expect(result.transcript.kind).toBe("stored");
    expect(result.summary).toEqual(WRITTEN);
    const passed = summarize.mock.calls[0][1] as { segments: readonly TranscriptSegment[] };
    // The words come from memory, NOT from a second read of 0021: on a Twilio re-delivery two
    // runs share one recording_sid, and a read could return the other run's rows.
    expect(passed.segments).toEqual(WORDS);
    // And the activity is the one already filed — never re-derived, never re-matched.
    expect((summarize.mock.calls[0][1] as { activity: Activity }).activity).toBe(ACTIVITY);
  });

  it("passes the transcript outcome itself down, so the gate lives in ONE place", async () => {
    const failed = stored({ status: "failed", segments: 0, words: [] });
    const { deps, summarize } = rig({ transcribe: (async () => failed) as never });

    await processCallRecording(deps, input);

    // No branch here inspects `status`: a copy of that decision is how "transcript failed"
    // and "no segments" — the pair inc.12 exists to keep apart — become one reason string.
    expect((summarize.mock.calls[0][1] as { transcript: TranscribeResult }).transcript).toBe(
      failed
    );
    expect((summarize.mock.calls[0][1] as { segments: readonly unknown[] }).segments).toEqual(
      []
    );
  });

  it("still calls the summariser when transcription was disabled — with no words", async () => {
    const off: TranscribeResult = { kind: "disabled" };
    const { deps, summarize } = rig({ transcribe: (async () => off) as never });

    const result = await processCallRecording(deps, input);

    expect(result.transcript).toEqual(off);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect((summarize.mock.calls[0][1] as { segments: readonly unknown[] }).segments).toEqual(
      []
    );
  });

  it("gives the summariser the same save function it was handed", async () => {
    const { deps, summarize, saved } = rig();

    await processCallRecording(deps, input);
    await (summarize.mock.calls[0][0] as (a: Activity) => Promise<void>)(ACTIVITY);

    expect(saved).toEqual([ACTIVITY]);
  });

  it("propagates a transcription failure and never summarises after one", async () => {
    const boom = new Error("deepgram exploded");
    const { deps, summarize } = rig({
      transcribe: (async () => {
        throw boom;
      }) as never,
    });

    await expect(processCallRecording(deps, input)).rejects.toBe(boom);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("propagates a summary-write failure instead of reporting a chain that ran", async () => {
    const boom = new Error("row write failed");
    const { deps } = rig({
      summarize: (async () => {
        throw boom;
      }) as never,
    });

    // Inside `after()` nothing retries; a swallowed error here would log a summary that
    // never landed as a success.
    await expect(processCallRecording(deps, input)).rejects.toBe(boom);
  });

  it("is deterministic — the same recording twice produces the same result", async () => {
    const { deps } = rig();
    const a = await processCallRecording(deps, input);
    const b = await processCallRecording(deps, input);
    expect(a).toEqual(b);
  });
});

describe("callPipelineLog — what may be written to a log", () => {
  it("carries counts and ids but NO transcript words and NO summary prose", async () => {
    const { deps } = rig();
    const line = callPipelineLog(await processCallRecording(deps, input));

    const text = JSON.stringify(line);
    expect(text).not.toContain("Send it Monday");
    expect(text).not.toContain("Owner wants the agreement");
    expect(text).not.toContain("Hi, this is Rob");
    expect(line).toEqual({
      transcript: {
        kind: "stored",
        status: "complete",
        transcriptId: "t-1",
        segments: 2,
      },
      summary: {
        kind: "written",
        activityId: "dialer-RE123",
        actionItems: 1,
        buyingSignals: 1,
        truncated: false,
      },
    });
  });

  it("keeps a skip or rejection readable — the reason IS the log", () => {
    const line = callPipelineLog({
      transcript: stored({ status: "failed", segments: 0, words: [] }),
      summary: { kind: "skipped", reason: "transcript failed" },
    });
    expect(line).toEqual({
      transcript: { kind: "stored", status: "failed", transcriptId: "t-1", segments: 0 },
      summary: { kind: "skipped", reason: "transcript failed" },
    });
  });

  it("does not mutate the result it projects", async () => {
    const { deps } = rig();
    const result = await processCallRecording(deps, input);
    callPipelineLog(result);
    expect(result.transcript).toEqual(stored());
    expect(result.summary).toEqual(WRITTEN);
  });
});
