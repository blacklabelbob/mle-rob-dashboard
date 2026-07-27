// BUILD-QUEUE Q68 (c) inc.34 — CARRYING inc.33's PLAN TO THE CALLS THAT ARE OWED WORDS.
//
// inc.33 answered *which* already-filed recordings still owe a transcript, and named a reason
// for every one it declined. A plan nothing executes is a report, not a repair: the calls
// filed before Rob's Deepgram/Anthropic keys land still have no words and no summary, and the
// day the keys arrive something has to actually go back for them. This is that something —
// the execution half, and the second entry point into `processCallRecording` (the first being
// the recording webhook, where everything runs once and nothing retries).
//
// Pure per CR-3 in the same sense as `callPipeline`: no clock, no network, no env, no store.
// The pipeline call and the activity read are injected, so every ordering rule below is
// tested without Deepgram, Anthropic or Postgres in the room.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. A NOT-CONFIGURED PLAN EXECUTES NOTHING AND SAYS SO. inc.33 rule 1 carried one layer
//     out: the outcome of an unconfigured pass is a different SHAPE, not `ran: 0`. An
//     operator reading "0 calls transcribed, 0 failures" on a loop that is entirely dead is
//     exactly how the missing key stays invisible for another week.
//
//  2. RUNS ARE SEQUENTIAL, NEVER FANNED OUT. Every run is a paid Deepgram request plus a
//     paid model call plus Twilio media egress. A backfill's whole point is that a BACKLOG
//     accumulated, so `Promise.all` over it is a burst of dozens of concurrent provider
//     requests — the shape that gets rate-limited into failures which then look like
//     unbackfillable calls, and bills for them anyway. One at a time is also what makes a
//     partial pass meaningful: the runs that completed are done, the rest are still eligible.
//
//  3. ONE RUN'S FAILURE DOES NOT END THE PASS. The obvious implementation lets the throw
//     propagate. That is the version where a single dead media URL — the OLDEST such call,
//     since a pass walks newest-first and the old ones are exactly the broken ones — blocks
//     every other call behind it on every pass, forever. Each failure is recorded against
//     its own recording sid and the pass continues.
//
//  4. AN ACTIVITY THAT IS GONE IS NOT A FAILURE. A plan is computed from a snapshot; between
//     planning and running, an activity can be deleted or re-matched onto another person.
//     Running anyway would write a transcript whose `activity_id` points at a row that no
//     longer exists (inc.1's refusal, arriving late), and calling it a failure would send an
//     operator hunting a provider outage that never happened. It is its own outcome.
//
//  5. A RUN THAT STORED NOTHING IS NOT A SUCCESS. `processCallRecording` resolves happily
//     when Deepgram is disabled or the mapping was rejected — nothing threw. So the outcome
//     carries the transcript and summary KINDS, and `ran` counts attempts while `stored`
//     counts the ones that actually put words in 0021. "12 backfilled" over 12 disabled runs
//     is a lie about the exact thing this feature exists to fix.
//
//  6. THE LOG CARRIES COUNTS, SIDS AND REASONS — NEVER WORDS. Same rule as `callPipelineLog`
//     and `backfillPlanLog`: a pipeline result holds verbatim customer speech and the summary
//     prose, and a provider error message can quote the payload it choked on. The projection
//     is defined here so no caller has to remember.

import type { Activity } from "@/lib/types";
import type { CallPipelineResult } from "./callPipeline";
import type { BackfillPlan, BackfillRun, BackfillRunReason } from "./transcriptBackfill";

export type BackfillRunOutcome =
  /** The chain ran to completion. Kinds are carried so rule 5 can be checked, not assumed. */
  | {
      kind: "ran";
      recordingSid: string;
      activityId: string;
      reason: BackfillRunReason;
      transcript: CallPipelineResult["transcript"]["kind"];
      /** Segments actually in 0021 after this run. 0 is a real answer, never "unknown". */
      segments: number;
      summary: CallPipelineResult["summary"]["kind"];
    }
  /** The activity vanished between planning and running (rule 4). Nothing was requested. */
  | { kind: "activity-missing"; recordingSid: string; activityId: string }
  /** The chain threw. The pass continued (rule 3). */
  | { kind: "failed"; recordingSid: string; activityId: string; error: string };

export type BackfillOutcome =
  | { kind: "not-configured"; missing: readonly string[] }
  | {
      kind: "executed";
      outcomes: readonly BackfillRunOutcome[];
      /** Eligible recordings the plan's limit left behind — carried through from inc.33. */
      remaining: number;
    };

export type BackfillRunnerDeps = {
  /**
   * Re-read the activity this run belongs to.
   *
   * The row is re-read rather than carried on the plan for the reason the webhook does the
   * opposite: the webhook holds the activity it just wrote (in memory, seconds old), while a
   * backfill plan may be minutes old and describes rows it never loaded in full. The summary
   * is patched ONTO this activity, so a stale copy would overwrite whatever changed since.
   */
  loadActivity: (activityId: string) => Promise<Activity | null>;
  /** The chain. Injected so the ordering rules test without either provider. */
  runPipeline: (activity: Activity, run: BackfillRun) => Promise<CallPipelineResult>;
};

/** How many segments a finished run actually left in 0021 (rule 5). */
function storedSegments(result: CallPipelineResult): number {
  return result.transcript.kind === "stored" ? result.transcript.segments : 0;
}

/**
 * A thrown value, reduced to one line an operator can act on.
 *
 * `String(e)` on an unknown throw is how a whole response body — or an Error whose message
 * quotes the payload — reaches a log. The message is taken when there is one and truncated;
 * anything else becomes its type name rather than its contents.
 */
export function backfillErrorText(e: unknown): string {
  const raw = e instanceof Error && typeof e.message === "string" ? e.message : "";
  const text = raw.trim();
  if (!text) return e instanceof Error ? e.name || "Error" : typeof e;
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * Execute a plan, one recording at a time.
 *
 * Returns rather than throws: a pass that hit three provider errors still repaired the other
 * nine calls, and the caller needs to be told both halves.
 */
export async function runBackfill(
  deps: BackfillRunnerDeps,
  plan: BackfillPlan
): Promise<BackfillOutcome> {
  if (plan.kind === "not-configured") {
    return { kind: "not-configured", missing: plan.missing };
  }

  const outcomes: BackfillRunOutcome[] = [];

  for (const run of plan.runs) {
    let activity: Activity | null;
    try {
      activity = await deps.loadActivity(run.activityId);
    } catch (e) {
      // An unreadable store is a failure of THIS run, not proof the activity is gone —
      // rule 4's outcome would tell an operator the row was deleted when it never was.
      outcomes.push({
        kind: "failed",
        recordingSid: run.recordingSid,
        activityId: run.activityId,
        error: backfillErrorText(e),
      });
      continue;
    }

    if (!activity) {
      outcomes.push({
        kind: "activity-missing",
        recordingSid: run.recordingSid,
        activityId: run.activityId,
      });
      continue;
    }

    try {
      const result = await deps.runPipeline(activity, run);
      outcomes.push({
        kind: "ran",
        recordingSid: run.recordingSid,
        activityId: run.activityId,
        reason: run.reason,
        transcript: result.transcript.kind,
        segments: storedSegments(result),
        summary: result.summary.kind,
      });
    } catch (e) {
      outcomes.push({
        kind: "failed",
        recordingSid: run.recordingSid,
        activityId: run.activityId,
        error: backfillErrorText(e),
      });
    }
  }

  return { kind: "executed", outcomes, remaining: plan.remaining };
}

/**
 * The loggable projection of a pass — counts and reasons only (rule 6).
 *
 * `stored` is deliberately separate from `ran`: they differ exactly when the loop is running
 * but not working, which is the state this whole increment exists to make visible.
 */
export function backfillRunLog(outcome: BackfillOutcome): Record<string, unknown> {
  if (outcome.kind === "not-configured") {
    return { kind: outcome.kind, missing: outcome.missing };
  }

  let ran = 0;
  let stored = 0;
  let segments = 0;
  let failed = 0;
  let activityMissing = 0;
  const transcriptKinds: Record<string, number> = {};
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
    ran += 1;
    segments += o.segments;
    if (o.segments > 0) stored += 1;
    transcriptKinds[o.transcript] = (transcriptKinds[o.transcript] ?? 0) + 1;
    summaryKinds[o.summary] = (summaryKinds[o.summary] ?? 0) + 1;
  }

  return {
    kind: outcome.kind,
    ran,
    stored,
    segments,
    failed,
    activityMissing,
    transcriptKinds,
    summaryKinds,
    remaining: outcome.remaining,
  };
}
