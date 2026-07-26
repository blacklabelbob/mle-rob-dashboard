// BUILD-QUEUE Q68 (b): the pure layer over 0021_call_transcripts.sql.
// Pure per CR-3 — no network, no clock, no randomness. Everything here is a
// judgement about what a provider payload is allowed to become in our database,
// and those judgements have to be testable without Deepgram in the room.

export const TRANSCRIPT_STATUSES = ["pending", "complete", "failed"] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export type TranscriptSegment = {
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  confidence?: number;
};

export type CallTranscript = {
  recordingSid: string;
  activityId?: string;
  status: TranscriptStatus;
  provider: string;
  model?: string;
  language?: string;
  durationMs?: number;
  error?: string;
};

/**
 * The transcript's identity, derived from the recording — never random.
 *
 * Same rule as `callActivityId`: Twilio re-POSTs on any non-2xx and a
 * transcription job can be re-requested, so a random id stacks duplicate
 * transcripts on one call. No sid means no stable identity, so no row.
 */
export function transcriptKey(recordingSid: string | null | undefined): string | null {
  const sid = (recordingSid ?? "").trim();
  return sid ? sid : null;
}

/** The activity `recordingActivity.ts` files the same call on. Kept in one place. */
export function transcriptActivityId(recordingSid: string | null | undefined): string | null {
  const sid = transcriptKey(recordingSid);
  return sid ? `dialer-${sid}` : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Is this segment storable?
 *
 * Mirrors the CHECK constraints in 0021 exactly, so a bad segment is dropped
 * with a reason we can count rather than rejected by Postgres mid-insert —
 * which would fail the whole batch and lose the segments that were fine.
 */
export function segmentRejection(seg: TranscriptSegment): string | null {
  if (!Number.isInteger(seg.idx) || seg.idx < 0) return "idx";
  if (!Number.isInteger(seg.startMs) || seg.startMs < 0) return "start_ms";
  if (!Number.isInteger(seg.endMs) || seg.endMs < 0) return "end_ms";
  if (seg.endMs < seg.startMs) return "span";
  if (!seg.text.trim()) return "text";
  if (seg.speaker !== undefined && !seg.speaker.trim()) return "speaker";
  if (seg.confidence !== undefined && (!isFiniteNumber(seg.confidence) || seg.confidence < 0 || seg.confidence > 1))
    return "confidence";
  return null;
}

export type SegmentNormalization = {
  segments: TranscriptSegment[];
  /** Dropped inputs, by the constraint they violated. Reported, never silently swallowed. */
  rejected: { idx: number; reason: string }[];
};

/**
 * Turn a provider's segment list into rows 0021 will accept.
 *
 * Three rules, all of them load-bearing:
 *  1. `idx` is REASSIGNED from time order, not trusted from the payload. It is the
 *     unique key with transcript_id, so a provider that repeats or skips an index
 *     would collide on insert or leave holes in playback. Time order is the only
 *     ordering a player can act on anyway.
 *  2. Bad segments are dropped individually and listed. A single un-parseable
 *     utterance must not cost us the other 400 — a transcript missing one line is
 *     usable; a transcript missing entirely is not.
 *  3. Sorting is stable on (startMs, endMs) so two runs over the same payload
 *     produce byte-identical rows. Non-determinism here would show up as a
 *     transcript that "changes" between retries.
 */
export function normalizeSegments(input: readonly TranscriptSegment[]): SegmentNormalization {
  const rejected: { idx: number; reason: string }[] = [];
  const kept: TranscriptSegment[] = [];

  input.forEach((seg, i) => {
    const reason = segmentRejection(seg);
    if (reason) rejected.push({ idx: Number.isInteger(seg.idx) ? seg.idx : i, reason });
    else kept.push(seg);
  });

  kept.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.idx - b.idx);

  return {
    segments: kept.map((seg, i) => ({
      idx: i,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text.trim(),
      ...(seg.speaker?.trim() ? { speaker: seg.speaker.trim() } : {}),
      ...(seg.confidence !== undefined ? { confidence: seg.confidence } : {}),
    })),
    rejected,
  };
}

/**
 * The segment playing at `ms` — the playback-sync lookup the schema exists for.
 *
 * Half-open on the end (`start <= ms < end`) so two adjacent segments never both
 * claim the boundary millisecond; a highlight that flickers between two lines is
 * the visible symptom of getting this wrong. Returns null before the first and
 * inside any gap — silence is not the previous speaker still talking.
 */
export function segmentAtMs(
  segments: readonly TranscriptSegment[],
  ms: number
): TranscriptSegment | null {
  if (!isFiniteNumber(ms) || ms < 0) return null;
  for (const seg of segments) {
    if (ms >= seg.startMs && ms < seg.endMs) return seg;
    // Zero-length tokens are legal in 0021; they can only match exactly.
    if (seg.startMs === seg.endMs && ms === seg.startMs) return seg;
  }
  return null;
}

/**
 * A transcript row's terminal state, refused unless it is internally consistent.
 *
 * Mirrors `call_transcripts_status_error`: a failure with no reason is an
 * unactionable row, and a completed transcript carrying an error is two
 * contradictory claims about one call. Returning null (rather than throwing)
 * keeps the caller's error path a status code instead of a stack trace.
 */
export function transcriptRowRejection(t: CallTranscript): string | null {
  if (!transcriptKey(t.recordingSid)) return "recording_sid";
  if (!TRANSCRIPT_STATUSES.includes(t.status)) return "status";
  if (!t.provider.trim()) return "provider";
  if (t.status === "failed" && !t.error?.trim()) return "error";
  if (t.status !== "failed" && t.error !== undefined) return "error";
  if (t.durationMs !== undefined && (!Number.isInteger(t.durationMs) || t.durationMs < 0))
    return "duration_ms";
  return null;
}
