// BUILD-QUEUE Q68 (c) inc.33 — WHICH ALREADY-FILED CALLS ARE STILL MISSING THEIR WORDS.
//
// Everything inc.1–32 built runs ONCE, inside the recording webhook's `after()`, and
// nothing retries it. That leaves a hole the whole feature currently sits in: Deepgram and
// Anthropic keys are Rob's and are NOT set (PING-INBOX), so every call that arrives before
// they land is filed on the timeline with no transcript and no summary — and when the keys
// finally arrive, NOTHING goes back for those calls. Same hole, smaller, for any call whose
// `after()` run threw: the log is the only trace, and no second attempt exists.
//
// This file is the decision half of the repair: given the calls already on the timeline and
// what 0021 currently holds for each, it says which recordings should be re-run and — for
// every one it declines — why. Pure per CR-3: no clock, no network, no env, no store. The
// runner that carries the plan to `processCallRecording` is the next increment; this is the
// part that must never guess.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. UNCONFIGURED IS NOT "NOTHING TO DO". With no Deepgram key the honest answer is that
//     the question cannot be asked yet. Returning an empty run list would print "0 calls
//     need transcription" to an operator whose loop is entirely dead — the exact reading
//     that keeps the missing key invisible. So the plan is a separate `not-configured`
//     shape carrying WHAT is missing, and it never contains runs.
//
//  2. A CALL WITH NO SID OR NO URL IS NOT BACKFILLABLE. This is the webhook's own refusal
//     (inc.1: the id comes from `recordingSid`, never random), one layer later. A transcript
//     written under an invented key cannot be found again, and a re-run with no media URL
//     has nothing to send Deepgram.
//
//  3. `complete` WITH ZERO SEGMENTS IS NOT DONE. `transcriptStore`'s worst tolerated
//     intermediate state is a complete transcript carrying no words — it reads on screen as
//     "transcribed, said nothing", which is indistinguishable from a silent call. Status
//     alone therefore never decides; the segment count is part of the question.
//
//  4. `pending` IS SKIPPED, NOT RETRIED. A pending row means a run may still be in flight
//     over that `recording_sid`, and two runs upserting the same (transcript_id, idx) rows
//     is the re-delivery hazard `transcriptStore` documents — the second run's prune can cut
//     the first run's tail. A stuck pending row is healed by an operator, not by racing it.
//
//  5. ONE SID RUNS ONCE PER PASS. Duplicate candidates carrying the same recording sid are
//     the same hazard as rule 4, self-inflicted; the later duplicate is declined by name.
//
//  6. A CAP IS REPORTED, NEVER SILENT. `remaining` counts the eligible recordings the limit
//     left behind, so a capped pass cannot read as a finished one.

import type { Activity } from "@/lib/types";
import type { TranscriptStatus } from "./transcriptSegments";

/** One already-filed call, reduced to what the decision needs. */
export type BackfillCandidate = {
  activityId: string;
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
  /** ISO. Ordering only — never parsed into a clock here. */
  occurredAt: string;
};

/** What 0021 currently holds for one recording sid. */
export type BackfillState = {
  status: TranscriptStatus;
  segmentCount: number;
};

export type BackfillRunReason = "never-transcribed" | "failed" | "complete-but-empty";

export type BackfillSkipReason =
  | "no-recording-sid"
  | "no-recording-url"
  | "already-transcribed"
  | "in-flight"
  | "duplicate-recording-sid";

export type BackfillRun = {
  activityId: string;
  recordingSid: string;
  recordingUrl: string;
  reason: BackfillRunReason;
};

export type BackfillSkip = {
  activityId: string;
  recordingSid: string | null;
  reason: BackfillSkipReason;
};

export type BackfillPlan =
  | { kind: "not-configured"; missing: readonly string[] }
  | {
      kind: "planned";
      runs: readonly BackfillRun[];
      skipped: readonly BackfillSkip[];
      /** Eligible recordings the limit left for a later pass. Rule 6. */
      remaining: number;
    };

export type BackfillInput = {
  candidates: readonly BackfillCandidate[];
  /** recording sid -> what 0021 holds. Absent = never transcribed. */
  transcripts: ReadonlyMap<string, BackfillState>;
  /** Empty = configured. Non-empty = the env names that are missing (rule 1). */
  missingConfig?: readonly string[];
  /** Positive caps the pass. Omitted = uncapped. `<= 0` plans nothing and says so. */
  limit?: number;
};

/**
 * Reduce a stored activity to a backfill candidate.
 *
 * Only a `dialer` `call` qualifies: a manually logged call has no Twilio recording behind
 * it, and handing its id to the transcription chain would derive a transcript key for a
 * recording that does not exist. Returns null rather than a candidate with empty fields —
 * "not a recorded call" and "a recorded call missing its sid" are different answers, and
 * only the second one belongs in the skip list.
 */
export function backfillCandidate(activity: Activity): BackfillCandidate | null {
  if (activity.type !== "call" || activity.source !== "dialer") return null;
  const ctx = activity.sourceContext ?? {};
  const raw = (ctx as Record<string, unknown>).recordingSid;
  const sid = typeof raw === "string" ? raw.trim() : "";
  return {
    activityId: activity.id,
    recordingSid: sid || null,
    recordingUrl: activity.recordingUrl?.trim() || null,
    occurredAt: activity.occurredAt,
  };
}

/**
 * Does what 0021 holds for this recording mean it still owes words?
 *
 * Exported because it is the one judgement a caller might be tempted to re-implement from
 * a status string — and a second copy is how rule 3 gets lost.
 */
export function backfillReason(state: BackfillState | undefined): BackfillRunReason | "done" | "in-flight" {
  if (!state) return "never-transcribed";
  if (state.status === "failed") return "failed";
  if (state.status === "pending") return "in-flight";
  // complete
  return state.segmentCount > 0 ? "done" : "complete-but-empty";
}

/**
 * Newest call first.
 *
 * The rep asking where the words are is asking about this morning's call, not one from
 * March, so a capped pass should spend itself on the recent end. The tie-break on
 * activityId is not cosmetic: two calls sharing a timestamp must order identically on
 * every pass, or a cap silently takes a different one each time and neither ever runs.
 */
function newestFirst(a: BackfillCandidate, b: BackfillCandidate): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  return a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0;
}

export function planBackfill(input: BackfillInput): BackfillPlan {
  const missing = input.missingConfig ?? [];
  if (missing.length > 0) return { kind: "not-configured", missing: [...missing] };

  const runs: BackfillRun[] = [];
  const skipped: BackfillSkip[] = [];
  const seen = new Set<string>();
  // Uncapped is expressed as Infinity so a `0` limit stays a real cap (rule 6) instead of
  // being read as "no limit given" — the two mean opposite things.
  const limit = input.limit === undefined ? Infinity : input.limit;
  let eligible = 0;

  for (const c of [...input.candidates].sort(newestFirst)) {
    const sid = (c.recordingSid ?? "").trim();
    if (!sid) {
      skipped.push({ activityId: c.activityId, recordingSid: null, reason: "no-recording-sid" });
      continue;
    }
    if (seen.has(sid)) {
      skipped.push({ activityId: c.activityId, recordingSid: sid, reason: "duplicate-recording-sid" });
      continue;
    }
    seen.add(sid);

    const reason = backfillReason(input.transcripts.get(sid));
    if (reason === "done") {
      skipped.push({ activityId: c.activityId, recordingSid: sid, reason: "already-transcribed" });
      continue;
    }
    if (reason === "in-flight") {
      skipped.push({ activityId: c.activityId, recordingSid: sid, reason: "in-flight" });
      continue;
    }

    // The URL check comes AFTER the state check on purpose: a call that already has its
    // words is done whether or not its media link survived, and reporting it as
    // "no-recording-url" would send an operator hunting a recording nothing needs.
    const url = (c.recordingUrl ?? "").trim();
    if (!url) {
      skipped.push({ activityId: c.activityId, recordingSid: sid, reason: "no-recording-url" });
      continue;
    }

    eligible += 1;
    if (runs.length < limit) {
      runs.push({ activityId: c.activityId, recordingSid: sid, recordingUrl: url, reason });
    }
  }

  return { kind: "planned", runs, skipped, remaining: eligible - runs.length };
}

/**
 * The loggable projection of a plan — ids, counts and reasons only.
 *
 * Same rule as `callPipelineLog`: nothing here may carry words or prose. A plan holds
 * neither today, and this function is where that stays true if it ever holds more.
 */
export function backfillPlanLog(plan: BackfillPlan): Record<string, unknown> {
  if (plan.kind === "not-configured") return { kind: plan.kind, missing: plan.missing };
  const byReason: Record<string, number> = {};
  for (const r of plan.runs) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  const skipsByReason: Record<string, number> = {};
  for (const s of plan.skipped) skipsByReason[s.reason] = (skipsByReason[s.reason] ?? 0) + 1;
  return {
    kind: plan.kind,
    runs: plan.runs.length,
    byReason,
    skipped: plan.skipped.length,
    skipsByReason,
    remaining: plan.remaining,
  };
}
