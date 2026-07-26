// BUILD-QUEUE Q68 (c), first half: what a Deepgram prerecorded response is allowed
// to become in 0021's two tables.
//
// Pure per CR-3 — no network, no clock, no randomness. The HTTP call to Deepgram is a
// later increment and a trivial one; the part that can be wrong in a way nobody notices
// is this mapping, so it lives on its own and is tested without Deepgram in the room.
//
// Everything here funnels into `normalizeSegments` (inc.2) rather than writing rows
// directly: idx reassignment, per-segment rejection and deterministic ordering are
// already decided there and must not be re-decided per provider.

import {
  type CallTranscript,
  type SegmentNormalization,
  type TranscriptSegment,
  normalizeSegments,
  transcriptKey,
  transcriptActivityId,
} from "./transcriptSegments";

export const DEEPGRAM_PROVIDER = "deepgram";

/**
 * Deepgram's prerecorded response, typed loosely on purpose.
 *
 * This is someone else's JSON arriving over the wire; a strict interface here would
 * be a lie that the compiler enforces and the network ignores. Every field is read
 * defensively below.
 */
export type DeepgramResponse = {
  metadata?: {
    duration?: unknown;
    models?: unknown;
    model_info?: unknown;
    request_id?: unknown;
  };
  results?: {
    utterances?: unknown;
    channels?: unknown;
  };
  // Deepgram's error shape, returned with a non-2xx.
  err_code?: unknown;
  err_msg?: unknown;
  error?: unknown;
};

export type DeepgramMapping = SegmentNormalization & {
  transcript: CallTranscript;
  /** Which shape in the payload the segments came from — recorded so a thin transcript is explainable. */
  source: "utterances" | "paragraphs" | "alternative" | "none";
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Deepgram counts in fractional seconds; 0021 stores integer milliseconds.
 *
 * Integers are not fussiness: a float offset makes `segmentAtMs`'s boundary test and
 * any seek-to-this-segment compare against a value that was never exactly representable.
 * Rounding once, here, is the only place that conversion happens.
 */
export function secondsToMs(v: unknown): number | undefined {
  const s = num(v);
  if (s === undefined || s < 0) return undefined;
  return Math.round(s * 1000);
}

/**
 * A speaker label from Deepgram's numeric diariser.
 *
 * Speaker **0 is a real speaker** — the naive `speaker || undefined` silently
 * un-attributes roughly half of every two-party call, and the loss is invisible
 * because the text is all still there. Channel is the fallback because a Twilio
 * dual-channel recording separates the parties before diarisation ever runs.
 *
 * The label stays a machine token, not "Rep"/"Customer": mapping a channel to a
 * person is a judgement that needs the call's direction and the matched contact,
 * which this function does not have and must not guess.
 */
export function speakerLabel(speaker: unknown, channel?: unknown): string | undefined {
  const s = num(speaker);
  if (s !== undefined && Number.isInteger(s) && s >= 0) return `speaker-${s}`;
  const named = str(speaker);
  if (named) return named;
  const c = num(channel);
  if (c !== undefined && Number.isInteger(c) && c >= 0) return `channel-${c}`;
  return undefined;
}

/**
 * Confidence is dropped, not fatal.
 *
 * `segmentRejection` refuses a confidence outside [0,1] — correctly, it is a CHECK in
 * 0021. But applying that to a provider quirk would throw away the *words*, which are
 * the thing we asked for. An utterance with unusable confidence is still a true record
 * of what was said, so the metadata goes and the text stays.
 */
function usableConfidence(v: unknown): number | undefined {
  const c = num(v);
  if (c === undefined || c < 0 || c > 1) return undefined;
  return c;
}

type RawSegment = { startMs?: number; endMs?: number; text?: string; speaker?: string; confidence?: number };

function toSegment(raw: RawSegment, i: number): TranscriptSegment {
  return {
    idx: i,
    startMs: raw.startMs ?? -1,
    endMs: raw.endMs ?? -1,
    text: raw.text ?? "",
    ...(raw.speaker ? { speaker: raw.speaker } : {}),
    ...(raw.confidence !== undefined ? { confidence: raw.confidence } : {}),
  };
}

function fromUtterances(list: unknown[]): TranscriptSegment[] {
  return list.map((u, i) => {
    const o = (u ?? {}) as Record<string, unknown>;
    return toSegment(
      {
        startMs: secondsToMs(o.start),
        endMs: secondsToMs(o.end),
        text: str(o.transcript),
        speaker: speakerLabel(o.speaker, o.channel),
        confidence: usableConfidence(o.confidence),
      },
      i
    );
  });
}

function fromParagraphs(alt: Record<string, unknown>): TranscriptSegment[] {
  const paras = (alt.paragraphs as Record<string, unknown> | undefined)?.paragraphs;
  if (!Array.isArray(paras)) return [];
  const out: TranscriptSegment[] = [];
  for (const p of paras) {
    const po = (p ?? {}) as Record<string, unknown>;
    const speaker = speakerLabel(po.speaker);
    const sentences = Array.isArray(po.sentences) ? po.sentences : [];
    for (const s of sentences) {
      const so = (s ?? {}) as Record<string, unknown>;
      out.push(
        toSegment(
          {
            startMs: secondsToMs(so.start),
            endMs: secondsToMs(so.end),
            text: str(so.text),
            speaker,
          },
          out.length
        )
      );
    }
  }
  return out;
}

function firstAlternative(res: DeepgramResponse): Record<string, unknown> | undefined {
  const channels = res.results?.channels;
  if (!Array.isArray(channels) || channels.length === 0) return undefined;
  const alts = (channels[0] as Record<string, unknown> | undefined)?.alternatives;
  if (!Array.isArray(alts) || alts.length === 0) return undefined;
  return (alts[0] ?? {}) as Record<string, unknown>;
}

/**
 * Map one prerecorded response onto a transcript row plus its segments.
 *
 * THE GRANULARITY LADDER — richest shape that is actually present, and each rung is a
 * real Deepgram configuration rather than a hypothetical:
 *   1. `results.utterances`  — utt_split/diarize on. Speaker-attributed, one row per turn.
 *   2. `paragraphs.sentences` — smart_format on without utterances. Sentence offsets survive.
 *   3. the alternative's flat `transcript` — one segment spanning the call.
 * Rung 3 is deliberately still a segment and not a blob: it keeps every reader on one
 * code path, and the day the request is reconfigured the rows get finer with no migration.
 *
 * A response with words but no usable offsets ends at rung 3 rather than inventing them.
 * An EMPTY transcript is `complete` with zero segments, never `failed` — silence, a
 * voicemail beep and a hang-up are all successful transcriptions of nothing, and calling
 * them failures would put them in a retry queue forever.
 */
export function mapDeepgramResponse(
  recordingSid: string | null | undefined,
  res: DeepgramResponse | null | undefined
): DeepgramMapping | null {
  const sid = transcriptKey(recordingSid);
  if (!sid) return null;

  const body = res ?? {};
  const base = {
    recordingSid: sid,
    provider: DEEPGRAM_PROVIDER,
    ...(transcriptActivityId(sid) ? { activityId: transcriptActivityId(sid)! } : {}),
  };

  const durationMs = secondsToMs(body.metadata?.duration);
  const models = body.metadata?.models;
  const model =
    str(Array.isArray(models) ? models[0] : undefined) ??
    str((body.metadata?.model_info as Record<string, unknown> | undefined)?.name);

  // The provider told us it failed. Carry ITS reason — a generic "transcription failed"
  // is what turns a fixable 400 (bad audio url, unsupported codec) into a mystery.
  const errMsg = str(body.err_msg) ?? str(body.error);
  const errCode = str(body.err_code);
  if (errMsg || errCode) {
    return {
      transcript: {
        ...base,
        status: "failed",
        error: [errCode, errMsg].filter(Boolean).join(": ") || "deepgram error",
        ...(model ? { model } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
      },
      segments: [],
      rejected: [],
      source: "none",
    };
  }

  const alt = firstAlternative(body);
  const utterances = body.results?.utterances;

  let raw: TranscriptSegment[] = [];
  let source: DeepgramMapping["source"] = "none";

  if (Array.isArray(utterances) && utterances.length > 0) {
    raw = fromUtterances(utterances);
    source = "utterances";
  }
  if (raw.length === 0 && alt) {
    const paras = fromParagraphs(alt);
    if (paras.length > 0) {
      raw = paras;
      source = "paragraphs";
    }
  }
  if (raw.length === 0 && alt) {
    const flat = str(alt.transcript);
    if (flat) {
      raw = [
        toSegment(
          {
            startMs: 0,
            endMs: durationMs ?? 0,
            text: flat,
            confidence: usableConfidence(alt.confidence),
          },
          0
        ),
      ];
      source = "alternative";
    }
  }

  const normalized = normalizeSegments(raw);

  return {
    transcript: {
      ...base,
      status: "complete",
      ...(model ? { model } : {}),
      ...(str((body.metadata as Record<string, unknown> | undefined)?.language as unknown)
        ? { language: str((body.metadata as Record<string, unknown>).language as unknown)! }
        : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
    ...normalized,
    source: normalized.segments.length === 0 ? "none" : source,
  };
}

/**
 * The plain-text rendering, derived from segments rather than stored beside them.
 *
 * Storing the provider's flat `transcript` alongside the segments would create two
 * versions of the same call that drift the moment a segment is corrected. This is the
 * input the summarisation model gets in the next increment.
 */
export function transcriptText(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join("\n");
}
