// BUILD-QUEUE Q68 (c) inc.36 — inc.35's TWO READS, BOUND TO 0021.
//
// inc.35 decided the SHAPE of the evidence `planBackfill` consumes and refused to read the
// words to get it. This file is the other half: the PostgREST calls that carry those
// decisions to the database, so the chain `activities → backfillCandidate → THIS →
// planBackfill → runBackfill → processCallRecording` has no unbuilt hop left but the
// operator trigger itself.
//
// Like `transcriptDb`, this is the only file on the backfill branch that knows Supabase
// exists — and it is service-role or nothing, because 0021 has RLS on with zero policies:
// under the anon key every read here returns empty, and an empty evidence map does not read
// as a failure, it reads as "not one call has ever been transcribed" and re-runs the entire
// backlog through two paid providers.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. A FAILED READ THROWS — IT NEVER DEGRADES TO AN EMPTY MAP. This is the same shape as
//     the anon-key failure above: `planBackfill` cannot distinguish "no transcript row" from
//     "we could not ask", and the first is a re-run instruction. A swallowed error here bills
//     Deepgram for every call in the backlog and overwrites nothing it should have skipped.
//
//  2. THE SEGMENT COUNT SHIPS NO ROWS AT ALL. inc.35's rule 1 said the count must not carry
//     words; a `head`-only exact count carries no rows either, which is strictly better on
//     the one table holding verbatim customer speech. It also removes a truncation lie that
//     row-counting cannot avoid: PostgREST caps a select at max-rows, so a call longer than
//     the cap would count short, and — worse — a chunk of transcripts past the cap would
//     count ZERO and be relabelled `complete-but-empty`, re-transcribing finished calls
//     while reporting the provider had returned silence.
//
//  3. A NULL COUNT IS NOT ZERO. PostgREST answers a head count with a number or with
//     nothing; `count ?? 0` is how "the count header was missing" becomes "this call has no
//     words". Absent means unanswered, and unanswered throws (rule 1).
//
//  4. REQUESTS ARE SEQUENTIAL. A backfill exists because a backlog accumulated, so the
//     obvious `Promise.all` over chunks and ids is a burst of dozens of concurrent requests
//     against the same project the dashboard is serving from — the same refusal as
//     `runBackfill`'s rule 2, one layer down.
//
//  5. NO SIDS IS NO ROUND TRIP. An empty candidate list is a real, common answer (nothing
//     was recorded yet); asking `in.()` for nothing costs a request and can only return the
//     empty map we already have.

import type { PostgrestError } from "@supabase/supabase-js";
import type { BackfillState } from "./transcriptBackfill";
import {
  BACKFILL_TRANSCRIPT_COLUMNS,
  backfillStatesFromCounts,
  chunkRecordingSids,
  transcriptIdsToCount,
} from "./backfillState";
import { transcriptClient } from "./transcriptDb";

/** The `select().in()` half — rows, and only the three columns inc.35 named. */
type RowsBuilder = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> & {
  in(column: string, values: readonly string[]): RowsBuilder;
};

/** The head-count half — rule 2: a count, never rows. */
type CountBuilder = PromiseLike<{ count: number | null; error: PostgrestError | null }> & {
  eq(column: string, value: unknown): CountBuilder;
};

export type BackfillStateClient = {
  from(table: string): {
    select(columns: string): RowsBuilder;
    select(columns: string, options: { count: "exact"; head: true }): CountBuilder;
  };
};

function asRow(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * The `call_transcripts` rows for a set of recording sids, chunked (inc.35 rule 4).
 *
 * Chunks are awaited one at a time (rule 4 here) and their rows concatenated in request
 * order, so the caller's newest-first intent survives the split.
 */
export async function fetchTranscriptStateRows(
  client: BackfillStateClient,
  recordingSids: readonly string[]
): Promise<readonly Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkRecordingSids(recordingSids)) {
    const { data, error } = await client
      .from("call_transcripts")
      .select(BACKFILL_TRANSCRIPT_COLUMNS)
      .in("recording_sid", chunk);
    if (error) throw new Error(`call_transcripts backfill read: ${error.message}`);
    for (const raw of data ?? []) {
      const row = asRow(raw);
      if (row) rows.push(row);
    }
  }
  return rows;
}

/**
 * How many segments each transcript holds — counted by the database, not shipped (rule 2).
 *
 * One request per transcript is the price of never pulling a segment row across the wire,
 * and it is the correct trade on this table: the requests are `head`-only, and the
 * alternative is a count that can silently read zero on a finished call.
 */
export async function fetchSegmentCounts(
  client: BackfillStateClient,
  transcriptIds: readonly string[]
): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  for (const id of transcriptIds) {
    const { count, error } = await client
      .from("call_transcript_segments")
      .select("transcript_id", { count: "exact", head: true })
      .eq("transcript_id", id);
    if (error) throw new Error(`call_transcript_segments count: ${error.message}`);
    // Rule 3: no number is not a zero.
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new Error(`call_transcript_segments count: no count returned for ${id}`);
    }
    counts.set(id, count);
  }
  return counts;
}

/**
 * The evidence map `planBackfill` takes, read from 0021.
 *
 * Every recording sid absent from the result is a call 0021 has no transcript row for —
 * which is inc.33's `never-transcribed`, a real answer, because rule 1 guarantees a read
 * that failed threw instead of arriving here as an absence.
 */
export async function loadBackfillStates(
  client: BackfillStateClient,
  recordingSids: readonly string[]
): Promise<ReadonlyMap<string, BackfillState>> {
  // Rule 5.
  if (recordingSids.length === 0) return new Map();
  const rows = await fetchTranscriptStateRows(client, recordingSids);
  if (rows.length === 0) return new Map();
  const counts = await fetchSegmentCounts(client, transcriptIdsToCount(rows));
  return backfillStatesFromCounts(rows, counts);
}

/** The production binding — service role, per the header. */
export function backfillStateClient(): BackfillStateClient {
  return transcriptClient() as unknown as BackfillStateClient;
}
