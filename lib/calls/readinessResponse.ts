// BUILD-QUEUE Q68 inc.22 — THE OPERATOR DOOR: what the arming report is allowed to answer.
//
// inc.21 built `callChainReadiness` and NOTHING CALLS IT. A report that has to be read out
// of a source file cannot do the one job it exists for — being checked at the moment Rob
// adds a key. This is the decision half of the route that finally does; the route itself
// reads env and the clock and nothing else (CR-3), the same split as inc.17's
// `transcriptResponse` -> `/api/calls/transcript`.
//
// FOUR RULES THAT ARE NOT OBVIOUS:
//
//  1. THE REPORT DESCRIBES THE RUNNING DEPLOYMENT, NOT THE VERCEL DASHBOARD. Env values are
//     picked up by a BUILD; `vercel env add` on its own changes nothing that is currently
//     serving. Without saying so, the very first use of this endpoint is: Rob adds the key
//     he was asked for, re-checks, still reads `dormant`, and concludes the chain is broken
//     — or adds the key a second time. That is inc.14's rule ("never blame a provider for a
//     switched-off key") turned on ourselves one layer further out, so the caveat is part of
//     the payload rather than something a human is expected to remember.
//
//  2. ONE NEXT STEP, DERIVED — never a list to triage. inc.21 already ordered `missing` by
//     the moment each key first changes an observable outcome; the whole value of that
//     ordering is lost if the reader is handed four stages and left to pick. `missing[0]`
//     IS the next step, and it is the only one quoted.
//
//  3. A WARNING NEVER BECOMES THE NEXT STEP. `TWILIO_CALLER_ID` is a correctness hazard, not
//     a blocker (inc.21) — promoting it here would tell Rob to go add an env var when the
//     actual next move is to place a call, which is the one thing config can never do for
//     him. Test-pinned in both directions.
//
//  4. `proven: false` TRAVELS THROUGH UNTOUCHED and the final next step is a CALL, not a
//     completion. When every key is armed this endpoint still cannot say the DoD is met;
//     an operator surface that congratulated itself on a full set of env vars is exactly
//     how "a real recorded call appears on the timeline with a summary" gets ticked without
//     one ever having happened.
//
// KEYS DO NOT REACH THIS FILE EITHER. Input is inc.21's report, which is already four
// booleans wide; a test puts realistic-looking secrets in env and pins that no fragment of
// one appears in the serialised body.

import type { EvidenceSection } from "./callEvidence";
import type { CallChainReadiness } from "./callReadiness";
import type { RepairReadiness } from "./repairReadiness";

/**
 * Stated once, here, because it is the difference between a report that is read correctly
 * and a report that is read as a lie. Deliberately mentions the redeploy rather than only
 * the `vercel env add`, since the add is the half Rob has already been asked for twice.
 */
export const DEPLOY_SNAPSHOT_NOTE =
  "Env presence is read from the deployment currently serving this URL. `vercel env add` does not alter a running deployment — the value is picked up by the next build, so add the key, redeploy, then re-check here.";

/** The one thing to do next when every stage is armed. Never phrased as completion. */
export const PLACE_A_CALL_STEP =
  "Place one real recorded call and open that contact's timeline. Nothing on this page is evidence a call has ever worked — only a call is.";

/**
 * The only sentence in this file that reports the DoD as met, and it is reachable ONLY from
 * a `read` evidence section whose counts prove themselves. It still names what the proof is
 * — a summarised call — rather than saying "done", so the claim can be checked rather than
 * believed.
 */
export const DOD_MET_STEP =
  "Nothing. A real recorded call has reached a summary on this deployment — the chain is proven end to end.";

export interface CallReadinessResponse extends CallChainReadiness {
  /** Injected, never read from the clock in here — this module stays pure. */
  checkedAt: string;
  /** Rule 1: the payload carries its own read-me. */
  configNote: string;
  /** Rule 2/3: exactly one action, derived from the blocking cascade only. */
  nextStep: string;
  /**
   * inc.43 — the two repair doors, in their OWN section (repairReadiness rule 1). They
   * answer a different question from the stages above: not "how far does the next call
   * get" but "can the calls already filed be repaired". Carried here rather than composed
   * in the route so the whole payload is one pure function's answer (CR-3).
   */
  repair: RepairReadiness;
  /**
   * inc.46 — the OTHER half of the report: not "how far would the next call get" but "how
   * far has any call ACTUALLY got". Required for the same reason `repair` is (rule 5): an
   * optional section is one a route forgets to pass, and the endpoint then keeps answering
   * 200 with a report that has quietly stopped mentioning whether the DoD is met.
   */
  evidence: EvidenceSection;
}

/**
 * Rule 5 (inc.43): `repair` IS REQUIRED, NOT OPTIONAL. An optional section is one a route
 * forgets to pass, and the failure mode is silent — the endpoint keeps answering 200 with
 * a report that has simply stopped mentioning the doors.
 */
export function callReadinessResponse(
  readiness: CallChainReadiness,
  checkedAt: string,
  repair: RepairReadiness,
  evidence: EvidenceSection,
): CallReadinessResponse {
  // RULE 3 EXTENDED (inc.43): `nextStep` STILL COMES ONLY FROM THE LIVE CASCADE. A repair
  // door is about a backlog, and on a deployment where no call has ever run there is no
  // backlog — telling Rob to add CRON_SECRET before a single call has arrived sends him to
  // arm a door onto an empty room, and buries the one step that changes anything. The
  // doors are reported; they never become the ask. Test-pinned.
  const blocking = readiness.missing[0];
  // RULE 4, NOW ANSWERABLE (inc.46). Until this increment the armed-and-nothing-left branch
  // could only ever say "place a call", because the report had no way to know whether one
  // already had been — so it repeated the ask forever, including to a Rob who had already
  // done it. Evidence changes only THIS branch and only on `proven`, which is `summarised >
  // 0` with no contradictions: an `unreadable` section, or any count that disagrees with
  // itself, keeps the ask exactly where it was. A key still outranks all of it (rule 3):
  // a chain missing a key is not made whole by an old call that ran before it broke.
  const provenNow = evidence.state === "read" && evidence.evidence.proven;
  return {
    ...readiness,
    checkedAt,
    configNote: DEPLOY_SNAPSHOT_NOTE,
    nextStep: blocking
      ? `Add ${blocking} to the dashboard's Vercel project (production), then redeploy.`
      : provenNow
        ? DOD_MET_STEP
        : PLACE_A_CALL_STEP,
    repair,
    evidence,
  };
}

/**
 * The log line for a readiness check. Counts and states only — the same discipline as
 * inc.17's `transcriptReadLog`, for the same reason: this is a surface anyone can hit, and
 * a log is the one place a secret gets copied into without anyone deciding to.
 */
export function callReadinessLog(res: CallReadinessResponse) {
  return {
    evt: "calls.readiness",
    verdict: res.verdict,
    reached: res.reached,
    missing: res.missing.length,
    warnings: res.warnings.length,
    // inc.43: counts only, and kept SEPARATE from `missing` above — a single summed number
    // would make an unset CRON_SECRET indistinguishable in the logs from a chain key.
    repairDoorsOpen: res.repair.doors.filter((d) => d.state === "open").length,
    repairMissing: res.repair.missing.length,
    // inc.46: the evidence half, states and counts only — `unreadable` is logged as its own
    // reach rather than as `none`, so a grep for "never used" cannot match a broken read.
    evidenceReach: res.evidence.state === "read" ? res.evidence.evidence.reach : "unreadable",
    evidenceProven: res.evidence.state === "read" && res.evidence.evidence.proven,
  };
}
