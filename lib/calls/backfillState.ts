// BUILD-QUEUE Q68 (c) inc.35 — WHAT 0021 ALREADY HOLDS, ANSWERED WITHOUT READING THE WORDS.
//
// inc.33 decides which filed recordings still owe a transcript and inc.34 executes that
// decision, but `planBackfill` is handed its evidence: a `Map<recordingSid, {status,
// segmentCount}>` that something has to build from the database. That builder is the one
// unbuilt hop between the two halves and the operator trigger (admin route/CLI) that
// invokes them — and it is not a formality, because the obvious implementation of it
// (`loadTranscript` per sid) pulls every utterance of every call through the process in
// order to call `.length` on them.
//
// Pure per CR-3: no clock, no network, no env, no store. This file decides the SHAPE of
// the two reads and maps their rows; `transcriptDb` binds them to PostgREST next.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. COUNT WITHOUT WORDS. The segment read selects `transcript_id` and nothing else. The
//     plan needs a count — "does this call have words yet" — and 0021 was given RLS-on /
//     zero-policies / nothing to `dashboard_ro` precisely because it holds verbatim
//     customer speech. An operator-triggered pass that drags every sentence of every call
//     into memory (and one thrown error away into a log) to compute an integer would undo
//     that on the least-audited path in the system.
//
//  2. AN UNREADABLE ROW IS NOT A TRANSCRIBED CALL. A row with a blank sid, no id, or a
//     status 0021's CHECK could not have produced is DROPPED, so its call reads as
//     never-transcribed and is re-run. The trade is stated: a re-run costs a Deepgram
//     call, and the write path is idempotent on `recording_sid`, so the cost of being
//     wrong here is money. Counting it as done costs a call that is never repaired and
//     nobody ever learns is missing — silent, and the more expensive of the two.
//
//  3. ZERO SEGMENTS IS A REAL ANSWER, NOT AN ABSENCE. A transcript with no segment rows
//     maps to `segmentCount: 0`, never to a missing map entry. That distinction IS
//     inc.33's rule 3: a `complete` transcript with zero segments is `complete-but-empty`
//     and must re-run, while dropping it to an absence would relabel it
//     `never-transcribed` — the same re-run today, but a wrong reason in the log, and the
//     one signal that would tell an operator the provider is returning silence.
//
//  4. SIDS TRAVEL CHUNKED. A PostgREST `in.()` filter rides in the URL; a backlog of
//     thousands of recordings is a 414 that fails the WHOLE pass rather than a page of it.
//     Chunks preserve the caller's order so a capped pass keeps inc.33's newest-first
//     intent, and dedupe first because a repeated sid is a wasted round trip and a second
//     row competing for one map key.
//
//  5. THE FIRST ROW FOR A SID WINS, AND IS NOT MERGED. `recording_sid` is unique in 0021,
//     so two rows for one sid means the database is not what we think it is; silently
//     summing their segment counts would paper over that with a plausible number.

import type { BackfillState } from "./transcriptBackfill";
import { parseTranscriptStatus } from "./transcriptRead";

/**
 * The only columns either read asks for.
 *
 * `text` is absent from the segment list and that absence is rule 1 — it is pinned by a
 * test so no later "while we're here" edit can widen it.
 */
export const BACKFILL_TRANSCRIPT_COLUMNS = "id,recording_sid,status";
export const BACKFILL_SEGMENT_COLUMNS = "transcript_id";

/**
 * How many recording sids ride in one `in.()` filter.
 *
 * Twilio sids are 34 characters, so 100 of them plus separators is a filter of ~3.5KB —
 * comfortably inside every proxy's URL limit with room for the rest of the query.
 */
export const BACKFILL_SID_CHUNK = 100;

/** One `call_transcripts` row, reduced to what the plan needs. */
export type TranscriptStateRow = {
  transcriptId: string;
  recordingSid: string;
  status: BackfillState["status"];
};

/**
 * Split sids into request-sized batches, deduped, order preserved (rule 4).
 *
 * Blank entries are dropped rather than sent: `in.("")` matches nothing but still costs a
 * round trip, and 0021 forbids a blank sid anyway.
 */
export function chunkRecordingSids(
  sids: readonly string[],
  size: number = BACKFILL_SID_CHUNK
): readonly (readonly string[])[] {
  const limit = Math.max(1, Math.trunc(size));
  const seen = new Set<string>();
  const chunks: string[][] = [];
  for (const raw of sids) {
    const sid = (raw ?? "").trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    if (chunks.length === 0 || chunks[chunks.length - 1].length >= limit) chunks.push([]);
    chunks[chunks.length - 1].push(sid);
  }
  return chunks;
}

/**
 * Map one `call_transcripts` row, or refuse it (rule 2).
 *
 * `parseTranscriptStatus` is reused rather than re-tested against a string literal here —
 * a second copy of the status vocabulary is how a future 0021 status silently becomes
 * "unknown" on one path and valid on another.
 */
export function transcriptStateRow(row: Record<string, unknown>): TranscriptStateRow | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const sid = typeof row.recording_sid === "string" ? row.recording_sid.trim() : "";
  const status = parseTranscriptStatus(row.status);
  if (!id || !sid || !status) return null;
  return { transcriptId: id, recordingSid: sid, status };
}

/**
 * Tally segment rows by transcript id.
 *
 * The rows carry no words (rule 1), so this is counting ids. A row without a usable
 * transcript_id is not counted — it belongs to no transcript we can name, and attributing
 * it to any of them would inflate exactly the number rule 3 depends on.
 */
export function tallySegmentCounts(
  rows: readonly Record<string, unknown>[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = typeof row.transcript_id === "string" ? row.transcript_id.trim() : "";
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The evidence `planBackfill` consumes.
 *
 * A transcript missing from `counts` is a transcript with zero segments — rule 3 — not a
 * transcript we failed to ask about: the segment read covers every id in `transcriptRows`,
 * so absence there is a real zero.
 */
export function backfillStates(
  transcriptRows: readonly Record<string, unknown>[],
  segmentRows: readonly Record<string, unknown>[]
): ReadonlyMap<string, BackfillState> {
  const counts = tallySegmentCounts(segmentRows);
  const states = new Map<string, BackfillState>();
  for (const raw of transcriptRows) {
    const row = transcriptStateRow(raw);
    if (!row) continue;
    // Rule 5: a duplicate sid is a broken invariant, not two halves of one answer.
    if (states.has(row.recordingSid)) continue;
    states.set(row.recordingSid, {
      status: row.status,
      segmentCount: counts.get(row.transcriptId) ?? 0,
    });
  }
  return states;
}

/** The transcript ids a segment count pass must cover, in row order and deduped. */
export function transcriptIdsToCount(
  transcriptRows: readonly Record<string, unknown>[]
): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of transcriptRows) {
    const row = transcriptStateRow(raw);
    if (!row || seen.has(row.transcriptId)) continue;
    seen.add(row.transcriptId);
    ids.push(row.transcriptId);
  }
  return ids;
}
