// BUILD-QUEUE Q68 (c) inc.13 — THE CHAIN: one call from a recording to a summarised row.
//
// inc.7 joined provider→transcript, inc.12 joined transcript→summary. This is the only file
// that knows both halves are one sequence, and it exists so the ROUTE does not: the webhook's
// `after()` block should hold a single await, because everything it holds is unretried and
// every extra branch in there is a branch nobody will ever see fail.
//
// Pure per CR-3 in the sense that matters: no network, no clock, no env of its own — the
// database, the activity write, and both halves of the chain are injected, so the ordering
// rules below are tested without Deepgram, Anthropic or Postgres in the room.

import type { Activity } from "@/lib/types";
import type { DeepgramEnv } from "./deepgramClient";
import type { SummaryEnv } from "./summaryClient";
import { summarizeCall, type SummarizeInput, type SummarizeResult } from "./summarizeCall";
import { transcribeRecording, transcribeLog, type TranscribeResult } from "./transcribeRecording";
import type { TranscriptDb } from "./transcriptStore";

export type CallPipelineDeps = {
  db: TranscriptDb;
  /** The activity upsert. Injected — this file never reaches for a store. */
  saveActivity: (activity: Activity) => Promise<void>;
  /** Both halves are swappable so the sequence is testable without either provider. */
  transcribe?: typeof transcribeRecording;
  summarize?: (
    save: (activity: Activity) => Promise<void>,
    input: SummarizeInput
  ) => Promise<SummarizeResult>;
};

export type CallPipelineInput = {
  /** The row the webhook already filed and still holds. Never re-read, never re-matched. */
  activity: Activity;
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
  deepgram?: DeepgramEnv;
  summary?: SummaryEnv;
};

export type CallPipelineResult = {
  transcript: TranscribeResult;
  summary: SummarizeResult;
};

/**
 * Transcribe one recording, then summarise it onto the activity it belongs to.
 *
 * **The summariser is handed the words from the run that just stored them.** The obvious
 * alternative — re-read the segments back out of 0021 — is refused: it costs a round trip in
 * `after()`, and on a Twilio **re-delivery** two runs are in flight over the same
 * `recording_sid`, so a read can return the other run's rows and produce a summary of a
 * transcript this call never wrote. The words are already in memory; using them is both
 * cheaper and the only version that cannot describe someone else's write.
 *
 * **The summary step ALWAYS runs, even when transcription failed.** Nothing here inspects the
 * transcript outcome to decide whether to continue: `summaryOwed` (inc.12) is the single place
 * that decision lives, and a second copy of it here is how `transcript failed` and
 * `no segments` — the two states inc.12 exists to keep apart — quietly become one branch.
 *
 * **Failures propagate; this file catches nothing.** Inside `after()` nothing retries, so the
 * caller's log is the only trace either half ever had, and swallowing here would report a
 * chain that ran when it did not. The cost is stated: if the summary write throws, the caller
 * loses the transcript outcome from its success log — the transcript row is nonetheless in
 * 0021, and the error log carries the recording sid that finds it.
 */
export async function processCallRecording(
  deps: CallPipelineDeps,
  input: CallPipelineInput
): Promise<CallPipelineResult> {
  const doTranscribe = deps.transcribe ?? transcribeRecording;
  const doSummarize = deps.summarize ?? summarizeCall;

  const transcript = await doTranscribe(deps.db, {
    recordingSid: input.recordingSid,
    recordingUrl: input.recordingUrl,
    env: input.deepgram,
  });

  const summary = await doSummarize(deps.saveActivity, {
    activity: input.activity,
    transcript,
    segments: transcript.kind === "stored" ? transcript.words : [],
    env: input.summary,
  });

  return { transcript, summary };
}

/**
 * The loggable projection of a whole run — **counts, ids and reasons; no words, no prose.**
 *
 * Both payloads in `CallPipelineResult` carry customer content: the transcript its segments,
 * a written summary the entire activity row (the summary text, the action items, the contact).
 * A webhook log is the least access-controlled surface in the system, so the shape that gets
 * logged is stated here once rather than left to each caller's `JSON.stringify`.
 */
export function callPipelineLog(result: CallPipelineResult): Record<string, unknown> {
  const s = result.summary;
  const summary =
    s.kind === "written"
      ? {
          kind: s.kind,
          activityId: s.activity.id,
          actionItems: s.actionItems,
          buyingSignals: s.buyingSignals,
          truncated: s.truncated,
        }
      : { ...s };

  return { transcript: transcribeLog(result.transcript), summary };
}
