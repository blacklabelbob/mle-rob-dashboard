// BUILD-QUEUE Q68 (c) inc.37 — THE PASS: the one call an operator's trigger makes.
//
// inc.33 decided, inc.34 executed, inc.35/36 read the evidence. Every hop on
// `activities → backfillCandidate → loadBackfillStates → planBackfill → runBackfill →
// processCallRecording` now exists, and NOTHING JOINS THEM. This file is that join, and it
// exists so the trigger surface (route or CLI) holds one await: a trigger that stitches four
// steps itself is four branches on the least-tested surface in the feature, and the one that
// spends money.
//
// Pure per CR-3 in the same sense as `callPipeline` and `backfillRunner`: no clock, no
// network, no env, no store. The activity read, the 0021 read, the pipeline and the config
// verdict are all injected, so every rule below is tested without Deepgram, Anthropic or
// Postgres in the room.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. EXECUTION IS NEVER A DEFAULT. `execute` is a required field, not an option with a
//     value. This pass sends paid Deepgram requests and paid model calls over a BACKLOG —
//     the one call in the system where forgetting a flag is measured in dollars and in
//     writes to 0021. A caller that has not said "yes, spend" gets a plan.
//
//  2. AN UNCONFIGURED PASS ASKS THE DATABASE NOTHING. `planBackfill` already refuses to
//     plan without the keys, but reaching it costs an activity read plus a chunked 0021
//     read plus one head-count per transcript. Today — with Rob's keys unset — that is the
//     ONLY state this pass runs in, so the short-circuit is the normal path, not an edge.
//
//  3. THE PLAN SURVIVES EXECUTION. An executed pass carries its plan, not just its
//     outcomes. `ran: 0` alone is unreadable — it is the same number whether every call was
//     already transcribed, every one was missing its media URL, or nothing was ever
//     recorded. The skip reasons are the answer, and dropping them is how an operator
//     re-runs a pass that can never do anything.
//
//  4. 0021 IS ASKED ONLY ABOUT SIDS THAT EXIST, EACH ONE ONCE. A candidate with no
//     recording sid has a skip reason waiting for it in `planBackfill`; putting its empty
//     string into the `in()` list buys nothing and asks the transcript table a question
//     about a call that has no key. Duplicates are collapsed here too — one sid can appear
//     on two activities, and `planBackfill` declines the second by name anyway.
//
//  5. NOTHING IS CAUGHT HERE. A failed activity read or a failed 0021 read throws, exactly
//     as inc.36 rule 1 demands: an empty candidate list and an empty evidence map are both
//     legitimate answers that mean "re-run nothing" and "re-run everything", and a swallowed
//     error impersonates one of them. Per-RUN failures are still contained — that is
//     `runBackfill`'s rule 3, one layer down, and it stays there.
//
//  6. THE LOG CARRIES COUNTS AND REASONS — NEVER WORDS. Same rule as every other log
//     projection on this branch, composed from the two that already exist rather than
//     re-derived, so a new field on either cannot leak through this one.

import type { Activity } from "@/lib/types";
import type { CallPipelineResult } from "./callPipeline";
import {
  backfillCandidate,
  backfillPlanLog,
  planBackfill,
  type BackfillCandidate,
  type BackfillPlan,
  type BackfillRun,
  type BackfillState,
} from "./transcriptBackfill";
import {
  backfillRunLog,
  runBackfill,
  type BackfillOutcome,
} from "./backfillRunner";

export type BackfillPassDeps = {
  /** Every activity worth considering. Filtered by `backfillCandidate`, never by a caller. */
  listActivities: () => Promise<readonly Activity[]>;
  /** The 0021 evidence read (inc.36). Handed only real, deduped sids — rule 4. */
  loadStates: (recordingSids: readonly string[]) => Promise<ReadonlyMap<string, BackfillState>>;
  /** Re-read one activity at run time. `runBackfill` states why it is not carried. */
  loadActivity: (activityId: string) => Promise<Activity | null>;
  /** The chain. */
  runPipeline: (activity: Activity, run: BackfillRun) => Promise<CallPipelineResult>;
};

export type BackfillPassInput = {
  /** Env names that are unset. Non-empty short-circuits before any read (rule 2). */
  missingConfig: readonly string[];
  /** Rule 1: required. `false` plans and stops; `true` spends. */
  execute: boolean;
  /** Positive caps the pass. Omitted = uncapped. */
  limit?: number;
};

export type BackfillPassResult =
  | { kind: "not-configured"; missing: readonly string[] }
  /** `execute: false`, or a plan with nothing to run. No provider was contacted. */
  | { kind: "planned"; plan: BackfillPlan }
  | { kind: "executed"; plan: BackfillPlan; outcome: BackfillOutcome };

/**
 * The recording sids worth asking 0021 about (rule 4): present, trimmed, deduped, and in
 * the order the candidates arrived so a chunked read stays deterministic.
 */
export function backfillSids(candidates: readonly BackfillCandidate[]): string[] {
  const seen = new Set<string>();
  const sids: string[] = [];
  for (const c of candidates) {
    const sid = (c.recordingSid ?? "").trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    sids.push(sid);
  }
  return sids;
}

/** Every already-filed dialer call, reduced to what the decision needs. */
export function backfillCandidates(activities: readonly Activity[]): BackfillCandidate[] {
  const candidates: BackfillCandidate[] = [];
  for (const a of activities) {
    const c = backfillCandidate(a);
    if (c) candidates.push(c);
  }
  return candidates;
}

/**
 * Plan a backfill and — only when told to — run it.
 *
 * Returns rather than throws for the same reason `runBackfill` does: the caller needs both
 * halves of a partial pass. Reads still throw (rule 5).
 */
export async function runBackfillPass(
  deps: BackfillPassDeps,
  input: BackfillPassInput
): Promise<BackfillPassResult> {
  // Rule 2 — before the first round trip.
  if (input.missingConfig.length > 0) {
    return { kind: "not-configured", missing: [...input.missingConfig] };
  }

  const candidates = backfillCandidates(await deps.listActivities());
  const sids = backfillSids(candidates);
  // Rule 4's other half: inc.36 already refuses a round trip for an empty list, and asking
  // twice is how that refusal gets lost when either side is refactored.
  const transcripts = sids.length > 0 ? await deps.loadStates(sids) : new Map<string, BackfillState>();

  const plan = planBackfill({
    candidates,
    transcripts,
    // `missingConfig` is deliberately NOT re-passed: it was decided above, and a second
    // copy of the check is how the two could ever disagree.
    limit: input.limit,
  });

  // Rule 1, and the honest answer for a plan with nothing in it: no provider was contacted,
  // so calling it "executed" would put a paid pass in the record that never happened.
  if (!input.execute || plan.kind !== "planned" || plan.runs.length === 0) {
    return { kind: "planned", plan };
  }

  const outcome = await runBackfill(
    { loadActivity: deps.loadActivity, runPipeline: deps.runPipeline },
    plan
  );
  // Rule 3.
  return { kind: "executed", plan, outcome };
}

/** The loggable projection of a whole pass — composed, never re-derived (rule 6). */
export function backfillPassLog(result: BackfillPassResult): Record<string, unknown> {
  if (result.kind === "not-configured") {
    return { kind: result.kind, missing: result.missing };
  }
  if (result.kind === "planned") {
    return { kind: result.kind, plan: backfillPlanLog(result.plan) };
  }
  return {
    kind: result.kind,
    plan: backfillPlanLog(result.plan),
    run: backfillRunLog(result.outcome),
  };
}
