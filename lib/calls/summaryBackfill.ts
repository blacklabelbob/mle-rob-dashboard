// BUILD-QUEUE Q68 (c) inc.39 — THE CALLS THAT HAVE THEIR WORDS BUT NOT THEIR MEANING.
//
// inc.33–38 closed one repair path end to end: a filed call with no transcript can be sent
// back through Deepgram. There is a second backlog that path can never reach, and it is the
// one Rob's key situation guarantees will exist. `summarizeCall` (inc.12) only ever runs
// with a FRESH `TranscribeResult` in hand — it is a step inside one webhook's `after()`.
// So a call whose transcription succeeded while the model half was unavailable (no
// `ANTHROPIC_API_KEY` at the time, a rejected parse, an Anthropic outage) keeps its
// segments forever and its `summary` column stays empty forever: `planBackfill` looks at
// that call, sees `complete` with segments, and skips it as **already-transcribed**.
//
// That is the exact state the whole feature will be in the hour Rob's Deepgram key lands
// before his Anthropic key does. This module is the planner that finds those calls — and
// it is deliberately a SEPARATE plan from inc.33's rather than a branch inside it, because
// the two repairs cost different money: a transcript backfill re-pays Deepgram + Twilio
// media egress, a summary backfill re-pays only the model over words we already own.
// Folding them together is how "summarise the 40 calls that need it" becomes "re-transcribe
// the 40 calls that don't".
//
// Pure per CR-3: no clock, no network, no env, no store. The caller supplies the activities
// and what 0021 holds; every rule below is tested without Anthropic or Postgres in the room.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. NOT-CONFIGURED IS A DIFFERENT SHAPE, NOT AN EMPTY PLAN. Same rule as inc.33 rule 1,
//     and here it is the likeliest state of all: `ANTHROPIC_API_KEY` is one of the three
//     keys still sitting in PING-INBOX. "0 calls need summaries" on a loop that cannot
//     summarise anything is how the missing key stays invisible for another week.
//
//  2. AN EXISTING SUMMARY IS NEVER RE-ASKED. A blank `summary` is the only honest marker of
//     "never summarised" — `callSummaryPatch` (inc.11) refuses to write a blank one, so any
//     non-blank text came from a completed model call. Re-summarising would spend money to
//     REPLACE a paragraph a rep may already have read, pasted into an email and quoted to a
//     customer. Whitespace is not text: `"  "` reads as summarised and says nothing, so it
//     counts as owed.
//
//  3. ONLY A `complete` TRANSCRIPT WITH WORDS IS OWED A SUMMARY. This is `summaryOwed`
//     (inc.12) held one layer out, and each rejected state gets its OWN reason instead of
//     collapsing into "not ready":
//       • no transcript row at all → the transcript backfill owns this call, not us;
//       • `pending` → in flight, a later pass gets it;
//       • `failed` → there are no words to summarise and re-transcribing is inc.33's job;
//       • `complete` with 0 segments → a call in which nobody spoke. Handing that to a
//         model is precisely how an unanswered call acquires a paragraph about what was
//         discussed. It is not a defect to repair; it is a finished, silent call.
//
//  4. THE CAP MEANS WHAT IT MEANS. Omitted = uncapped; `<= 0` is a REAL cap that plans
//     nothing (never silently "no limit given"); `remaining` reports the eligible calls a
//     cap left behind so an operator knows a second pass is owed. Identical semantics to
//     inc.33 rule 6 on purpose — two backfills whose `limit` means different things is a
//     trap laid for the person running both.
//
//  5. NEWEST FIRST, DETERMINISTICALLY. The summary a rep is waiting for is this morning's,
//     not March's. The `activityId` tie-break is not cosmetic: two calls sharing a
//     timestamp must order identically on every pass, or a cap takes a different one each
//     time and neither ever runs.
//
//  6. ONE RECORDING SID IS PLANNED ONCE. Duplicate rows for one recording would otherwise
//     buy the same summary twice and write it to two timelines.
//
//  7. THE LOG CARRIES COUNTS, IDS AND REASONS — NEVER WORDS. Same rule as `backfillPlanLog`
//     and `callPipelineLog`: the thing this plan is about is prose describing a customer
//     conversation. Nothing quotable leaves here.

import type { Activity } from "@/lib/types";
import type { BackfillState } from "./transcriptBackfill";

/** One already-filed call, reduced to what the summary decision needs. */
export type SummaryCandidate = {
  activityId: string;
  recordingSid: string | null;
  /** Whatever the row currently holds. Blank/absent = never successfully summarised. */
  summary: string | null | undefined;
  /** ISO. Ordering only — never parsed into a clock here. */
  occurredAt: string;
};

export type SummarySkipReason =
  | "no-recording-sid"
  | "duplicate-recording-sid"
  | "already-summarised"
  | "never-transcribed"
  | "transcript-in-flight"
  | "transcript-failed"
  | "no-segments";

export type SummaryRun = {
  activityId: string;
  recordingSid: string;
  /** Carried so the executor never re-reads 0021 to find out how much it is about to send. */
  segments: number;
};

export type SummarySkip = {
  activityId: string;
  recordingSid: string | null;
  reason: SummarySkipReason;
};

export type SummaryBackfillPlan =
  | { kind: "not-configured"; missing: readonly string[] }
  | {
      kind: "planned";
      runs: readonly SummaryRun[];
      skipped: readonly SummarySkip[];
      /** Eligible calls the limit left for a later pass (rule 4). */
      remaining: number;
    };

export type SummaryBackfillInput = {
  candidates: readonly SummaryCandidate[];
  /** recording sid -> what 0021 holds. Absent = never transcribed (rule 3). */
  transcripts: ReadonlyMap<string, BackfillState>;
  /** Empty = configured. Non-empty = the env names that are missing (rule 1). */
  missingConfig?: readonly string[];
  /** Positive caps the pass. Omitted = uncapped. `<= 0` plans nothing and says so. */
  limit?: number;
};

/**
 * Reduce a stored activity to a summary-backfill candidate.
 *
 * The same gate as `backfillCandidate`: only a `dialer` `call` qualifies. A manually logged
 * call has no recording and no transcript behind it, so it can never be owed a summary —
 * and handing its id to a summariser would ask a model to describe a conversation it has no
 * words for. Returns null rather than a candidate with empty fields, so "not a recorded
 * call" never lands in the skip list next to real defects.
 */
export function summaryCandidate(activity: Activity): SummaryCandidate | null {
  if (activity.type !== "call" || activity.source !== "dialer") return null;
  const ctx = (activity.sourceContext ?? {}) as Record<string, unknown>;
  const raw = ctx.recordingSid;
  const sid = typeof raw === "string" ? raw.trim() : "";
  return {
    activityId: activity.id,
    recordingSid: sid || null,
    summary: activity.summary,
    occurredAt: activity.occurredAt,
  };
}

/**
 * Is this call owed a summary?
 *
 * Exported because it is the one judgement a caller might re-implement from a status string
 * and a truthiness check — and a second copy is how rules 2 and 3 get lost. `ok` carries the
 * segment count so the planner never re-reads it.
 */
export function summaryBackfillReason(
  summary: string | null | undefined,
  state: BackfillState | undefined
): { ok: true; segments: number } | { ok: false; reason: SummarySkipReason } {
  // Rule 2 first: an already-summarised call is done regardless of what 0021 holds, and
  // reporting it as "never-transcribed" because its transcript row was pruned would send an
  // operator repairing a call that has exactly what it needs.
  if ((summary ?? "").trim()) return { ok: false, reason: "already-summarised" };
  if (!state) return { ok: false, reason: "never-transcribed" };
  if (state.status === "pending") return { ok: false, reason: "transcript-in-flight" };
  if (state.status === "failed") return { ok: false, reason: "transcript-failed" };
  if (state.segmentCount <= 0) return { ok: false, reason: "no-segments" };
  return { ok: true, segments: state.segmentCount };
}

/** Newest call first, with a stable tie-break (rule 5). */
function newestFirst(a: SummaryCandidate, b: SummaryCandidate): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  return a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0;
}

export function planSummaryBackfill(input: SummaryBackfillInput): SummaryBackfillPlan {
  const missing = input.missingConfig ?? [];
  if (missing.length > 0) return { kind: "not-configured", missing: [...missing] };

  const runs: SummaryRun[] = [];
  const skipped: SummarySkip[] = [];
  const seen = new Set<string>();
  // Uncapped is expressed as Infinity so a `0` limit stays a real cap (rule 4) instead of
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

    const verdict = summaryBackfillReason(c.summary, input.transcripts.get(sid));
    if (!verdict.ok) {
      skipped.push({ activityId: c.activityId, recordingSid: sid, reason: verdict.reason });
      continue;
    }

    eligible += 1;
    if (runs.length < limit) {
      runs.push({ activityId: c.activityId, recordingSid: sid, segments: verdict.segments });
    }
  }

  return { kind: "planned", runs, skipped, remaining: Math.max(0, eligible - runs.length) };
}

/** Skip reasons tallied by name — an operator reads the counts, never the calls (rule 7). */
export function summaryBackfillLog(plan: SummaryBackfillPlan): Record<string, unknown> {
  if (plan.kind === "not-configured") {
    return { kind: "not-configured", missing: [...plan.missing] };
  }
  const skipped: Record<string, number> = {};
  for (const s of plan.skipped) skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
  return {
    kind: "planned",
    runs: plan.runs.length,
    // Segments are the size of what we are about to send a model — the one number that
    // predicts the bill. The words themselves stay in 0021.
    segments: plan.runs.reduce((n, r) => n + r.segments, 0),
    remaining: plan.remaining,
    skipped,
  };
}
