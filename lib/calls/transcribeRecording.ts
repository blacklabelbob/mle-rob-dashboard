// BUILD-QUEUE Q68 (c) inc.7 — THE JOIN: provider outcome → database row.
//
// inc.4 asks Deepgram, inc.5/inc.6 write 0021. This file owns the one question neither
// of them can answer alone: WHICH outcomes are owed a row at all. Every branch below is
// a decision about what a human will see in six months when they open a call that has no
// transcript, so each one is stated rather than implied.
//
// Pure per CR-3 in the sense that matters: no network, no clock, no randomness of its
// own — the provider call and the database are both injected, so the ordering rules are
// tested without Deepgram or Postgres in the room.

import { mapDeepgramResponse, type DeepgramMapping, type DeepgramResponse } from "./deepgram";
import {
  requestDeepgramTranscript,
  type DeepgramEnv,
  type DeepgramFetch,
  type DeepgramOutcome,
} from "./deepgramClient";
import { persistTranscript, type TranscriptDb } from "./transcriptStore";
import {
  transcriptKey,
  type TranscriptSegment,
  type TranscriptStatus,
} from "./transcriptSegments";

export type TranscribeInput = {
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
  env?: DeepgramEnv;
  fetchImpl?: DeepgramFetch;
  /** Injected so the request half can be faked whole in tests. */
  request?: (args: {
    recordingSid: string;
    recordingUrl: string;
    env?: DeepgramEnv;
    fetchImpl?: DeepgramFetch;
  }) => Promise<DeepgramOutcome>;
  updatedAt?: string;
};

export type TranscribeResult =
  /** No `DEEPGRAM_API_KEY`. Nothing was requested, so nothing is owed a row. */
  | { kind: "disabled" }
  /** Nothing could be keyed or asked for, and no row can honestly describe it. */
  | { kind: "skipped"; reason: string }
  /** A row was owed and refused by our own mirror of 0021's CHECKs. Nothing written. */
  | { kind: "rejected"; reason: string }
  /** A row is in the database. `status` is what a reader will see on the call. */
  | {
      kind: "stored";
      status: TranscriptStatus;
      transcriptId: string;
      segments: number;
      httpStatus?: number;
      /**
       * The segment rows that are now in 0021 — **the words this run persisted, in memory.**
       *
       * Carried on the result (inc.13) so the summariser can be handed the transcript of the
       * call it is summarising without a second database round trip inside `after()`, where
       * nothing retries and a re-read could return a *different* delivery's superseded words.
       *
       * Empty whenever the row does not carry words (`failed`, `pending`, or a genuinely
       * silent `complete` call) — it mirrors what was written, never what the provider said
       * before pruning, so a caller cannot summarise words the database does not have.
       *
       * **This is verbatim customer speech: never log it.** `transcribeLog` is the projection
       * every caller should log instead.
       */
      words: readonly TranscriptSegment[];
    };

/**
 * Build the `failed` row we owe for a condition WE detected (not the provider).
 *
 * It goes through `mapDeepgramResponse` like every other failure so `failed` rows keep
 * being built in exactly one place (inc.3's rule) — a second construction site is a
 * second shape for the same state.
 */
export function localFailure(recordingSid: string, reason: string): DeepgramMapping | null {
  return mapDeepgramResponse(recordingSid, { err_msg: reason } as DeepgramResponse);
}

/**
 * Transcribe one recording and store the result.
 *
 * **Nothing is written before the provider answers.** A `pending` pre-claim would be the
 * textbook move — it is how a crash mid-request stays distinguishable from a call nobody
 * requested — but inc.5 prunes segments to zero on any non-`complete` row, so pre-claiming
 * a call that ALREADY has a complete transcript would delete its words before Deepgram has
 * said anything, and a crash then leaves the call permanently wordless. Losing verbatim
 * customer speech is a worse failure than the state ambiguity it would buy, so the write
 * happens once, after the answer. The ambiguity is real and is the cost: a process that
 * dies mid-request leaves no row, and the Twilio retry is what recovers it.
 *
 * **`disabled` writes nothing** (inc.4's rule, held here where it becomes visible): no key
 * means no job was ever requested, and a `failed` row per unconfigured install would fill
 * the retry queue with calls nobody asked about.
 *
 * **An unusable recording URL DOES get a row.** It is a permanent condition — no retry
 * fixes a malformed url — and it is exactly the kind of thing that must be visible on the
 * call rather than inferred from an absence. A missing sid does not: there is nothing to
 * key the row on, and 0021 would reject it anyway.
 *
 * Database errors propagate (inc.6): a write that failed must not be reported as a write
 * that never happened.
 */
export async function transcribeRecording(
  db: TranscriptDb,
  input: TranscribeInput
): Promise<TranscribeResult> {
  const sid = transcriptKey(input.recordingSid);
  if (!sid) return { kind: "skipped", reason: "missing recording sid" };

  const url = (input.recordingUrl ?? "").trim();
  const doRequest = input.request ?? requestDeepgramTranscript;
  const outcome = await doRequest({
    recordingSid: sid,
    recordingUrl: url,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });

  if (outcome.kind === "disabled") return { kind: "disabled" };

  let mapping: DeepgramMapping | null;
  let httpStatus: number | undefined;
  if (outcome.kind === "invalid") {
    // The request was never made. We still know the call exists, so it is owed a visible
    // failure carrying OUR reason — the same way a provider failure carries Deepgram's.
    mapping = localFailure(sid, outcome.reason);
    if (!mapping) return { kind: "skipped", reason: outcome.reason };
  } else {
    mapping = outcome.mapping;
    httpStatus = outcome.httpStatus;
  }

  const result = await persistTranscript(db, mapping, input.updatedAt);
  if (result.kind === "rejected") return { kind: "rejected", reason: result.reason };

  return {
    kind: "stored",
    status: mapping.transcript.status,
    transcriptId: result.transcriptId,
    segments: result.segments,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    // What the database now holds, not what the provider sent: `persistTranscript` prunes a
    // non-`complete` row's segments to zero, and a caller handed the pre-prune list would
    // summarise words no reader of the call can ever see.
    words: result.segments > 0 ? mapping.segments : [],
  };
}

/**
 * The loggable projection of a transcription outcome — **counts and ids, never words.**
 *
 * Transcripts are the most sensitive rows in the database (a customer's own sentences), and a
 * webhook log is the least access-controlled place they could land. Every caller logs this.
 */
export function transcribeLog(result: TranscribeResult): Record<string, unknown> {
  if (result.kind !== "stored") return { ...result };
  const { words: _words, ...rest } = result;
  return rest;
}
