// BUILD-QUEUE Q68 (c) inc.42 — THE SUMMARY TRIGGER'S DECISIONS: what the summary-repair
// door needs, and what its answer is allowed to say.
//
// inc.41 reduced the summary branch to one await (`runSummaryPass`). This is the last hop:
// the surface an operator touches. Its decisions live here rather than in the route (CR-3),
// and the two that matter are BOTH about telling the truth on a pass that spends money:
// which env it genuinely needs, and what the response body may carry.
//
// THE RULES, EACH ONE A REFUSED LIE:
//
//  1. DEEPGRAM IS NOT REQUIRED HERE, AND THAT IS THE POINT OF THE WHOLE BRANCH. The summary
//     backlog is the set of calls whose WORDS WE ALREADY OWN (inc.39). It never contacts
//     Twilio and never contacts Deepgram. Copying `BACKFILL_REQUIRED_ENV` wholesale would
//     make this trigger answer 503 on a deployment that has the model key and the database
//     — reporting "not configured" about a pass that could have run perfectly.
//
//  2. BOTH SUPABASE HALVES ARE REQUIRED. The 0021 evidence read is service-role or nothing
//     (inc.36); reached unset, an empty evidence map reads as "no call was ever
//     transcribed", and this pass would plan a summary for every call — each one a model
//     call billed for words it would then fail to find.
//
//  3. AN UNCONFIGURED PASS IS 503, NOT 200. Identical to inc.38 rule 4, and with
//     `ANTHROPIC_API_KEY` still in PING-INBOX that is the ONLY state this trigger runs in
//     today. A 200 saying `not-configured` reads, in any curl loop, as a pass that ran.
//
//  4. THE BODY IS THE LOG PROJECTION, NEVER THE PLAN OR THE OUTCOME. A `SummaryBackfillPlan`
//     carries activity ids and recording sids; an outcome is one field away from carrying a
//     provider error that quotes a transcript. `summaryPassLog` is already the composed,
//     test-pinned projection (inc.41 rule 6) — reusing it means a new field on either half
//     cannot leak through this door either. Counts and reasons out; words and ids stay
//     server-side.
//
//  5. THE REQUEST PARSE IS REUSED, NEVER RE-WRITTEN. `parseBackfillRequest` already refuses
//     a truthy `execute` and a malformed `limit` (inc.38 rules 1–2). Two spend triggers that
//     disagree about what `execute: "false"` means is how one of them bills a backlog.

import { parseBackfillRequest } from "./backfillTrigger";
import { summaryPassLog, type SummaryPassResult } from "./summaryPass";

/**
 * The env a summary pass genuinely needs, in the order a human should fix them — rules 1–2.
 */
export const SUMMARY_REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** The unset names, in declaration order. Empty = the pass may spend. */
export function summaryMissingConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  return SUMMARY_REQUIRED_ENV.filter((name) => !env[name]);
}

/** Rule 5 — the same parse, by import rather than by copy. */
export { parseBackfillRequest as parseSummaryRequest };

export type SummaryTriggerResponse = { status: number; body: Record<string, unknown> };

/** The answer an operator is allowed to see — rules 3 and 4. */
export function summaryTriggerResponse(result: SummaryPassResult): SummaryTriggerResponse {
  return {
    status: result.kind === "not-configured" ? 503 : 200,
    body: summaryPassLog(result),
  };
}
