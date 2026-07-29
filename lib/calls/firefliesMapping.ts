// Q71 Phase 4, item 1: what a Fireflies meeting export is allowed to become in 0021.
//
// Pure per CR-3 — no network, no clock, no filesystem. The script that reads the 13 files
// and writes them to Supabase is a separate item and is GATED on Rob's answer ("may the
// transcripts load into prod?"). This file is not gated: deciding the mapping is the part
// that can be quietly wrong, and it can be decided and tested with nothing in the room.
//
// The `0021` tables were designed for Twilio call recordings transcribed by Deepgram. A
// Fireflies meeting is a different animal wearing the same shape — a multi-party Google
// Meet, not a two-party dial — so every place the fit is imperfect is a decision below,
// not a coincidence.
//
// Everything funnels through `normalizeSegments` for the same reason `deepgram.ts` does:
// idx reassignment, per-segment rejection and deterministic ordering were decided once
// and must not be re-decided per provider.

import {
  type CallTranscript,
  type SegmentNormalization,
  type TranscriptSegment,
  normalizeSegments,
} from "./transcriptSegments";

export const FIREFLIES_PROVIDER = "fireflies";

/** The `recording_sid` prefix that marks a row as a meeting rather than a dialled call. */
export const FIREFLIES_KEY_PREFIX = "fireflies-";

/**
 * A Fireflies transcript file, typed loosely on purpose.
 *
 * These are exports from someone else's API sitting on disk; a strict interface would be
 * a claim the compiler enforces and the JSON ignores. Every field is read defensively.
 */
export type FirefliesTranscript = {
  id?: unknown;
  title?: unknown;
  dateString?: unknown;
  duration?: unknown;
  meeting_link?: unknown;
  sentences?: unknown;
};

export type FirefliesMapping = SegmentNormalization & {
  transcript: CallTranscript;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * DECISION 1 — identity is `fireflies-<id>`, derived and namespaced.
 *
 * `recording_sid` is UNIQUE in 0021, so the key has to be stable across re-runs (that is
 * what makes the load idempotent) AND unable to collide with a Twilio sid. Twilio sids are
 * `RE` + 32 hex; a Fireflies id is a ULID, so a bare id could not collide today — but the
 * prefix means it cannot collide under any future id scheme either, and it makes the row's
 * origin readable in psql without a join.
 *
 * The prefix also buys a safety property that matters while the dashboard has no login:
 * the only public route into transcript content validates against `RECORDING_SID_PATTERN`
 * (`/^RE[0-9a-fA-F]{32}$/`), which a `fireflies-…` key fails structurally. Internal meeting
 * transcripts are therefore unreachable from that route by SHAPE, not by a check somebody
 * has to remember to add. `firefliesMapping.test.ts` pins exactly that.
 */
export function firefliesKey(id: unknown): string | null {
  const raw = str(id);
  return raw ? `${FIREFLIES_KEY_PREFIX}${raw}` : null;
}

/**
 * DECISION 2 — Fireflies gives float SECONDS; 0021 stores integer milliseconds.
 *
 * Same conversion, same reason as `deepgram.ts:secondsToMs`: a float offset makes
 * `segmentAtMs`'s boundary comparison test a value that was never exactly representable.
 * Rounding happens once, here.
 */
export function secondsToMs(v: unknown): number | undefined {
  const s = num(v);
  if (s === undefined || s < 0) return undefined;
  return Math.round(s * 1000);
}

/**
 * DECISION 3 — `durationMs` comes from the LAST spoken word, not from `duration`.
 *
 * The files disagree with themselves: `01KV8PMM…` carries `duration: 5` on a meeting whose
 * final sentence ends at 166.95s. Whatever that 5 counts (minutes, a truncated recording,
 * a billing unit), it is not the span of the transcript, and a duration that contradicts
 * the segments makes every progress bar and every "jump to 2:40" wrong.
 *
 * So it is derived from `max(end_time)` — a number we can see the evidence for. A meeting
 * with no usable sentences gets NO duration rather than 0: zero is a claim ("this meeting
 * lasted no time"), absence is the truth ("we were not told").
 */
export function derivedDurationMs(sentences: readonly TranscriptSegment[]): number | undefined {
  let max: number | undefined;
  for (const seg of sentences) {
    if (!Number.isInteger(seg.endMs) || seg.endMs < 0) continue;
    if (max === undefined || seg.endMs > max) max = seg.endMs;
  }
  return max;
}

function toSegments(list: unknown): TranscriptSegment[] {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const speaker = str(o.speaker_name);
    return {
      // idx is a placeholder — `normalizeSegments` reassigns from time order. Passing the
      // payload's own `index` through would be trusting a key we do not control.
      idx: i,
      startMs: secondsToMs(o.start_time) ?? -1,
      endMs: secondsToMs(o.end_time) ?? -1,
      text: str(o.raw_text) ?? "",
      ...(speaker ? { speaker } : {}),
      // DECISION 4 — no `confidence`, ever. Fireflies supplies none, and defaulting to 1
      // would assert perfect certainty about words nobody scored. An absent column reads
      // as "unknown"; a fabricated 1.0 reads as "verified" and would rank these segments
      // above genuinely-scored Deepgram ones in anything that sorts on confidence.
    };
  });
}

/**
 * Map one Fireflies export onto a transcript row plus its segments.
 *
 * DECISION 5 — the status is always `complete`, and `error` is OMITTED.
 *
 * 0021's `call_transcripts_status_error` CHECK rejects a non-failed row that carries an
 * error at all, so `error: undefined` is not tidiness — an explicit key here is a row
 * Postgres refuses. And a meeting export that is already on disk is, by definition, a
 * finished transcription: `pending` would put it in a retry queue for a job that will
 * never be requested. A meeting with zero usable sentences is still `complete` with zero
 * segments (same rule Deepgram silence gets) — the emptiness is visible in the count.
 *
 * `activityId` is deliberately absent. `transcriptActivityId` would produce
 * `dialer-fireflies-…`, pointing at a dialler activity that does not exist for a Google
 * Meet; a link to a missing record is worse than no link.
 *
 * Returns null on a file with no id: without a stable key the load cannot be idempotent,
 * and a random one would stack a duplicate transcript on every re-run.
 */
export function mapFirefliesTranscript(
  file: FirefliesTranscript | null | undefined
): FirefliesMapping | null {
  const sid = firefliesKey(file?.id);
  if (!sid) return null;

  const normalized = normalizeSegments(toSegments(file?.sentences));
  const durationMs = derivedDurationMs(normalized.segments);

  const transcript: CallTranscript = {
    recordingSid: sid,
    status: "complete",
    provider: FIREFLIES_PROVIDER,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };

  return { transcript, segments: normalized.segments, rejected: normalized.rejected };
}
