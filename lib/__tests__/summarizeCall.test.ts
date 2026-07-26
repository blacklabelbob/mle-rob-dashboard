import { describe, expect, it, vi } from "vitest";
import { summarizeCall, summaryOwed } from "@/lib/calls/summarizeCall";
import type { SummaryOutcome } from "@/lib/calls/summaryClient";
import type { TranscribeResult } from "@/lib/calls/transcribeRecording";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";
import type { Activity } from "@/lib/types";

// BUILD-QUEUE Q68 (c) inc.12 — the join between a stored transcript and a summarised row.
// What is tested here is WHETHER we ask (the billed decision, and the one that can put a
// paragraph on a wordless call) and what a refusal is allowed to do to a row that already
// has a summary: nothing.

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

const SEGMENTS: TranscriptSegment[] = [
  { idx: 0, startMs: 0, endMs: 2_000, text: "Hi, this is Rob." },
  { idx: 1, startMs: 2_000, endMs: 5_000, text: "Send it Monday and we're good." },
];

const STORED: TranscribeResult = {
  kind: "stored",
  status: "complete",
  transcriptId: "t-1",
  segments: 2,
};

const OK: SummaryOutcome = {
  kind: "ok",
  value: {
    summary: "Owner wants the agreement Monday.",
    actionItems: ["Send the agreement Monday"],
    buyingSignals: [{ label: "timeline stated", quote: "Send it Monday" }],
    truncated: false,
  },
};

describe("summaryOwed", () => {
  it("owes a summary only to a complete transcript that has words", () => {
    expect(summaryOwed(STORED)).toEqual({ ok: true });
  });

  it("distinguishes a failed transcript from a silent call", () => {
    // Both arrive with zero segments (inc.5 prunes non-complete rows to zero) — the reason
    // string is the only place the difference survives.
    const failed = summaryOwed({
      kind: "stored",
      status: "failed",
      transcriptId: "t-1",
      segments: 0,
    });
    const silent = summaryOwed({ ...STORED, segments: 0 });
    expect(failed).toEqual({ ok: false, reason: "transcript failed" });
    expect(silent).toEqual({ ok: false, reason: "no segments" });
  });

  it("refuses a pending transcript", () => {
    expect(
      summaryOwed({ kind: "stored", status: "pending", transcriptId: "t-1", segments: 0 })
    ).toEqual({ ok: false, reason: "transcript pending" });
  });

  it("passes through the outcomes where no words were ever heard", () => {
    expect(summaryOwed({ kind: "disabled" })).toEqual({
      ok: false,
      reason: "transcription disabled",
    });
    expect(summaryOwed({ kind: "skipped", reason: "missing recording sid" })).toEqual({
      ok: false,
      reason: "transcript skipped: missing recording sid",
    });
    expect(summaryOwed({ kind: "rejected", reason: "recording_sid" })).toEqual({
      ok: false,
      reason: "transcript rejected: recording_sid",
    });
  });
});

describe("summarizeCall", () => {
  it("writes the patched row and reports counts", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => OK,
    });

    expect(result).toMatchObject({
      kind: "written",
      actionItems: 1,
      buyingSignals: 1,
      truncated: false,
    });
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0] as Activity;
    expect(saved.summary).toBe("Owner wants the agreement Monday.");
    expect(saved.actionItems).toEqual(["Send the agreement Monday"]);
    // inc.1's match provenance is merged, never replaced — it is the only record of whose
    // timeline this call was filed on.
    expect(saved.sourceContext).toMatchObject({
      callSid: "CA1",
      recordingSid: "RE123",
      matchedOn: "to",
      summaryTruncated: false,
    });
    // Not the summariser's business.
    expect(saved.id).toBe(ACTIVITY.id);
    expect(saved.personId).toBe("p-1");
    expect(saved.occurredAt).toBe(ACTIVITY.occurredAt);
    expect(saved.recordingUrl).toBe(ACTIVITY.recordingUrl);
  });

  it("never asks when the transcript is not owed a summary", async () => {
    const save = vi.fn();
    const request = vi.fn();
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: { ...STORED, segments: 0 },
      segments: [],
      request,
    });

    expect(result).toEqual({ kind: "skipped", reason: "no segments" });
    expect(request).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("writes nothing when the answer is refused — a re-delivery cannot blank a summary", async () => {
    const save = vi.fn();
    const result = await summarizeCall(save, {
      activity: { ...ACTIVITY, summary: "an earlier, good summary" },
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({ kind: "rejected", reason: "summary request timed out after 60000ms" }),
    });

    expect(result).toEqual({
      kind: "rejected",
      reason: "summary request timed out after 60000ms",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("reports a disabled key as disabled, not as a failure", async () => {
    const save = vi.fn();
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({ kind: "disabled" }),
    });

    expect(result).toEqual({ kind: "disabled" });
    expect(save).not.toHaveBeenCalled();
  });

  it("passes a client-side skip through with its reason", async () => {
    const save = vi.fn();
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({ kind: "skipped", reason: "no-speech" }),
    });

    expect(result).toEqual({ kind: "skipped", reason: "no-speech" });
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a blank summary rather than storing one", async () => {
    const save = vi.fn();
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({
        kind: "ok",
        value: { summary: "   ", actionItems: [], buyingSignals: [], truncated: false },
      }),
    });

    expect(result).toEqual({ kind: "rejected", reason: "empty summary" });
    expect(save).not.toHaveBeenCalled();
  });

  it("discloses truncation structurally, never in the prose a rep pastes into an email", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const result = await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({
        kind: "ok",
        value: { ...OK.value, truncated: true },
      }),
    });

    expect(result).toMatchObject({ kind: "written", truncated: true });
    const saved = save.mock.calls[0][0] as Activity;
    expect(saved.summary).toBe("Owner wants the agreement Monday.");
    expect(saved.sourceContext).toMatchObject({ summaryTruncated: true });
  });

  it("writes empty arrays for a call with nothing to do — not absent columns", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await summarizeCall(save, {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async () => ({
        kind: "ok",
        value: {
          summary: "Left a voicemail.",
          actionItems: [],
          buyingSignals: [],
          truncated: false,
        },
      }),
    });

    const saved = save.mock.calls[0][0] as Activity;
    // `null` in these columns already means "never summarised"; `[]` is what carries
    // "summarised, nothing to do".
    expect(saved.actionItems).toEqual([]);
    expect(saved.buyingSignals).toEqual([]);
  });

  it("propagates a save failure — nothing retries inside after()", async () => {
    const save = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      summarizeCall(save, {
        activity: ACTIVITY,
        transcript: STORED,
        segments: SEGMENTS,
        request: async () => OK,
      })
    ).rejects.toThrow("db down");
  });

  it("hands the segments it was given to the request, and does not mutate the input row", async () => {
    const seen: unknown[] = [];
    const before = JSON.stringify(ACTIVITY);
    await summarizeCall(vi.fn().mockResolvedValue(undefined), {
      activity: ACTIVITY,
      transcript: STORED,
      segments: SEGMENTS,
      request: async ({ segments }) => {
        seen.push(segments);
        return OK;
      },
    });

    expect(seen[0]).toBe(SEGMENTS);
    expect(JSON.stringify(ACTIVITY)).toBe(before);
  });
});
