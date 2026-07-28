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
  const candidates = deals.filter((d) => !LOST_STAGES.has(d.stage) && !d.anchoredVia);
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
  asOf,
}: BlueprintInput): Blueprint {
  const sections: PhaseSection[] = ([1, 2, 3] as PhaseNo[]).map((phase) => {
    const comps = statesFor(phase, components);
    const liveCount = comps.filter((c) => c.live).length;
    const money =
      phase === 1
        ? inferPhaseOneMoney(deals, standardPrices?.[1])
        : emptyMoney(phase, standardPrices?.[phase]);
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
      //     never agreed to, and never a deal we merely guessed belongs here
      //     (attribution "none" means we do not know, so no target exists).
      // Both are absent for every customer today, which is why this renders
      // NOT_STARTED rather than a percentage. That is the truth, and the point.
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

  return {
    kickoff: kickoffSteps(deals),
    phases: sections,
    signalSource,
    signalNote: signalSource
      ? undefined
      : "No component has been reported live yet. Delivery signals arrive from the partner tools once the webhook is wired; until then these can be switched on by hand. Nothing here is guessed from other fields.",
  };
}
