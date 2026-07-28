// Master View 2.0 §3.1 — the Phase Blueprint, built as data.
//
// Pure per CR-3: no clock, no network, no store. The page hands in what it
// already loaded; this decides what the tracker says. Two renderers consume the
// SAME structure — the master tracker (money + refund) and the rep tracker
// (lights only) — so the two can never drift into disagreeing about progress.
//
// WHAT IS REAL TODAY vs WHAT WAITS FOR A SIGNAL — stated here because the
// distinction is the whole honesty of this screen:
//   • kickoff steps  → REAL. Derived from key dates already on the deals.
//   • component lights → only from STORED live_at. There is no signal source
//     yet (Will's tools send the webhook in increment 9), and no field on a
//     company can honestly stand in for "the Everything Agent is running".
//     An unlit board is the truth; a guessed one would be a lie Rob shows a
//     customer. `signalSource` says which it is, out loud, on the page.

import {
  componentDefsFor,
  PHASE_TITLES,
  PHASE_SUBTITLES,
  PHASE_2_ROI_GUARANTEE_MONTHS,
  REFUND_TRIGGER_SLUG,
  type PhaseNo,
} from "./components";
import { refundStatus, type RefundStatus } from "./refund";
import {
  phase2Guarantee,
  type Phase2GuaranteeStatus,
  type Phase2Returns,
} from "./phase2Guarantee";
import { aimForNext, type AimForNext, type AutomationPick } from "./aimForNext";

/** Stored component state, keyed by slug. `phase_components` when it lands. */
export type ComponentLiveMap = Record<string, { liveAt?: string; source?: string } | undefined>;

export interface KickoffStep {
  key: "meeting_booked" | "quoted" | "signed" | "invoiced" | "paid";
  label: string;
  at?: string;
  done: boolean;
}

export interface ComponentState {
  slug: string;
  label: string;
  meaning: string;
  liveAt?: string;
  live: boolean;
  /** True for a P2/P3 slot nobody has filled — renders as "empty slot". */
  isEmptySlot: boolean;
}

export interface PhaseMoney {
  /** Reported, never derived. Undefined means "we do not know", not zero. */
  value?: number;
  standardPrice?: number;
  invoicedAt?: string;
  paidAt?: string;
  agreementRef?: string;
  /** How this money got attached to this phase — printed, never assumed. */
  attribution: "stored" | "inferred_sole_deal" | "none";
  /** Plain line for the "no money yet" case, so the component never composes copy. */
  emptyLine?: string;
}

export interface PhaseSection {
  phase: PhaseNo;
  title: string;
  subtitle?: string;
  /** Demo grammar (§3.1): the visual state, applied to an always-full section. */
  visual: "complete" | "live" | "next" | "locked";
  badge?: string;
  components: ComponentState[];
  liveCount: number;
  totalCount: number;
  money: PhaseMoney;
  /** Phase 1 only. */
  refund?: RefundStatus;
  /** Phase 2 only — the label ("3-month ROI guarantee"), not the state. */
  roiGuaranteeMonths?: number;
  /**
   * Phase 2 only — the guarantee's actual STATE (Q40 leg 5). A label says what
   * was promised; this says where the promise stands, including the honest
   * "we have not measured yet", which is not a shortfall.
   */
  roiGuarantee?: Phase2GuaranteeStatus;
}

export interface Blueprint {
  kickoff: KickoffStep[];
  phases: PhaseSection[];
  /** True once anything can light a component. False = board is honestly dark. */
  signalSource: boolean;
  /** One line the page prints when signalSource is false. */
  signalNote?: string;
  /**
   * Q40 leg (6) — the P1→P2 aim-for-next slot. Always present so a renderer
   * reads one boolean (`aimForNext.visible`) instead of re-deciding, in JSX,
   * whether a paying customer should be pitched the next phase.
   */
  aimForNext: AimForNext;
}

/** Only the deal fields the blueprint reads — CompanyDealRow satisfies this. */
export interface BlueprintDeal {
  id: string;
  name: string;
  stage: string;
  value?: number;
  keyDates: {
    met?: string;
    quoted?: string;
    signed?: string;
    invoiced?: string;
    paid?: string;
    meetingBooked?: string;
  };
  /** Set when the deal reached the company through a person, not its own orgId. */
  anchoredVia?: string;
  /**
   * Q40 leg (5) — the phase this agreement is FOR, as recorded by a rep
   * ("agreements carry their ASSOCIATED PHASE"). Absent = nobody has said,
   * which is not the same as Phase 1; see `attributePhaseMoney`.
   */
  phase?: PhaseNo;
}

export interface BlueprintInput {
  deals: BlueprintDeal[];
  components?: ComponentLiveMap;
  /** Standard list price per phase (config, §3.1 "Pricing"). */
  standardPrices?: Partial<Record<PhaseNo, number>>;
  /** ISO date the customer advanced to Phase 2, when known. */
  advancedToPhase2At?: string;
  /**
   * Measured Phase 2 returns, when someone has measured them. There is no store
   * for these yet, so this is absent today and the guarantee reports
   * AWAITING_DATA rather than a fabricated 100% shortfall.
   */
  phase2Returns?: Phase2Returns;
  /**
   * Q40 leg (6) — this customer's recommended Phase 2 automations, when someone
   * has picked them. Supplied by `loadScanPicks` (inc.17) off 0027; absent means
   * the slot reports the shortlist unpicked rather than showing a template list.
   */
  automationPicks?: AutomationPick[];
  /**
   * Q40 leg (6) inc.17 — the picks store was asked and did not answer.
   *
   * Threaded through untouched: whether a failed read may be rendered as "nothing
   * picked" is `aimForNext`'s decision, and it is answered there once.
   */
  automationPicksUnavailable?: boolean;
  /** Evaluation time. Always passed — never read from the clock in here. */
  asOf: string;
}

const KICKOFF_LABELS: Record<KickoffStep["key"], string> = {
  meeting_booked: "Meeting booked",
  quoted: "Quote",
  signed: "Signed",
  invoiced: "Invoiced",
  paid: "Paid",
};

/**
 * The pre-Phase-1 sales journey as lit steps (§3.1 "Kickoff steps"). Rob retired
 * "Met" as a tracked concept — "What I care about is booked meetings whether in
 * person or over the phone" — so `met` is NOT read here even though rows still
 * carry it. A booked-meeting date is the first light; absent one, the step is
 * simply unlit rather than back-filled from `met`.
 */
export function kickoffSteps(deals: BlueprintDeal[]): KickoffStep[] {
  const earliest = (pick: (d: BlueprintDeal) => string | undefined): string | undefined => {
    const all = deals.map(pick).filter((v): v is string => Boolean(v));
    return all.length ? all.sort()[0] : undefined;
  };
  const at: Record<KickoffStep["key"], string | undefined> = {
    meeting_booked: earliest((d) => d.keyDates.meetingBooked),
    quoted: earliest((d) => d.keyDates.quoted),
    signed: earliest((d) => d.keyDates.signed),
    invoiced: earliest((d) => d.keyDates.invoiced),
    paid: earliest((d) => d.keyDates.paid),
  };
  return (Object.keys(KICKOFF_LABELS) as KickoffStep["key"][]).map((key) => ({
    key,
    label: KICKOFF_LABELS[key],
    at: at[key],
    done: Boolean(at[key]),
  }));
}

const LOST_STAGES = new Set(["lost"]);

/**
 * Phase 1 money attribution. There is no phase field on a deal until the phase
 * store lands, so the ONLY safe inference is a sole candidate: exactly one
 * non-lost deal anchored to the company's own id. Two candidates means we do
 * not know which is the Phase 1 paper, and picking one would put a number under
 * a phase heading on a screen Rob shows customers. Two → attribution "none".
 */
export function inferPhaseOneMoney(
  deals: BlueprintDeal[],
  standardPrice?: number
): PhaseMoney {
  // A deal a rep has already assigned to Phase 2 or 3 is not a Phase 1 candidate.
  // Excluding it makes the sole-candidate test STRICTER where the answer is known
  // and never weaker: inference may only ever fill a silence, never contradict a
  // recorded fact.
  const candidates = deals.filter(
    (d) => !LOST_STAGES.has(d.stage) && !d.anchoredVia && (d.phase === undefined || d.phase === 1)
  );
  if (candidates.length !== 1) {
    return {
      attribution: "none",
      standardPrice,
      emptyLine:
        candidates.length === 0
          ? "No agreement on file for this phase"
          : `${candidates.length} deals on this company — which one is the Phase 1 agreement is not recorded, so no figure is shown here. See Deals.`,
    };
  }
  const d = candidates[0];
  return {
    value: d.value,
    standardPrice,
    invoicedAt: d.keyDates.invoiced,
    paidAt: d.keyDates.paid,
    agreementRef: d.name,
    attribution: "inferred_sole_deal",
  };
}

function emptyMoney(phase: PhaseNo, standardPrice?: number): PhaseMoney {
  return {
    attribution: "none",
    standardPrice,
    emptyLine: `No agreement yet · not invoiced`,
  };
}

/**
 * Q40 leg (5) — money attached to a phase because a REP SAID SO, not because we
 * guessed. This is the source the Phase 2 ROI guarantee has been missing: the
 * investment IS the target, so where that number comes from is a money decision,
 * and it is made once, here.
 *
 * The rules, each of which exists because its opposite is a lie Rob shows a paying
 * customer:
 *
 *  • A recorded phase always beats inference. Inference only ever fills a silence.
 *
 *  • Several agreements CAN belong to one phase (a mid-phase add-on), so they are
 *    summed — the phase's investment is what the customer actually committed.
 *
 *  • …but ONLY if every one of them carries a value. A valueless agreement is an
 *    unknown amount, never zero, and summing around it would UNDERSTATE the
 *    investment. Understating the investment understates the ROI target, which
 *    inflates the guarantee in our favour — the one direction this number must
 *    never be wrong in. Mixed → the total is withheld and the gap is named.
 *
 *  • Invoiced/paid are LATEST-of-all, and only once every agreement in the phase
 *    carries that date. "This phase is paid" must mean all of it is paid; the
 *    earliest date would let one settled add-on mark an unpaid phase as settled.
 */
export function attributePhaseMoney(
  deals: BlueprintDeal[],
  phase: PhaseNo,
  standardPrice?: number
): PhaseMoney {
  const stored = deals.filter((d) => d.phase === phase && !LOST_STAGES.has(d.stage));
  if (stored.length === 0) {
    // No recorded answer for this phase. Phase 1 may still infer a sole candidate
    // (long-standing behaviour); 2 and 3 have never had an inference and get none
    // now — a guessed Phase 2 investment would become a guessed ROI target.
    return phase === 1
      ? inferPhaseOneMoney(deals, standardPrice)
      : emptyMoney(phase, standardPrice);
  }

  const valued = stored.filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
  const complete = valued.length === stored.length;
  const value = complete ? valued.reduce((sum, d) => sum + (d.value as number), 0) : undefined;

  const allOn = (pick: (d: BlueprintDeal) => string | undefined): string | undefined => {
    const dates = stored.map(pick).filter((v): v is string => Boolean(v));
    return dates.length === stored.length && dates.length > 0 ? dates.sort().at(-1) : undefined;
  };

  const missing = stored.length - valued.length;
  return {
    value,
    standardPrice,
    invoicedAt: allOn((d) => d.keyDates.invoiced),
    paidAt: allOn((d) => d.keyDates.paid),
    agreementRef:
      stored.length === 1 ? stored[0].name : `${stored.length} agreements on this phase`,
    attribution: "stored",
    emptyLine: complete
      ? undefined
      : `${missing} of ${stored.length} agreement${stored.length === 1 ? "" : "s"} on this phase carr${missing === 1 ? "ies" : "y"} no value, so the phase total is unknown — not zero. See Deals.`,
  };
}

function statesFor(phase: PhaseNo, components?: ComponentLiveMap): ComponentState[] {
  return componentDefsFor(phase).map((def) => {
    const stored = components?.[def.slug];
    const liveAt = stored?.liveAt;
    return {
      slug: def.slug,
      label: def.label,
      meaning: def.meaning,
      liveAt,
      live: Boolean(liveAt),
      isEmptySlot: phase !== 1 && def.label === "empty slot",
    };
  });
}

export function buildBlueprint({
  deals,
  components,
  standardPrices,
  advancedToPhase2At,
  phase2Returns,
  automationPicks,
  automationPicksUnavailable,
  asOf,
}: BlueprintInput): Blueprint {
  const sections: PhaseSection[] = ([1, 2, 3] as PhaseNo[]).map((phase) => {
    const comps = statesFor(phase, components);
    const liveCount = comps.filter((c) => c.live).length;
    // Q40 inc.9 — one entry point for all three phases. A recorded phase-on-
    // agreement now feeds Phase 2's money, and therefore the ROI target below.
    const money = attributePhaseMoney(deals, phase, standardPrices?.[phase]);
    return {
      phase,
      title: PHASE_TITLES[phase],
      subtitle: PHASE_SUBTITLES[phase],
      visual: "locked",
      components: comps,
      liveCount,
      totalCount: comps.length,
      money,
      refund:
        phase === 1
          ? refundStatus({
              startedAt: components?.[REFUND_TRIGGER_SLUG]?.liveAt,
              advancedAt: advancedToPhase2At,
              asOf,
            })
          : undefined,
      roiGuaranteeMonths: phase === 2 ? PHASE_2_ROI_GUARANTEE_MONTHS : undefined,
      // Q40 inc.8 — leg (5) reaches the board. The guarantee is a MONEY PROMISE,
      // so its two inputs are only ever real ones:
      //   • the clock starts from the recorded advance date, never from "today";
      //   • the target is the Phase 2 investment we actually attributed to this
      //     phase — never `standardPrice`, which is a list number the customer
      //     never agreed to, and never a deal we merely guessed belongs here.
      // inc.9 gave that target its only honest source: an agreement a rep has
      // RECORDED as Phase 2 paper. Until one exists (no store yet), `money.value`
      // is undefined here and the guarantee says so instead of inventing a figure.
      roiGuarantee:
        phase === 2
          ? phase2Guarantee({
              startedAt: advancedToPhase2At,
              investment: money.attribution === "none" ? undefined : money.value,
              returns: phase2Returns,
              asOf,
            })
          : undefined,
    };
  });

  // Demo grammar: the current phase is the lowest one not complete. A phase with
  // zero components can never be "complete" — an empty P2 slot board means the
  // phase has not been scoped, not that it is finished. Without that guard, a
  // brand-new company reads as having completed all three phases.
  const isComplete = (s: PhaseSection) => s.totalCount > 0 && s.liveCount === s.totalCount;
  let current = sections.findIndex((s) => !isComplete(s));
  if (current === -1) current = sections.length - 1;

  sections.forEach((s, i) => {
    if (i < current) {
      s.visual = "complete";
      s.badge = "Complete";
    } else if (i === current) {
      s.visual = "live";
      s.badge = "Live now";
    } else if (i === current + 1) {
      s.visual = "next";
      s.badge = "Next up";
    } else {
      s.visual = "locked";
    }
  });

  const signalSource = Boolean(
    components && Object.values(components).some((c) => c?.liveAt)
  );

  // Q40 leg (6). Every input is one already decided above — the Phase 1 lights,
  // the Phase 1 refund FSM and the Phase 2 attribution — so the aim-for-next
  // panel cannot contradict the phase sections rendered beside it.
  const p1 = sections[0];
  const p2 = sections[1];
  const aim = aimForNext({
    phase1LiveCount: p1.liveCount,
    phase1TotalCount: p1.totalCount,
    growthScanLiveAt: components?.["growth-scan"]?.liveAt,
    phase2Attribution: p2.money.attribution,
    refund: p1.refund,
    recommendations: automationPicks,
    picksUnavailable: automationPicksUnavailable,
    slotCount: p2.totalCount,
    asOf,
  });

  return {
    kickoff: kickoffSteps(deals),
    phases: sections,
    aimForNext: aim,
    signalSource,
    signalNote: signalSource
      ? undefined
      : "No component has been reported live yet. Delivery signals arrive from the partner tools once the webhook is wired; until then these can be switched on by hand. Nothing here is guessed from other fields.",
  };
}
