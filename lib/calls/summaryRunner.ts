// BUILD-QUEUE Q68 (c) inc.40 — CARRYING inc.39's PLAN TO THE CALLS THAT HAVE WORDS BUT NO MEANING.
//
// inc.39 answered *which* already-transcribed calls still owe a summary, and named a reason
// for every one it declined. A plan nothing executes is a report, not a repair. This is the
// execution half — and it is deliberately NOT `runBackfill` (inc.34): that runner drives
// `processCallRecording`, which re-fetches Twilio media and re-pays Deepgram. Sending this
// backlog through it would buy a second transcript for every call that already has one.
// This runner never touches Twilio and never touches Deepgram: it reads the words we already
// own out of 0021 and asks the model, once, for the meaning.
//
// Pure per CR-3 in the same sense as `backfillRunner`: no clock, no network, no env, no store.
// The activity read, the segment read, the model ask and the save are all injected, so every
// ordering rule below is tested without Anthropic or Postgres in the room.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. A NOT-CONFIGURED PLAN EXECUTES NOTHING AND SAYS SO. inc.39 rule 1 carried one layer
//     out — the outcome of an unconfigured pass is a different SHAPE, not `ran: 0`. With
//     `ANTHROPIC_API_KEY` still in PING-INBOX this is the state the pass runs in today, and
//     "0 summarised, 0 failures" on a dead loop is how the missing key stays invisible.
//
//  2. RUNS ARE SEQUENTIAL, NEVER FANNED OUT. Every run is a paid model call over a whole
//     transcript. A backfill exists because a BACKLOG accumulated, so `Promise.all` over it
//     is a burst of dozens of concurrent requests — the shape that gets rate-limited into
//     failures which then look like unsummarisable calls, and bills for them anyway.
//
//  3. ONE RUN'S FAILURE DOES NOT END THE PASS. Let the throw propagate and a single call with
//     an unparseable transcript blocks every call behind it on every pass, forever.
//
//  4. AN ACTIVITY THAT IS GONE IS NOT A FAILURE. A plan is a snapshot; between planning and
//     running, an activity can be deleted or re-matched. Summarising anyway would patch a row
//     that no longer exists, and calling it a failure would send an operator hunting an
//     Anthropic outage that never happened. Same outcome name as inc.34 rule 4, on purpose.
//
//  5. SEGMENTS THAT VANISHED ARE THEIR OWN OUTCOME — AND ARE NEVER SENT AS AN EMPTY
//     TRANSCRIPT. The plan carries a segment COUNT read from 0021's state row minutes ago;
//     the words are re-read here (rule 7). If that read comes back empty — the row was
//     pruned, the transcript re-run and failed — the honest answer is `segments-missing`.
//     Asking a model to summarise zero segments is exactly inc.39 rule 3's refusal arriving
//     late: an unanswered call acquiring a paragraph about what was discussed.
//
//  6. A RUN THAT WROTE NOTHING IS NOT A SUCCESS. `summarizeCall` resolves happily when the
//     key is absent, when the parse is rejected, when the transcript is not owed one —
//     nothing threw. So the outcome carries the summary KIND, and `ran` counts attempts
//     while `written` counts the ones that actually put a paragraph on a timeline. "12
//     summarised" over 12 disabled runs is a lie about the one thing this feature fixes.
//
//  7. THE WORDS ARE RE-READ, THE PLAN IS NOT TRUSTED FOR THEM. The plan carries counts so an
//     operator can predict the bill; it does not carry transcripts, because a plan is not a
//     payload (inc.39 rule 7). Re-reading is also what makes rule 5 detectable at all.
//
//  8. THE LOG CARRIES COUNTS, IDS AND REASONS — NEVER WORDS. A summarize result holds the
//     paragraph itself, and a provider error can quote the transcript it choked on. The
//     projection is defined here so no caller has to remember.

import type { Activity } from "@/lib/types";
import type { TranscriptSegment } from "./transcriptSegments";
import type { SummarizeResult } from "./summarizeCall";
import type { SummaryBackfillPlan, SummaryRun } from "./summaryBackfill";
import { backfillErrorText } from "./backfillRunner";

export type SummaryRunOutcome =
  /** The ask completed. The kind is carried so rule 6 can be checked, not assumed. */
  | {
      kind: "ran";
      recordingSid: string;
      activityId: string;
      summary: SummarizeResult["kind"];
      /** Segments actually sent. 0 can never appear here — rule 5 intercepts first. */
      segments: number;
      /** Present only on a written summary; counts, never the items themselves. */
      actionItems?: number;
      buyingSignals?: number;
    }
  /** The activity vanished between planning and running (rule 4). Nothing was asked. */
  | { kind: "activity-missing"; recordingSid: string; activityId: string }
  /** The words vanished between planning and running (rule 5). Nothing was asked. */
  | { kind: "segments-missing"; recordingSid: string; activityId: string }
  /** The ask, the read or the save threw. The pass continued (rule 3). */
  | { kind: "failed"; recordingSid: string; activityId: string; error: string };

export type SummaryBackfillOutcome =
  | { kind: "not-configured"; missing: readonly string[] }
  | {
      kind: "executed";
      outcomes: readonly SummaryRunOutcome[];
      /** Eligible calls the plan's limit left behind — carried through from inc.39. */
      remaining: number;
    };

export type SummaryRunnerDeps = {
  /**
   * Re-read the activity this run belongs to.
   *
   * Re-read rather than carried on the plan for the same reason as inc.34: the summary is
   * patched ONTO this row, so a stale copy would overwrite whatever changed since planning.
   */
  loadActivity: (activityId: string) => Promise<Activity | null>;
  /** Re-read the stored words for this recording (rule 7). */
  loadSegments: (recordingSid: string) => Promise<readonly TranscriptSegment[]>;
  /**
   * Ask for the meaning and write it. Injected so every rule tests without a model call.
   *
   * Deliberately takes the activity and the segments only: this runner has no `TranscribeResult`
   * to give — that is the entire reason inc.39's backlog exists — so the caller wires
   * `summarizeCall`'s transcript gate to a `stored`/`complete` shape it can honestly assert,
   * having just read a non-empty segment list here.
   */
  summarize: (
    activity: Activity,
    segments: readonly TranscriptSegment[]
  ) => Promise<SummarizeResult>;
};

/**
 * Execute a summary plan, one call at a time.
 *
 * Returns rather than throws: a pass that hit three model errors still summarised the other
 * nine calls, and the caller needs to be told both halves.
 */
export async function runSummaryBackfill(
  deps: SummaryRunnerDeps,
  plan: SummaryBackfillPlan
): Promise<SummaryBackfillOutcome> {
  if (plan.kind === "not-configured") {
    return { kind: "not-configured", missing: plan.missing };
  }

  const outcomes: SummaryRunOutcome[] = [];

  for (const run of plan.runs) {
    outcomes.push(await runOne(deps, run));
  }

  return { kind: "executed", outcomes, remaining: plan.remaining };
}

async function runOne(deps: SummaryRunnerDeps, run: SummaryRun): Promise<SummaryRunOutcome> {
  const { activityId, recordingSid } = run;

  let activity: Activity | null;
  try {
    activity = await deps.loadActivity(activityId);
  } catch (e) {
    // An unreadable store is a failure of THIS run, not proof the row is gone — rule 4's
    // outcome would tell an operator the activity was deleted when it never was.
    return { kind: "failed", recordingSid, activityId, error: backfillErrorText(e) };
  }
  if (!activity) return { kind: "activity-missing", recordingSid, activityId };

  let segments: readonly TranscriptSegment[];
  try {
    segments = await deps.loadSegments(recordingSid);
  } catch (e) {
    // Same distinction one layer down: a failed read is not an empty transcript, and
    // reporting it as `segments-missing` would send an operator re-transcribing a call whose
    // words are sitting in 0021 intact.
    return { kind: "failed", recordingSid, activityId, error: backfillErrorText(e) };
  }
  if (segments.length === 0) return { kind: "segments-missing", recordingSid, activityId };

  try {
    const result = await deps.summarize(activity, segments);
    return {
      kind: "ran",
      recordingSid,
      activityId,
      summary: result.kind,
      segments: segments.length,
      ...(result.kind === "written"
        ? { actionItems: result.actionItems, buyingSignals: result.buyingSignals }
        : {}),
    };
  } catch (e) {
    return { kind: "failed", recordingSid, activityId, error: backfillErrorText(e) };
  }
}

/**
 * The loggable projection of a pass — counts and reasons only (rule 8).
 *
 * `written` is deliberately separate from `ran`: they differ exactly when the loop is running
 * but not working, which is the state this increment exists to make visible.
 */
export function summaryRunLog(outcome: SummaryBackfillOutcome): Record<string, unknown> {
  if (outcome.kind === "not-configured") {
    return { kind: outcome.kind, missing: [...outcome.missing] };
  }

  let ran = 0;
  let written = 0;
  let segments = 0;
  let failed = 0;
  let activityMissing = 0;
  let segmentsMissing = 0;
  const summaryKinds: Record<string, number> = {};

  for (const o of outcome.outcomes) {
    if (o.kind === "failed") {
      failed += 1;
      continue;
    }
    if (o.kind === "activity-missing") {
      activityMissing += 1;
      continue;
    }
    if (o.kind === "segments-missing") {
      segmentsMissing += 1;
      continue;
    }
    ran += 1;
    segments += o.segments;
    if (o.summary === "written") written += 1;
    summaryKinds[o.summary] = (summaryKinds[o.summary] ?? 0) + 1;
  }

  return {
    kind: outcome.kind,
    ran,
    written,
    segments,
    failed,
    activityMissing,
    segmentsMissing,
    summaryKinds,
    remaining: outcome.remaining,
  };
}
