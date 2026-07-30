// Q46 R9 inc.1 (rep cockpit wiring, research §5 Δ9) — the pure seam behind the
// per-stage guidance line: ONE sentence telling a rep what "done" means at the
// stage this account is actually in.
//
// WHY ONE LINE AND NOT A PLAYBOOK (research §2.7, and the skepticism is the
// point): Salesforce Path allows 1,000 characters of "Guidance for Success" per
// stage and HubSpot ships whole talk-track playbooks — and guided selling fails
// more often than it works, because generic process illustrations "don't help
// reps assess the specific situation" (sbigrowth.com/insights/sales-playbooks)
// and over-alerting trains reps to ignore everything (prospeo.io). Research
// pinned the smallest set that changes behaviour: the four todayRules triggers,
// plus ONE static line of stage guidance. So the cap is not a stylistic
// preference — it is the feature. `guidanceLineFor` is length-capped and the
// test suite fails if a line grows, which is the only thing that stops this
// file becoming the wizard research told us not to build.
//
// THE FAILURE MODE THIS SHAPE PREVENTS: a line that tells a rep to chase a
// signature on a deal that is actually sitting in OUR invoicing queue. That is
// worse than silence, because the rep calls a customer who already said yes and
// asks them for something we owe THEM. So guidance carries a KIND, never just a
// string: `advance` (the rep has the next move), `waiting` (the ball is not
// theirs — and the line says whose it is), `closed` (no next move exists).
// Collapsing `waiting` into `advance` is the bug above; collapsing `closed` into
// `waiting` tells a rep a lost deal is still live.
//
// AND EVERY LINE NAMES SOMETHING THIS CRM ACTUALLY HAS — a logged interaction, a
// booked meeting, a sent quote, a signature request, an invoice — because that
// is the difference between guidance and a motivational poster. If a line cannot
// point at a real artifact, it does not belong here.

import type { DealStage } from "../types";
import { STAGE_LABELS } from "../labels";

/**
 * Who the next move belongs to.
 *
 * - `advance` — the rep. There is a concrete thing to do today.
 * - `waiting`  — someone else (us, or the customer). The rep should NOT push.
 * - `closed`   — nothing. No line pretends otherwise.
 */
export type GuidanceKind = "advance" | "waiting" | "closed";

/**
 * Hard cap on a guidance line, asserted in tests.
 *
 * 120 characters is roughly one screen line beside the stage chip at desktop
 * width. The number matters less than the fact that a build fails when someone
 * tries to make this a paragraph.
 */
export const GUIDANCE_MAX_CHARS = 120;

export interface StageGuidance {
  kind: GuidanceKind;
  /** The single line a rep reads. Never empty, never two sentences of advice. */
  line: string;
}

/**
 * One line per stage — all twelve, no holes.
 *
 * Typed as a total `Record<DealStage, …>` deliberately: adding a stage to the
 * ladder (as Q45 did with `meeting_booked`) must break the compile here rather
 * than silently ship a rep an account with no guidance at all.
 */
export const STAGE_GUIDANCE: Record<DealStage, StageGuidance> = {
  new_lead: {
    kind: "advance",
    line: "Done = first contact attempted and logged. Log it even if nobody picked up.",
  },
  contacted: {
    kind: "advance",
    line: "Done = a meeting on the calendar. If they went quiet, one more attempt, then log it.",
  },
  meeting_booked: {
    kind: "advance",
    line: "Done = the meeting happened. Confirm the day before — a no-show costs a week.",
  },
  meeting_held: {
    kind: "advance",
    line: "Done = a quote sent with a number in it. Send it today while the call is warm.",
  },
  quote_sent: {
    kind: "waiting",
    line: "Their move. Follow up once, ask what is missing, and do not re-send the same quote.",
  },
  negotiating: {
    kind: "advance",
    line: "Done = signature requested. Get scope and phase agreed in writing before you send it.",
  },
  signed: {
    kind: "waiting",
    line: "Ours now — invoicing is on us. Tell the customer what happens next, then hand off.",
  },
  invoiced: {
    kind: "waiting",
    line: "Waiting on payment. Chase only if it is past due; the ledger shows what is owed.",
  },
  paid: {
    kind: "advance",
    line: "Done = their Growth Scan presented. That call is where Phase 2 gets sold.",
  },
  delivering: {
    kind: "waiting",
    line: "Delivery is on us. Stay in touch anyway — a quiet build is how a customer drifts.",
  },
  stalled: {
    kind: "advance",
    line: "Done = a real answer, yes or no. One honest call beats six months of maybe.",
  },
  lost: {
    kind: "closed",
    line: "Closed. Nothing to work — reopen it only if they come back to you.",
  },
};

/**
 * Guidance for a stage, or `undefined` when there is no stage to guide.
 *
 * NO DEAL IS NOT STAGE ZERO — the same refusal R5's stage chip, R6's draft
 * picker and R7's shelf make. A record with no anchored deal gets NO line,
 * because every line here is advice about a deal; inventing `new_lead` guidance
 * for an account nobody has opened a deal on would tell a rep to work a pipeline
 * entry that does not exist.
 */
export function guidanceFor(stage: DealStage | undefined): StageGuidance | undefined {
  return stage === undefined ? undefined : STAGE_GUIDANCE[stage];
}

export interface GuidanceView {
  /** Absent exactly when there is no anchored deal. */
  guidance?: StageGuidance;
  /** The stage's display label, so a surface never re-derives it. */
  stageLabel?: string;
  /**
   * Why there is no guidance. Populated exactly when `guidance` is absent — the
   * honest render is "no deal on this account yet", never a blank space a rep
   * reads as a loading bug.
   */
  blocker?: string;
}

/**
 * The whole guidance rail for one account, resolved once for the surface.
 *
 * Mirrors `collateralViewsFor` / `draftViewsFor` on purpose: the account
 * workspace reads ONE stage off ONE anchored deal and hands it to every rail,
 * so the chip, the drafts, the shelf and this line cannot disagree about what
 * stage this customer is in.
 */
export function guidanceViewFor(stage: DealStage | undefined): GuidanceView {
  const guidance = guidanceFor(stage);
  if (!guidance) {
    return {
      blocker: "No deal on this account yet, so there is no stage to guide.",
    };
  }
  return { guidance, stageLabel: STAGE_LABELS[stage as DealStage] };
}
