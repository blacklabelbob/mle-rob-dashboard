// BUILD-QUEUE Q68 (b) inc.16 — THE DB READ: segments back OUT of 0021.
//
// inc.15 built the projection (rows -> turns) and had nothing to feed it: every path into
// 0021 since inc.2 has been a write, so the words sat in Postgres with no way back. This is
// the inverse of inc.5's `transcriptRow`/`segmentRows` — the snake_case -> camelCase half —
// plus the loader that pages a call's segments out and hands them to `transcriptView`.
//
// The mapping lives in ONE file in each direction on purpose: a column renamed on the write
// side and not the read side is not a type error, it is a transcript that stores fine and
// comes back blank.
//
// THREE RULES THAT ARE NOT OBVIOUS:
//
//  1. A MISSING TRANSCRIPT ROW IS `missing`, NEVER `pending`. 0021 is two tables precisely so
//     "requested, not back yet" and "never requested" stay apart (its own header says so). A
//     loader that returned `pending` for a call with no row would tell a rep to wait for a
//     job nobody ever started — and would tell a retry there is nothing to start.
//
//  2. A ROW WE CANNOT READ IS `unreadable`, NEVER COERCED. If `status` comes back as
//     something outside 0021's CHECK (a hand-edited row, a future migration read by old
//     code), defaulting it to `failed` invents a failure and defaulting it to `complete`
//     publishes words under a state we did not verify. The reason travels with the result so
//     it can be logged and flagged, the same shape as `/api/views`'s `broken[]`.
//
//  3. `idx` IS TAKEN FROM THE DATABASE, NEVER REASSIGNED. `normalizeSegments` owns idx at
//     WRITE time; re-deriving it on read would renumber a stored transcript against the
//     index a click seeks to. Unstorable rows are dropped and counted (they cannot exist
//     given 0021's CHECKs — which is exactly why one appearing must be reported, not fixed).

import {
  segmentRejection,
  TRANSCRIPT_STATUSES,
  type CallTranscript,
  type TranscriptSegment,
  type TranscriptStatus,
} from "./transcriptSegments";
import { transcriptView, type TranscriptView } from "./transcriptView";

/** How many segment rows come back per request. See `loadSegments` for why paging exists. */
export const READ_PAGE = 500;

/** The columns this file reads. Named so a select never silently drops one. */
export const TRANSCRIPT_READ_COLUMNS =
  "id,recording_sid,activity_id,status,provider,model,language,duration_ms,error";
export const SEGMENT_READ_COLUMNS = "idx,start_ms,end_ms,speaker,text,confidence";

/** A stored transcript, with the row id its segments hang off. */
export type StoredTranscript = CallTranscript & { id: string };

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function intOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** 0021's `status`, or null when it is not one of the three we know. Never guessed. */
export function parseTranscriptStatus(v: unknown): TranscriptStatus | null {
  return TRANSCRIPT_STATUSES.find((s) => s === v) ?? null;
}

/**
 * A `call_transcripts` row as the rest of the call path speaks it.
 *
 * Returns the failing column name instead of a row when the row cannot be trusted: `id` and
 * `recording_sid` are identity (segments are fetched by the first, idempotence keys on the
 * second) and `status` decides whether words may be shown at all.
 */
export function transcriptFromRow(
  row: Record<string, unknown>
): { transcript: StoredTranscript } | { reason: string } {
  const id = text(row.id);
  if (!id) return { reason: "id" };
  const recordingSid = text(row.recording_sid);
  if (!recordingSid) return { reason: "recording_sid" };
  const status = parseTranscriptStatus(row.status);
  if (!status) return { reason: "status" };
  const provider = text(row.provider);
  if (!provider) return { reason: "provider" };

  return {
    transcript: {
      id,
      recordingSid,
      status,
      provider,
      ...(text(row.activity_id) ? { activityId: text(row.activity_id) } : {}),
      ...(text(row.model) ? { model: text(row.model) } : {}),
      ...(text(row.language) ? { language: text(row.language) } : {}),
      ...(intOrUndefined(row.duration_ms) !== undefined
        ? { durationMs: intOrUndefined(row.duration_ms) }
        : {}),
      ...(text(row.error) ? { error: text(row.error) } : {}),
    },
  };
}

/**
 * A `call_transcript_segments` row.
 *
 * `confidence` arrives from a `real` column, so it is a float and stays one; `idx`/`start_ms`
 * /`end_ms` are integers in 0021 and a non-integer here means the row is not what we wrote,
 * which `segmentRejection` catches rather than this function re-deciding.
 */
export function segmentFromRow(row: Record<string, unknown>): TranscriptSegment | null {
  const seg: TranscriptSegment = {
    idx: typeof row.idx === "number" ? row.idx : NaN,
    startMs: typeof row.start_ms === "number" ? row.start_ms : NaN,
    endMs: typeof row.end_ms === "number" ? row.end_ms : NaN,
    text: typeof row.text === "string" ? row.text : "",
    ...(text(row.speaker) ? { speaker: text(row.speaker) } : {}),
    ...(typeof row.confidence === "number" && Number.isFinite(row.confidence)
      ? { confidence: row.confidence }
      : {}),
  };
  return segmentRejection(seg) ? null : seg;
}

/** Minimal read surface. Injected so paging and ordering test without Postgres. */
export type TranscriptReader = {
  /** The transcript for a recording, or null when none has ever been requested. */
  fetchTranscript(recordingSid: string): Promise<Record<string, unknown> | null>;
  /** Up to `limit` segments of `transcriptId` at `idx >= fromIdx`, in idx order. */
  fetchSegments(
    transcriptId: string,
    fromIdx: number,
    limit: number
  ): Promise<Record<string, unknown>[]>;
};

export type LoadedTranscript = {
  transcript: StoredTranscript;
  segments: TranscriptSegment[];
  /** Rows 0021 should have made impossible. Counted so a real one gets noticed. */
  droppedSegments: number;
};

export type TranscriptLoad =
  /** No transcript row for this recording. NOT the same as `pending`. */
  | { kind: "missing" }
  /** A row exists and cannot be trusted; `reason` is the column. Never coerced. */
  | { kind: "unreadable"; reason: string }
  | ({ kind: "loaded" } & LoadedTranscript);

/**
 * Page a transcript's segments out.
 *
 * Paging is not premature: PostgREST caps a response (1000 rows by default) and an
 * hour-long diarised call is thousands of utterances, so an unpaged read TRUNCATES — and a
 * truncated transcript reads as a complete one that stops mid-call, which is worse than an
 * error because nobody can see it happened.
 *
 * The cursor is KEYSET (`idx >= last + 1`), not an offset. inc.5's write path prunes the
 * stale tail of a shrinking re-run, and a prune landing between two offset-paged requests
 * shifts every later row up — silently skipping segments. (transcript_id, idx) is unique, so
 * a keyset cursor cannot skip or repeat whatever else is happening to the table.
 */
export async function loadSegments(
  reader: TranscriptReader,
  transcriptId: string,
  pageSize = READ_PAGE
): Promise<{ segments: TranscriptSegment[]; dropped: number }> {
  const segments: TranscriptSegment[] = [];
  let dropped = 0;
  let cursor = 0;

  for (;;) {
    const rows = await reader.fetchSegments(transcriptId, cursor, pageSize);
    if (!rows.length) break;

    let maxIdx = cursor;
    for (const row of rows) {
      const seg = segmentFromRow(row);
      if (!seg) {
        dropped++;
        // A row we cannot map still moves the cursor, or the next page starts where this
        // one did and the loop never ends.
        const idx = typeof row.idx === "number" ? row.idx : maxIdx;
        maxIdx = Math.max(maxIdx, idx);
        continue;
      }
      segments.push(seg);
      maxIdx = Math.max(maxIdx, seg.idx);
    }

    if (rows.length < pageSize) break;
    cursor = maxIdx + 1;
  }

  return { segments, dropped };
}

/** A recording's stored transcript, or the specific reason there isn't one to show. */
export async function loadTranscript(
  reader: TranscriptReader,
  recordingSid: string,
  pageSize = READ_PAGE
): Promise<TranscriptLoad> {
  const sid = recordingSid.trim();
  if (!sid) return { kind: "unreadable", reason: "recording_sid" };

  const row = await reader.fetchTranscript(sid);
  if (!row) return { kind: "missing" };

  const parsed = transcriptFromRow(row);
  if ("reason" in parsed) return { kind: "unreadable", reason: parsed.reason };

  // Only a `complete` transcript has words to fetch. Skipping the query for the other two
  // is not an optimisation: inc.5 prunes their segments to zero, so a row returned under
  // `pending` or `failed` is stale by definition and must not reach a reader.
  if (parsed.transcript.status !== "complete") {
    return { kind: "loaded", transcript: parsed.transcript, segments: [], droppedSegments: 0 };
  }

  const { segments, dropped } = await loadSegments(reader, parsed.transcript.id, pageSize);
  return {
    kind: "loaded",
    transcript: parsed.transcript,
    segments,
    droppedSegments: dropped,
  };
}

/**
 * What a reader is shown for a recording.
 *
 * `missing` becomes `pending` ONLY here and only because the caller asked for a view rather
 * than a state: a call with no transcript row and a call whose job has not returned look the
 * same to a rep (no words yet, nothing to do). The distinction survives on `load` for the
 * retry path, which is the code that actually needs it.
 */
export async function readTranscriptView(
  reader: TranscriptReader,
  recordingSid: string,
  pageSize = READ_PAGE
): Promise<{ view: TranscriptView; load: TranscriptLoad }> {
  const load = await loadTranscript(reader, recordingSid, pageSize);
  if (load.kind === "loaded") {
    return { view: transcriptView(load.transcript.status, load.segments), load };
  }
  // An unreadable row is `failed` to the reader — the one state that shows no words and
  // does not promise more are coming. Its reason is on `load`, for the log and the flag.
  const state = load.kind === "missing" ? "pending" : "failed";
  return { view: { state, turns: [], speakerCount: 0, endMs: null }, load };
}
