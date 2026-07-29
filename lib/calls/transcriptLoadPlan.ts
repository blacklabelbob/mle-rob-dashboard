// Q71 Phase 4, items 2-4: what a Fireflies load WOULD do, and whether it did it.
//
// Pure per CR-3 — no filesystem, no network, no clock. The CLI
// (`scripts/transcripts-to-supabase.mjs`) owns every read; this file owns every verdict,
// so both the dry run and the `--verify` pass can be graded without Supabase in the room.
//
// The split exists because of what the load is actually risking. Writing 4,451 segments is
// the easy half; knowing BEFOREHAND that it is 4,451 and not 4,450 — and knowing AFTERWARDS
// that the database agrees — is the half that catches a silently-dropped sentence. A loader
// that only prints "done" cannot tell a successful load from one that wrote nothing.

import { mapFirefliesTranscript, type FirefliesTranscript } from "./firefliesMapping";

/** One file's fate, decided before anything is written. */
export type LoadPlanEntry = {
  /** The file's name on disk, so a rejection can be traced back to something openable. */
  source: string;
  /** `fireflies-<id>`, or null when the file has no usable id and cannot be loaded. */
  recordingSid: string | null;
  /** Sentences the file claims, straight off the array length — the disk-side truth. */
  sentences: number;
  /** Segments that would be written after `normalizeSegments` had its say. */
  segments: number;
  /** Sentences `normalizeSegments` refused, itemised by it. */
  rejected: number;
  /** Present only when this file cannot be loaded at all. */
  skipped?: string;
};

export type LoadPlan = {
  entries: LoadPlanEntry[];
  /** Files that would produce a transcript row. */
  loadable: number;
  /** Files that would be skipped, with reasons on the entries. */
  skipped: number;
  /** Total segment rows the load would write. The number the DoD counts. */
  segments: number;
  /** Total sentences rejected across every file. */
  rejected: number;
};

function sentenceCount(file: unknown): number {
  const s = (file as { sentences?: unknown } | null)?.sentences;
  return Array.isArray(s) ? s.length : 0;
}

/**
 * Decide, for every file, what the load would write.
 *
 * Nothing here is conditional on a flag: the dry run and the real load plan the SAME way,
 * because a preview that takes a different path from the write it previews is a preview of
 * nothing. `--apply` differs only in whether the plan is then executed.
 */
export function planTranscriptLoad(
  files: readonly { source: string; data: FirefliesTranscript | null }[]
): LoadPlan {
  const entries: LoadPlanEntry[] = files.map(({ source, data }) => {
    const sentences = sentenceCount(data);
    const mapping = mapFirefliesTranscript(data);
    if (!mapping) {
      // No id means no stable key, which means no idempotency — re-running would stack a
      // fresh duplicate every time. Skipping is the conservative half of that trade.
      return { source, recordingSid: null, sentences, segments: 0, rejected: 0, skipped: "no id" };
    }
    return {
      source,
      recordingSid: mapping.transcript.recordingSid,
      sentences,
      segments: mapping.segments.length,
      rejected: mapping.rejected.length,
    };
  });

  return {
    entries,
    loadable: entries.filter((e) => !e.skipped).length,
    skipped: entries.filter((e) => e.skipped).length,
    segments: entries.reduce((n, e) => n + e.segments, 0),
    rejected: entries.reduce((n, e) => n + e.rejected, 0),
  };
}

/** What the database reported for one transcript. `null` = the row is not there at all. */
export type ObservedCount = { recordingSid: string; segments: number | null };

export type VerifyRow = {
  source: string;
  recordingSid: string;
  expected: number;
  /** null when no `call_transcripts` row exists for this sid. */
  actual: number | null;
  ok: boolean;
  /** Why it failed, in words a log line can carry. Absent when `ok`. */
  detail?: string;
};

export type VerifyReport = {
  rows: VerifyRow[];
  matched: number;
  /** Files the plan could load — the denominator in `13/13 match`. */
  total: number;
  ok: boolean;
  summary: string;
};

/**
 * Compare a plan against what the database actually holds.
 *
 * A MISSING row and a SHORT row are both failures and are reported differently on purpose:
 * missing means the load never ran (or ran against another project), short means it ran and
 * lost rows. Those have different fixes, so collapsing them into "mismatch" would throw away
 * the only information that tells you which one happened.
 *
 * Skipped files are excluded from the denominator rather than counted as failures — they
 * were never going to be written, and a verifier that fails on its own plan can never
 * report success.
 */
export function verifyLoad(plan: LoadPlan, observed: readonly ObservedCount[]): VerifyReport {
  const seen = new Map(observed.map((o) => [o.recordingSid, o.segments]));

  const rows: VerifyRow[] = plan.entries
    .filter((e): e is LoadPlanEntry & { recordingSid: string } => !e.skipped && !!e.recordingSid)
    .map((e) => {
      // `undefined` (never queried) and `null` (queried, absent) are both "no row" to the
      // reader, but only the second is a fact about the database. Both fail; neither is
      // allowed to read as 0 segments, which would look like an empty meeting.
      const actual = seen.has(e.recordingSid) ? (seen.get(e.recordingSid) ?? null) : null;
      if (actual === null) {
        return { source: e.source, recordingSid: e.recordingSid, expected: e.segments, actual: null, ok: false, detail: "no transcript row" };
      }
      if (actual !== e.segments) {
        return { source: e.source, recordingSid: e.recordingSid, expected: e.segments, actual, ok: false, detail: `expected ${e.segments}, found ${actual}` };
      }
      return { source: e.source, recordingSid: e.recordingSid, expected: e.segments, actual, ok: true };
    });

  const matched = rows.filter((r) => r.ok).length;
  const total = rows.length;
  return {
    rows,
    matched,
    total,
    // An empty plan is NOT a pass. `0/0 match` is the shape a broken directory read takes,
    // and it is exactly the case a green checkmark would hide.
    ok: total > 0 && matched === total,
    summary: `${matched}/${total} match`,
  };
}
