// BUILD-QUEUE Q68 (c) inc.5: the store write path — a mapping becomes rows in 0021.
//
// This is the increment where the call path first WRITES transcript content. Two halves,
// separated on purpose:
//
//   1. Row shaping (pure). The camelCase -> snake_case translation lives here and ONLY
//      here. A misspelled column is not a type error in the Supabase client — it is a
//      runtime rejection at 3am on a webhook retry, so the mapping gets one home and a
//      test that reads the column names back.
//   2. Execution (thin). Everything that touches the database goes through a tiny
//      injected `TranscriptDb`, so the ordering rules below are tested without Postgres
//      in the room — same shape as inc.4's injected `fetchImpl`.
//
// THE ONE RULE THAT IS NOT OBVIOUS — SEGMENTS ARE REPLACED, NOT MERGED.
// 0021 keys a segment by (transcript_id, idx), so re-running a job upserts segment 7 over
// segment 7. That is right for re-delivery of the SAME payload and wrong for a re-run that
// returns FEWER segments: idx 0..11 from a 12-segment run survive underneath a 5-segment
// one, and the transcript ends with seven utterances from a run we replaced. So a write
// upserts the new segments and then PRUNES everything at idx >= the new count.
//
// The order (upsert, then prune) is itself load-bearing. Delete-then-insert would leave a
// `complete` transcript with zero segments if the insert failed in between — a call that
// reads on screen as "transcribed, said nothing". Upsert-then-prune's worst intermediate
// state is a transcript carrying a stale tail, which is visible and self-heals on the next
// run. Prefer a wrong-looking row you can see over a missing one you cannot.

import type { DeepgramMapping } from "./deepgram";
import {
  transcriptKey,
  transcriptRowRejection,
  type CallTranscript,
  type TranscriptSegment,
} from "./transcriptSegments";

/** A `call_transcripts` row, in 0021's own column names. */
export type TranscriptRow = {
  recording_sid: string;
  activity_id: string | null;
  status: string;
  provider: string;
  model: string | null;
  language: string | null;
  duration_ms: number | null;
  error: string | null;
  updated_at?: string;
};

/** A `call_transcript_segments` row, in 0021's own column names. */
export type SegmentRow = {
  transcript_id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
  confidence: number | null;
};

/**
 * Shape a transcript for 0021.
 *
 * Absent optional values become explicit `null`, never omitted keys: an upsert that omits
 * a column leaves the PREVIOUS run's value in place, so a re-run that no longer detects a
 * language would silently keep the old one and read as current.
 *
 * `updated_at` is passed in rather than read from the clock — this file stays pure so the
 * rows two runs produce are byte-comparable in a test.
 */
export function transcriptRow(t: CallTranscript, updatedAt?: string): TranscriptRow {
  return {
    recording_sid: t.recordingSid.trim(),
    activity_id: t.activityId?.trim() || null,
    status: t.status,
    provider: t.provider.trim(),
    model: t.model?.trim() || null,
    language: t.language?.trim() || null,
    duration_ms: t.durationMs ?? null,
    error: t.error?.trim() || null,
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}

/** Shape segments for 0021. `idx` is taken as given — `normalizeSegments` already owns it. */
export function segmentRows(
  transcriptId: string,
  segments: readonly TranscriptSegment[]
): SegmentRow[] {
  return segments.map((s) => ({
    transcript_id: transcriptId,
    idx: s.idx,
    start_ms: s.startMs,
    end_ms: s.endMs,
    speaker: s.speaker?.trim() || null,
    text: s.text,
    confidence: s.confidence ?? null,
  }));
}

/**
 * Do this mapping's segments belong in the database?
 *
 * Only a `complete` transcript carries words. A `pending` row is a job we have not heard
 * back from and a `failed` row is one that errored — writing segments under either would
 * make "we have the words" true for a call we do not have the words for, and 0021 has no
 * constraint that catches it because the tables are deliberately separate.
 */
export function writesSegments(t: CallTranscript): boolean {
  return t.status === "complete";
}

/** Minimal database surface. Injected so the ordering rules test without Postgres. */
export type TranscriptDb = {
  /** Upsert on `recording_sid`, returning the transcript's id. */
  upsertTranscript(row: TranscriptRow): Promise<string>;
  /** Upsert on (transcript_id, idx). */
  upsertSegments(rows: SegmentRow[]): Promise<void>;
  /** Delete segments of `transcriptId` at `idx >= fromIdx`. */
  pruneSegments(transcriptId: string, fromIdx: number): Promise<void>;
};

export type PersistResult =
  /** Nothing was written, and nothing should have been. The reason is the failed check. */
  | { kind: "rejected"; reason: string }
  /** The transcript row is in place; `segments` is how many segment rows it now has. */
  | { kind: "written"; transcriptId: string; segments: number; pruned: boolean };

/**
 * Write a provider mapping into 0021.
 *
 * Validation happens BEFORE the first write, not as a caught Postgres error: by the time a
 * CHECK rejects the transcript row we may already have paid for the round trip, and by the
 * time it rejects a segment we would have written a transcript claiming segments that
 * never landed. `transcriptRowRejection` mirrors those CHECKs exactly (inc.2), so this is
 * the same verdict, taken earlier and for free.
 *
 * Segment-level validation is not repeated here — `normalizeSegments` already dropped the
 * unstorable ones and reported them in `mapping.rejected`. Re-checking would be a second
 * copy of 0021's constraints, which is a second place for them to drift.
 */
export async function persistTranscript(
  db: TranscriptDb,
  mapping: DeepgramMapping,
  updatedAt?: string
): Promise<PersistResult> {
  const t = mapping.transcript;
  if (!transcriptKey(t.recordingSid)) return { kind: "rejected", reason: "recording_sid" };

  const rejection = transcriptRowRejection(t);
  if (rejection) return { kind: "rejected", reason: rejection };

  const transcriptId = await db.upsertTranscript(transcriptRow(t, updatedAt));
  if (!transcriptId.trim()) return { kind: "rejected", reason: "transcript_id" };

  if (!writesSegments(t)) {
    // A call that failed or is still pending must not keep words from an earlier run —
    // that is how a retried transcript ends up displaying its own superseded output.
    await db.pruneSegments(transcriptId, 0);
    return { kind: "written", transcriptId, segments: 0, pruned: true };
  }

  const rows = segmentRows(transcriptId, mapping.segments);
  if (rows.length) await db.upsertSegments(rows);
  await db.pruneSegments(transcriptId, rows.length);

  return { kind: "written", transcriptId, segments: rows.length, pruned: true };
}
