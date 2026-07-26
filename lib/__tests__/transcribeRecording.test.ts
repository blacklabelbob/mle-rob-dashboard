// Q68 (c) inc.7 — the join between the provider half and the database half.
//
// What is under test is not transformation (inc.3 owns that) or SQL (inc.6 owns that) but
// WHICH outcomes get a row. Every assertion below is really "what will a human see on this
// call in six months", so the tests care most about the cases where the answer is nothing.

import { describe, expect, it } from "vitest";
import {
  localFailure,
  transcribeRecording,
  type TranscribeInput,
} from "../calls/transcribeRecording";
import type { DeepgramOutcome } from "../calls/deepgramClient";
import { mapDeepgramResponse, type DeepgramMapping } from "../calls/deepgram";
import type { SegmentRow, TranscriptDb, TranscriptRow } from "../calls/transcriptStore";

type DbCall =
  | { op: "transcript"; row: TranscriptRow }
  | { op: "segments"; rows: SegmentRow[] }
  | { op: "prune"; transcriptId: string; fromIdx: number };

function fakeDb(opts: { id?: string; throwOn?: DbCall["op"] } = {}) {
  const calls: DbCall[] = [];
  const db: TranscriptDb = {
    async upsertTranscript(row) {
      calls.push({ op: "transcript", row });
      if (opts.throwOn === "transcript") throw new Error("pg down");
      return opts.id ?? "t-1";
    },
    async upsertSegments(rows) {
      calls.push({ op: "segments", rows });
      if (opts.throwOn === "segments") throw new Error("pg down");
    },
    async pruneSegments(transcriptId, fromIdx) {
      calls.push({ op: "prune", transcriptId, fromIdx });
      if (opts.throwOn === "prune") throw new Error("pg down");
    },
  };
  return { db, calls };
}

const OK_BODY = {
  metadata: { duration: 12.5, models: ["nova-2"] },
  results: {
    utterances: [
      { start: 0, end: 1.5, transcript: "hello there", speaker: 0, confidence: 0.9 },
      { start: 1.5, end: 3, transcript: "hi back", speaker: 1, confidence: 0.8 },
    ],
  },
};

function mappingOf(body: unknown): DeepgramMapping {
  const m = mapDeepgramResponse("RE123", body as never);
  if (!m) throw new Error("fixture has no sid");
  return m;
}

function withOutcome(outcome: DeepgramOutcome, extra: Partial<TranscribeInput> = {}) {
  const seen: unknown[] = [];
  const input: TranscribeInput = {
    recordingSid: "RE123",
    recordingUrl: "https://api.twilio.com/rec.mp3",
    request: async (args) => {
      seen.push(args);
      return outcome;
    },
    ...extra,
  };
  return { input, seen };
}

describe("transcribeRecording — what is owed a row", () => {
  it("stores a complete transcript with its segments", async () => {
    const { db, calls } = fakeDb();
    const { input } = withOutcome({
      kind: "mapped",
      mapping: mappingOf(OK_BODY),
      httpStatus: 200,
    });

    const res = await transcribeRecording(db, input);

    expect(res).toEqual({
      kind: "stored",
      status: "complete",
      transcriptId: "t-1",
      segments: 2,
      httpStatus: 200,
    });
    expect(calls.map((c) => c.op)).toEqual(["transcript", "segments", "prune"]);
    // The prune uses the NEW count so a shrinking re-run cannot strand a stale tail.
    expect(calls[2]).toEqual({ op: "prune", transcriptId: "t-1", fromIdx: 2 });
  });

  it("writes NOTHING when Deepgram is not configured", async () => {
    const { db, calls } = fakeDb();
    const { input } = withOutcome({ kind: "disabled" });

    expect(await transcribeRecording(db, input)).toEqual({ kind: "disabled" });
    // A failed row per unconfigured install would fill the retry queue with calls
    // nobody ever asked about — inc.4's rule, enforced where it becomes visible.
    expect(calls).toEqual([]);
  });

  it("never asks the provider — or the database — without a recording sid", async () => {
    const { db, calls } = fakeDb();
    const { input, seen } = withOutcome({ kind: "disabled" }, { recordingSid: "  " });

    expect(await transcribeRecording(db, input)).toEqual({
      kind: "skipped",
      reason: "missing recording sid",
    });
    expect(seen).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("gives an unusable recording url a VISIBLE failed row, not silence", async () => {
    const { db, calls } = fakeDb();
    const { input } = withOutcome({ kind: "invalid", reason: "unusable recording url" });

    const res = await transcribeRecording(db, input);

    expect(res).toMatchObject({ kind: "stored", status: "failed", segments: 0 });
    const row = calls[0] as Extract<DbCall, { op: "transcript" }>;
    expect(row.row.status).toBe("failed");
    // Our reason travels with the row the same way Deepgram's does — an operator has to
    // be able to tell a bad url from a provider outage without reading logs.
    expect(row.row.error).toContain("unusable recording url");
  });

  it("prunes a failed transcript to zero rather than leaving a previous run's words", async () => {
    const { db, calls } = fakeDb();
    const { input } = withOutcome({
      kind: "mapped",
      mapping: mappingOf({ err_code: "INVALID_AUTH", err_msg: "bad key" }),
      httpStatus: 401,
    });

    const res = await transcribeRecording(db, input);

    expect(res).toMatchObject({ kind: "stored", status: "failed", segments: 0, httpStatus: 401 });
    expect(calls.map((c) => c.op)).toEqual(["transcript", "prune"]);
    expect(calls[1]).toEqual({ op: "prune", transcriptId: "t-1", fromIdx: 0 });
  });

  it("treats an empty transcription as complete-with-nothing, never as a failure", async () => {
    const { db, calls } = fakeDb();
    const { input } = withOutcome({
      kind: "mapped",
      mapping: mappingOf({ results: { channels: [{ alternatives: [{ transcript: "" }] }] } }),
      httpStatus: 200,
    });

    const res = await transcribeRecording(db, input);

    // Silence, a voicemail beep and a hang-up are successful transcriptions of nothing;
    // calling them failures parks them in a retry queue forever.
    expect(res).toMatchObject({ kind: "stored", status: "complete", segments: 0 });
    expect(calls.map((c) => c.op)).toEqual(["transcript", "prune"]);
  });

  it("passes the sid and url straight through to the request half", async () => {
    const { db } = fakeDb();
    const { input, seen } = withOutcome({ kind: "disabled" }, { recordingUrl: "  https://a/b.mp3 " });

    await transcribeRecording(db, input);

    expect(seen[0]).toMatchObject({ recordingSid: "RE123", recordingUrl: "https://a/b.mp3" });
  });

  it("reports a rejection instead of pretending a row exists", async () => {
    const { db, calls } = fakeDb({ id: "   " });
    const { input } = withOutcome({ kind: "mapped", mapping: mappingOf(OK_BODY) });

    expect(await transcribeRecording(db, input)).toEqual({
      kind: "rejected",
      reason: "transcript_id",
    });
    expect(calls.map((c) => c.op)).toEqual(["transcript"]);
  });

  it("lets a database error propagate — a failed write is not a write that never happened", async () => {
    const { db } = fakeDb({ throwOn: "segments" });
    const { input } = withOutcome({ kind: "mapped", mapping: mappingOf(OK_BODY) });

    await expect(transcribeRecording(db, input)).rejects.toThrow("pg down");
  });

  it("is idempotent — a re-delivered recording rebuilds the same rows", async () => {
    const a = fakeDb();
    const b = fakeDb();
    const { input } = withOutcome({ kind: "mapped", mapping: mappingOf(OK_BODY) });

    await transcribeRecording(a.db, { ...input, updatedAt: "2026-07-26T00:00:00.000Z" });
    await transcribeRecording(b.db, { ...input, updatedAt: "2026-07-26T00:00:00.000Z" });

    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });
});

describe("localFailure", () => {
  it("builds failures through the same mapper as the provider's own", () => {
    const m = localFailure("RE1", "unusable recording url");
    expect(m?.transcript).toMatchObject({
      recordingSid: "RE1",
      status: "failed",
      error: "unusable recording url",
    });
    expect(m?.segments).toEqual([]);
  });

  it("refuses to build a row it cannot key", () => {
    expect(localFailure("", "whatever")).toBeNull();
  });
});
