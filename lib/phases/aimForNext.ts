// Q40 leg (6) — the aim-for-next slot: "Top Automations we recommend".
//
// Rob, 7.22.26-3 (verbatim intent): between P1 and P2 the customer is shown the
// "Top Automations we recommend" — the aim-for-next slot. `growth-scan`'s own
// canon line already names this as its purpose: "Tech-stack scan complete —
// seeds the Top Automations slot."
//
// Pure per CR-3: no clock, no store, no network. `asOf` and every input are
// parameters, so two renders of the same record can never disagree about
// whether a customer is being pitched the next phase.
//
// THIS FILE IS A SALES SURFACE POINTED AT A PAYING CUSTOMER, and that is why the
// decision lives in code instead of in a component's JSX. Three things can go
// wrong here, each of which costs the customer something real:
//
//   1. Recommending BEFORE the scan. The picks are supposed to come out of the
//      AI Growth Scan of THEIR stack. A generic list rendered before the scan
//      lands is a guess wearing the clothes of an audit. We show the slot and
//      say the scan is what fills it — an empty state that explains itself.
//
//   2. Recommending DURING the open refund window without saying so. Advancing
//      to Phase 2 inside the 30 days VOIDS the Phase 1 refund (refund.ts).
//      An upsell that quietly costs the customer a right they currently hold is
//      the exact thing this dashboard exists not to do, so the warning rides
//      with the recommendation and is not optional.
//
//   3. Recommending AFTER they already bought Phase 2. Once a rep has recorded
//      Phase 2 paper, the picks are settled; a live "we recommend" panel would
//      imply the choice is still open and invite a second sale of the same phase.

import { DEFAULT_SLOT_COUNT } from "./components";
import type { RefundStatus } from "./refund";

export type AimForNextState =
  /** Not the moment. Nothing renders. */
  | "HIDDEN"
  /** The moment, but the Growth Scan that seeds the picks has not landed. */
  | "NO_SCAN_YET"
  /** Scan delivered; nobody has picked this customer's automations yet. */
  | "SCAN_NO_PICKS"
  /** Real picks, recorded by a human, ready to show. */
  | "READY";

export interface AutomationPick {
  /** Stable id from the automation database. Never generated here. */
  id: string;
  label: string;
  /** One line of why it was picked for THIS customer. */
  why?: string;
}

export interface AimForNextInput {
  /** How many Phase 1 components are live, and how many there are in total. */
  phase1LiveCount: number;
  phase1TotalCount: number;
  /** ISO date the AI Growth Scan went live, when it has. */
  growthScanLiveAt?: string;
  /**
   * How Phase 2's money got attached (blueprint `PhaseMoney.attribution`).
   * "stored" means a rep RECORDED Phase 2 paper — the phase is bought.
   */
  phase2Attribution: "stored" | "inferred_sole_deal" | "none";
  /** Phase 1's refund state, so an open window can be stated, not hidden. */
  refund?: RefundStatus;
  /**
   * The picks. There is no automation-recommendation store yet, so this is
   * absent today and the slot says so rather than inventing a shortlist.
   */
  recommendations?: AutomationPick[];
  /** How many Phase 2 slots exist to fill. Display default, not a promise. */
  slotCount?: number;
  /** Evaluation time, ISO. Always passed — never read from the clock in here. */
  asOf: string;
}

export interface AimForNext {
  state: AimForNextState;
  /** The single boolean a renderer needs; never re-derived from `state`. */
  visible: boolean;
  title: string;
  /** The one line the component prints. Copy is never composed in the JSX. */
  line: string;
  picks: AutomationPick[];
  slotCount: number;
  /**
   * Set when more picks exist than there are slots. Stated out loud rather than
   * silently truncated — a dropped recommendation is a decision nobody made.
   */
  overflowNote?: string;
  /**
   * Set whenever the Phase 1 refund window is still ACTIVE. Rides WITH the
   * recommendation so the two can never be rendered apart.
   */
  refundWarning?: string;
}

export const AIM_FOR_NEXT_TITLE = "Top Automations we recommend";

function hidden(slotCount: number): AimForNext {
  return {
    state: "HIDDEN",
    visible: false,
    title: AIM_FOR_NEXT_TITLE,
    line: "",
    picks: [],
    slotCount,
  };
}

/**
 * The warning that rides with every visible recommendation while the Phase 1
 * refund window is open. Built from the refund FSM's own numbers — this file
 * never counts days itself, so the panel and the refund badge cannot disagree.
 */
function refundWarningFor(refund?: RefundStatus): string | undefined {
  if (!refund || refund.state !== "ACTIVE") return undefined;
  const days = refund.daysLeft;
  return `Heads up: ${days} day${days === 1 ? "" : "s"} of the Phase 1 refund window remain. Starting Phase 2 before it ends voids the Phase 1 refund.`;
}

export function aimForNext({
  phase1LiveCount,
  phase1TotalCount,
  growthScanLiveAt,
  phase2Attribution,
  refund,
  recommendations,
  slotCount = DEFAULT_SLOT_COUNT,
  asOf: _asOf,
}: AimForNextInput): AimForNext {
  // Already bought. The picks are settled and this panel would re-open a closed
  // sale. Checked FIRST so no other condition can override it.
  if (phase2Attribution === "stored") return hidden(slotCount);

  // Nothing of Phase 1 is running yet. "What's next" before anything they paid
  // for is delivered is an upsell ahead of the deliverable, so the slot waits.
  // A phase with no components at all can never satisfy this — an unscoped
  // board is not a delivered one.
  if (phase1TotalCount === 0 || phase1LiveCount === 0) return hidden(slotCount);

  const refundWarning = refundWarningFor(refund);
  const base = {
    visible: true,
    title: AIM_FOR_NEXT_TITLE,
    slotCount,
    refundWarning,
  } as const;

  if (!growthScanLiveAt) {
    return {
      ...base,
      state: "NO_SCAN_YET",
      line: "The AI Growth Scan hasn't been delivered yet. These recommendations come out of that scan of your own stack — nothing is picked before it.",
      picks: [],
    };
  }

  const picks = recommendations ?? [];
  if (picks.length === 0) {
    return {
      ...base,
      state: "SCAN_NO_PICKS",
      line: "Growth Scan delivered. Your automation shortlist hasn't been picked yet — it's chosen from the scan, not from a template.",
      picks: [],
    };
  }

  const shown = picks.slice(0, slotCount);
  const dropped = picks.length - shown.length;
  return {
    ...base,
    state: "READY",
    line: `Picked for you from your AI Growth Scan — ${shown.length} automation${shown.length === 1 ? "" : "s"} to aim at in Phase 2.`,
    picks: shown,
    overflowNote:
      dropped > 0
        ? `${picks.length} automations were recommended and Phase 2 has ${slotCount} slot${slotCount === 1 ? "" : "s"}; ${dropped} more are not shown here. See the full scan.`
        : undefined,
  };
}
