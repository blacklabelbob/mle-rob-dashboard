// BUILD-QUEUE Q68 (c) inc.41 — THE SUMMARY PASS: the one call an operator's trigger makes.
//
// inc.39 decided which already-transcribed calls still owe a summary; inc.40 executed that
// plan one call at a time. Both halves exist and NOTHING JOINS THEM — the same gap inc.37
// closed for the transcript branch, and it is closed the same way, for the same reason: the
// trigger surface holds ONE await. A trigger that stitches read → plan → run itself puts
// three branches on the least-tested surface in the feature, and the one that spends money.
//
// Deliberately a SEPARATE pass from `runBackfillPass`, not a flag on it. The two repairs
// cost different money (transcript = Deepgram + Twilio egress; summary = the model only,
// over words we already own), and inc.39 exists precisely because folding them together is
// how "summarise the 40 calls that need it" becomes "re-transcribe the 40 that don't". One
// pass with a mode switch is that fold wearing a different name.
//
// Pure per CR-3 in the same sense as `backfillPass`: no clock, no network, no env, no store.
// The activity read, the 0021 evidence read, the segment read and the model ask are all
// injected, so every rule below is tested without Anthropic or Postgres in the room.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. EXECUTION IS NEVER A DEFAULT. `execute` is a required field, not an option with a
//     value. Every run is a paid model call, and a caller that has not said "yes, spend"
//     gets a plan. Identical to inc.37 rule 1 on purpose: two spend triggers that disagree
//     about what a missing flag means is how one of them gets called wrong.
//
//  2. AN UNCONFIGURED PASS ASKS THE DATABASE NOTHING. `planSummaryBackfill` already refuses
//     to plan without `ANTHROPIC_API_KEY`, but reaching it costs an activity read plus a
//     chunked 0021 read. That key is still one of the three in PING-INBOX, so today this is
//     the ONLY state this pass runs in — the short-circuit is the normal path, not an edge.
//
//  3. THE PLAN SURVIVES EXECUTION. `ran: 0` alone is unreadable — it is the same number
//     whether every call was already summarised, every one was never transcribed, or nothing
//     was ever recorded. The skip reasons are the answer, and dropping them is how an
//     operator re-runs a pass that can never do anything.
//
//  4. 0021 IS ASKED ONLY ABOUT SIDS THAT EXIST, EACH ONE ONCE. Reused wholesale from inc.37
//     (`backfillSids`) rather than re-written: a candidate with no sid already has a skip
//     reason waiting for it in the planner, and a second copy of the dedupe is how the two
//     could ever disagree about which calls were even considered.
//
//  5. NOTHING IS CAUGHT HERE. A failed activity read or a failed 0021 read throws. An empty
//     candidate list and an empty evidence map are both LEGITIMATE answers — "nothing to
//     repair" and "everything needs repair" — and a swallowed error impersonates one of
//     them. Per-RUN failures are still contained one layer down (inc.40 rule 3).
//
//  6. THE LOG CARRIES COUNTS AND REASONS — NEVER WORDS. Composed from the two projections
//     that already exist rather than re-derived, so a new field on either — a summary
//     paragraph, a quoted transcript in a provider error — cannot leak through this one.

import type { Activity } from "@/lib/types";
import type { TranscriptSegment } from "./transcriptSegments";
import type { SummarizeResult } from "./summarizeCall";
import type { BackfillState } from "./transcriptBackfill";
import { backfillSids } from "./backfillPass";
import {
  planSummaryBackfill,
  summaryBackfillLog,
  summaryCandidate,
  type SummaryBackfillPlan,
  type SummaryCandidate,
} from "./summaryBackfill";
import {
  runSummaryBackfill,
  summaryRunLog,
  type SummaryBackfillOutcome,
} from "./summaryRunner";

export type SummaryPassDeps = {
  /** Every activity worth considering. Filtered by `summaryCandidate`, never by a caller. */
  listActivities: () => Promise<readonly Activity[]>;
  /** The 0021 evidence read (inc.36). Handed only real, deduped sids — rule 4. */
  loadStates: (recordingSids: readonly string[]) => Promise<ReadonlyMap<string, BackfillState>>;
  /** Re-read one activity at run time. `runSummaryBackfill` states why it is not carried. */
  loadActivity: (activityId: string) => Promise<Activity | null>;
  /** Re-read the stored words for one recording (inc.40 rule 7). */
  loadSegments: (recordingSid: string) => Promise<readonly TranscriptSegment[]>;
  /** Ask for the meaning and write it. */
  summarize: (
    activity: Activity,
    segments: readonly TranscriptSegment[]
  ) => Promise<SummarizeResult>;
};

export type SummaryPassInput = {
  /** Env names that are unset. Non-empty short-circuits before any read (rule 2). */
  missingConfig: readonly string[];
  /** Rule 1: required. `false` plans and stops; `true` spends. */
  execute: boolean;
  /** Positive caps the pass. Omitted = uncapped. */
  limit?: number;
};

export type SummaryPassResult =
  | { kind: "not-configured"; missing: readonly string[] }
  /** `execute: false`, or a plan with nothing to run. No model was contacted. */
  | { kind: "planned"; plan: SummaryBackfillPlan }
  | { kind: "executed"; plan: SummaryBackfillPlan; outcome: SummaryBackfillOutcome };

/** Every already-filed dialer call, reduced to what the summary decision needs. */
export function summaryCandidates(activities: readonly Activity[]): SummaryCandidate[] {
  const candidates: SummaryCandidate[] = [];
  for (const a of activities) {
    const c = summaryCandidate(a);
    if (c) candidates.push(c);
  }
  return candidates;
}

/**
 * Plan a summary backfill and — only when told to — run it.
 *
 * Returns rather than throws for the same reason `runSummaryBackfill` does: the caller needs
 * both halves of a partial pass. Reads still throw (rule 5).
 */
export async function runSummaryPass(
  deps: SummaryPassDeps,
  input: SummaryPassInput
): Promise<SummaryPassResult> {
  // Rule 2 — before the first round trip.
  if (input.missingConfig.length > 0) {
    return { kind: "not-configured", missing: [...input.missingConfig] };
  }

  const candidates = summaryCandidates(await deps.listActivities());
  const sids = backfillSids(candidates);
  // Rule 4's other half: inc.36 already refuses a round trip for an empty list, and asking
  // twice is how that refusal gets lost when either side is refactored.
  const transcripts =
    sids.length > 0 ? await deps.loadStates(sids) : new Map<string, BackfillState>();

  const plan = planSummaryBackfill({
    candidates,
    transcripts,
    // `missingConfig` is deliberately NOT re-passed: it was decided above, and a second copy
    // of the check is how the two could ever disagree.
    limit: input.limit,
  });

  // Rule 1, and the honest answer for a plan with nothing in it: no model was contacted, so
  // calling it "executed" would put a paid pass in the record that never happened.
  if (!input.execute || plan.kind !== "planned" || plan.runs.length === 0) {
    return { kind: "planned", plan };
  }

  const outcome = await runSummaryBackfill(
    {
      loadActivity: deps.loadActivity,
      loadSegments: deps.loadSegments,
      summarize: deps.summarize,
    },
    plan
  );
  // Rule 3.
  return { kind: "executed", plan, outcome };
}

/** The loggable projection of a whole pass — composed, never re-derived (rule 6). */
export function summaryPassLog(result: SummaryPassResult): Record<string, unknown> {
  if (result.kind === "not-configured") {
    return { kind: result.kind, missing: [...result.missing] };
  }
  if (result.kind === "planned") {
    return { kind: result.kind, plan: summaryBackfillLog(result.plan) };
  }
  return {
    kind: result.kind,
    plan: summaryBackfillLog(result.plan),
    run: summaryRunLog(result.outcome),
  };
}
