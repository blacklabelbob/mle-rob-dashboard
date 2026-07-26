// BUILD-QUEUE Q68 (c) inc.6: the concrete database behind inc.5's injected `TranscriptDb`.
//
// inc.5 decided WHAT gets written and in WHICH ORDER (upsert the new segments, then prune
// the stale tail) against an interface. This file is the other half: the three PostgREST
// calls that carry those decisions to 0021. It is deliberately the only file in the call
// path that knows Supabase exists.
//
// THE CONFLICT TARGETS ARE THE WHOLE POINT.
// `upsert()` without `onConflict` resolves against the PRIMARY KEY, and both 0021 tables
// key on a `gen_random_uuid()` id we never send. So a default upsert is an INSERT: the
// re-POSTed Twilio webhook that inc.1/inc.2 built the derived ids to absorb would instead
// hit `recording_sid`'s unique index and come back 23505 — a 500, another Twilio retry,
// and a call that can never finish transcribing. Naming the target is not a tuning knob;
// it is the difference between idempotent and permanently broken under retry. Both targets
// are pinned by tests against the exact index names 0021 creates.
//
// SERVICE ROLE, NEVER ANON. 0021 has RLS on with zero policies (verbatim customer speech,
// on a prod that is currently unauthenticated by Rob's 7/21 call). Under the anon key every
// write here silently affects zero rows and every read returns empty — a failure mode that
// looks exactly like "no calls yet". The client is built from the service key or not at all.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SegmentRow, TranscriptDb, TranscriptRow } from "./transcriptStore";
import {
  SEGMENT_READ_COLUMNS,
  TRANSCRIPT_READ_COLUMNS,
  type TranscriptReader,
} from "./transcriptRead";

/** 0021's unique indexes, named once. These strings ARE the idempotence guarantee. */
export const TRANSCRIPT_CONFLICT = "recording_sid";
export const SEGMENT_CONFLICT = "transcript_id,idx";

/**
 * How many segment rows travel in one request.
 *
 * An hour-long diarised call is thousands of utterances, and a single request carrying all
 * of them is one 100MB-limit or statement-timeout away from failing whole. Chunking makes a
 * failure partial instead of total, which inc.5's ordering already tolerates: the prune runs
 * only after every chunk resolves, so a mid-run failure leaves a transcript with a stale
 * tail — visible, and healed by the next run — never a `complete` transcript with no words.
 */
export const SEGMENT_CHUNK = 500;

/**
 * The slice of the Supabase client this file uses.
 *
 * Narrow on purpose: it is what lets the conflict targets, the chunking and the prune
 * bounds be asserted in tests without Postgres or a network in the room — the same
 * injection idiom as inc.4's `fetchImpl` and inc.5's `TranscriptDb`.
 */
type PostgrestError = { message: string };

/**
 * What `upsert()` hands back: awaitable on its own (the segment path) and chainable into
 * `.select().single()` (the transcript path, which needs the id the write produced).
 */
type UpsertBuilder = PromiseLike<{ error: PostgrestError | null }> & {
  select(columns: string): {
    single(): Promise<{ data: { id?: unknown } | null; error: PostgrestError | null }>;
  };
};

export type TranscriptClient = {
  from(table: string): {
    upsert(rows: unknown, options?: { onConflict?: string }): UpsertBuilder;
    delete(): {
      eq(column: string, value: unknown): {
        gte(column: string, value: unknown): PromiseLike<{ error: PostgrestError | null }>;
      };
    };
  };
};

/**
 * Bind inc.5's write path to a real database.
 *
 * Every error is rethrown carrying PostgREST's own message. inc.5's contract is that a
 * database error propagates rather than being reported as a write that did not happen, and
 * the propagated message is what tells a 3am reader whether they are looking at a CHECK
 * (fix the mapping) or a timeout (retry it).
 */
export function supabaseTranscriptDb(client: TranscriptClient): TranscriptDb {
  return {
    async upsertTranscript(row: TranscriptRow): Promise<string> {
      const { data, error } = await client
        .from("call_transcripts")
        .upsert(row, { onConflict: TRANSCRIPT_CONFLICT })
        .select("id")
        .single();
      if (error) throw new Error(`call_transcripts upsert: ${error.message}`);
      // The id comes back from the write itself. Re-selecting by recording_sid afterwards
      // would be a second round trip that can observe a different row than the one we just
      // wrote, and inc.5 keys every segment on this value.
      const id = typeof data?.id === "string" ? data.id.trim() : "";
      if (!id) throw new Error("call_transcripts upsert: no id returned");
      return id;
    },

    async upsertSegments(rows: SegmentRow[]): Promise<void> {
      // An empty upsert is a request that can only fail or do nothing; inc.5 already
      // guards it, and this guard makes that independent of the caller.
      if (!rows.length) return;
      for (let i = 0; i < rows.length; i += SEGMENT_CHUNK) {
        const chunk = rows.slice(i, i + SEGMENT_CHUNK);
        const { error } = await client
          .from("call_transcript_segments")
          .upsert(chunk, { onConflict: SEGMENT_CONFLICT });
        if (error) throw new Error(`call_transcript_segments upsert: ${error.message}`);
      }
    },

    async pruneSegments(transcriptId: string, fromIdx: number): Promise<void> {
      // `gte`, not `gt`: inc.5 passes the NEW segment count, so idx === count is already
      // one past the last row we wrote and is stale. `gt` would strand exactly one
      // superseded utterance at the end of every shrinking re-run.
      //
      // fromIdx 0 is a real instruction (a failed or pending transcript must keep no
      // words), never a no-op — the guard that would "protect" it is the bug.
      const { error } = await client
        .from("call_transcript_segments")
        .delete()
        .eq("transcript_id", transcriptId)
        .gte("idx", Math.max(0, Math.trunc(fromIdx)));
      if (error) throw new Error(`call_transcript_segments prune: ${error.message}`);
    },
  };
}

/**
 * The read half (inc.16), typed apart from the write client on purpose: the write path must
 * not grow a `select` it can reach by accident, and this shape is what lets the keyset paging
 * be asserted without Postgres.
 */
type ReadBuilder = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> & {
  eq(column: string, value: unknown): ReadBuilder;
  gte(column: string, value: unknown): ReadBuilder;
  order(column: string, options: { ascending: boolean }): ReadBuilder;
  limit(count: number): ReadBuilder;
  maybeSingle(): Promise<{ data: unknown; error: PostgrestError | null }>;
};

export type TranscriptReadClient = {
  from(table: string): { select(columns: string): ReadBuilder };
};

function asRow(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Bind inc.16's read path to a real database.
 *
 * `order("idx")` is issued on the SERVER, not sorted after the fact: the keyset cursor is
 * only sound if each page arrives in idx order, and PostgREST's row order without an
 * explicit `order` is whatever the plan produced.
 */
export function supabaseTranscriptReader(client: TranscriptReadClient): TranscriptReader {
  return {
    async fetchTranscript(recordingSid: string) {
      const { data, error } = await client
        .from("call_transcripts")
        .select(TRANSCRIPT_READ_COLUMNS)
        .eq("recording_sid", recordingSid)
        .maybeSingle();
      // A missing row is `data: null` with no error — the caller's `missing`, which is a
      // real answer. Only a genuine failure throws, so "the query broke" can never be
      // rendered as "this call was never transcribed".
      if (error) throw new Error(`call_transcripts read: ${error.message}`);
      return asRow(data);
    },

    async fetchSegments(transcriptId: string, fromIdx: number, limit: number) {
      const { data, error } = await client
        .from("call_transcript_segments")
        .select(SEGMENT_READ_COLUMNS)
        .eq("transcript_id", transcriptId)
        .gte("idx", Math.max(0, Math.trunc(fromIdx)))
        .order("idx", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`call_transcript_segments read: ${error.message}`);
      return (data ?? []).map(asRow).filter((r): r is Record<string, unknown> => r !== null);
    },
  };
}

let client: SupabaseClient | null = null;

/** Service-role client for 0021. Server-side only — same idiom as supabaseStore/esignDb. */
export function transcriptClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("call transcripts: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** The `TranscriptDb` inc.5's `persistTranscript` runs against in production. */
export function transcriptDb(): TranscriptDb {
  return supabaseTranscriptDb(transcriptClient() as unknown as TranscriptClient);
}

/** The `TranscriptReader` inc.16's `loadTranscript` runs against in production. */
export function transcriptReader(): TranscriptReader {
  return supabaseTranscriptReader(transcriptClient() as unknown as TranscriptReadClient);
}
