// BUILD-QUEUE Q68 (c) inc.12 — THE SUMMARY JOIN: which calls are owed a summary, and the
// one path by which one reaches the row.
//
// inc.7 (`transcribeRecording`) answered the same question for transcripts: which provider
// outcomes are owed a database row. This is its mirror on the summary half — inc.9 decided
// what an answer may become, inc.10 got the answer, inc.11 shaped the write, and none of
// them may decide WHETHER to ask. That decision is here because it is the one that costs
// money and can put a paragraph on a call that never had words.
//
// Pure per CR-3 in the sense that matters: no network, no clock, no env read of its own —
// the model request and the row write are both injected, so every rule below is tested
// without Anthropic or Postgres in the room.

import type { Activity } from "@/lib/types";
import { requestCallSummary, type SummaryEnv, type SummaryOutcome } from "./summaryClient";
import { applyCallSummary, patchFromParse } from "./summaryActivity";
import type { TranscriptSegment } from "./transcriptSegments";
import type { TranscribeResult } from "./transcribeRecording";

export type SummarizeResult =
  /** No `ANTHROPIC_API_KEY`. Nothing was asked, nothing changed — not an error state. */
  | { kind: "disabled" }
  /** There was never anything to summarise. Reason is what a human reads in a log. */
  | { kind: "skipped"; reason: string }
  /** We asked and refused the answer (inc.10). The row keeps whatever it already had. */
  | { kind: "rejected"; reason: string }
  /** The summary is on the row. Counts, not content — this is a log line, not a payload. */
  | {
      kind: "written";
      activity: Activity;
      actionItems: number;
      buyingSignals: number;
      truncated: boolean;
    };

/**
 * Is this transcript outcome owed a summary at all?
 *
 * **A transcript that is not `complete` is never summarised, and the check is on the
 * TRANSCRIPT STATUS rather than on the segment list.** inc.5 prunes segments to zero on any
 * non-complete row, so a `failed` transcript and a genuinely silent call both arrive here as
 * "no segments" — but they are not the same thing, and only one of them should ever be
 * described. Reading the status keeps the two apart in the reason string, which is the only
 * trace anyone gets of why a call has no summary.
 *
 * `disabled` and `skipped` transcripts are passed through as skips: we never heard any
 * words, so there is nothing to be wrong about.
 */
export function summaryOwed(
  result: TranscribeResult
): { ok: true } | { ok: false; reason: string } {
  switch (result.kind) {
    case "disabled":
      return { ok: false, reason: "transcription disabled" };
    case "skipped":
      return { ok: false, reason: `transcript skipped: ${result.reason}` };
    case "rejected":
      return { ok: false, reason: `transcript rejected: ${result.reason}` };
    case "stored":
      if (result.status !== "complete") {
        return { ok: false, reason: `transcript ${result.status}` };
      }
      // Zero segments under a `complete` row is a real, finished transcript of a call in
      // which nobody said anything. Handing that to a summariser is precisely how an
      // unanswered call acquires a paragraph about what was discussed (inc.9's rule, held
      // one layer earlier so the billed request is never made).
      return result.segments > 0 ? { ok: true } : { ok: false, reason: "no segments" };
  }
}

export type SummarizeInput = {
  /** The row we just wrote, held in memory — never re-read and never re-derived. */
  activity: Activity;
  /** The transcript outcome that gates the ask. */
  transcript: TranscribeResult;
  /** The words, from the run that just stored them. */
  segments: readonly TranscriptSegment[];
  env?: SummaryEnv;
  /** Injected so the ordering rules test without a model call. */
  request?: (args: {
    segments: readonly TranscriptSegment[];
    env?: SummaryEnv;
  }) => Promise<SummaryOutcome>;
};

/**
 * Summarise one transcribed call and write the result onto its activity.
 *
 * **The gate runs before the request, always.** The order is the whole point: every
 * refusal above is free, and the one below is billed.
 *
 * **A refused answer writes NOTHING — it does not blank the row.** inc.10's no-partial-
 * summary rule becomes an absence here: `patchFromParse` returns null for a rejected parse
 * and this returns `rejected` without touching the store, so a timeout on a re-delivery can
 * never erase a summary an earlier delivery produced. A call with no summary is one a rep
 * can still listen to; a call whose summary was replaced by a failure is a false record.
 *
 * **The row written is the one the caller holds, patched** (inc.11) — never rebuilt from the
 * webhook payload, which would null every column the summariser does not know about, and
 * never re-matched to a contact, which could move a filed call onto another person's
 * timeline while the response has long since gone out.
 *
 * **A save failure propagates.** This runs inside `after()`, where nothing retries; a write
 * that failed must not be reported to the log as a summary that landed.
 */
export async function summarizeCall(
  save: (activity: Activity) => Promise<void>,
  input: SummarizeInput
): Promise<SummarizeResult> {
  const owed = summaryOwed(input.transcript);
  if (!owed.ok) return { kind: "skipped", reason: owed.reason };

  const ask = input.request ?? requestCallSummary;
  const outcome = await ask({ segments: input.segments, env: input.env });

  if (outcome.kind === "disabled") return { kind: "disabled" };
  if (outcome.kind === "skipped") return { kind: "skipped", reason: outcome.reason };
  if (outcome.kind === "rejected") return { kind: "rejected", reason: outcome.reason };

  const patch = patchFromParse(input.activity, { kind: "ok", value: outcome.value });
  // Defensive, and deliberately a rejection rather than a throw: inc.11 refuses a blank
  // summary, and a blank summary reaching here is a bug in the parser, not in this call.
  if (!patch) return { kind: "rejected", reason: "empty summary" };

  const activity = applyCallSummary(input.activity, patch);
  await save(activity);

  return {
    kind: "written",
    activity,
    actionItems: patch.actionItems.length,
    buyingSignals: patch.buyingSignals.length,
    truncated: outcome.value.truncated === true,
  };
}
