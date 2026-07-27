// Master View 2.0 §8 increment 7/8a — the phase component CANON.
//
// Source of truth: docs/plans/PHASE-COMPONENT-CHECKLIST-DRAFT.md, Rob-confirmed
// 2026-07-25 ("for Phase one only the ones shown in the demo on the site").
// `ai-receptionist` is STRUCK by that same ruling and is deliberately absent —
// not commented out, not disabled: absent, so it cannot be revived by accident.
//
// Slugs are the webhook `componentId` contract (PHASE-SIGNAL-WEBHOOK-CONTRACT.md).
// Rob's edit pass renames LABELS freely; slugs are the wire and must not move.

export type PhaseNo = 1 | 2 | 3;

export interface PhaseComponentDef {
  slug: string;
  label: string;
  /** One line Rob can read on hover — the checklist's "one-line meaning". */
  meaning: string;
}

/**
 * Phase 1 is one shared checklist for every customer — Rob: "Phase 1 for
 * everyone will largely be the same." Order is the checklist's order, which is
 * also delivery order; `website-aeo-seo` is first because it starts the refund
 * clock.
 */
export const PHASE_1_COMPONENTS: readonly PhaseComponentDef[] = [
  {
    slug: "website-aeo-seo",
    label: "Website live with AEO-SEO",
    meaning: "Site live and optimized for AI + classic search. Starts the 30-day refund clock.",
  },
  {
    slug: "everything-agent",
    label: "Everything Agent active",
    meaning: "The customer's core MLE agent running on their business.",
  },
  {
    slug: "social-connections",
    label: "Social channels connected",
    meaning: "Their social accounts wired for posting and capture.",
  },
  {
    slug: "brand-knowledge",
    label: "Brand knowledge loaded",
    meaning: "Voice/style/brand docs ingested so content sounds like them.",
  },
  {
    slug: "content-engine",
    label: "Content engine running",
    meaning: "Weekly content planned and generated; library populated.",
  },
  {
    slug: "social-radar",
    label: "Social Radar listening",
    meaning: "Competitor and social feeds monitored for their market.",
  },
  {
    slug: "growth-scan",
    label: "AI Growth Scan delivered",
    meaning: "Tech-stack scan complete — seeds the Top Automations slot.",
  },
] as const;

/**
 * The component whose go-live starts the Phase 1 refund clock. Named here once
 * so the FSM and the checklist can never disagree about which light it is.
 */
export const REFUND_TRIGGER_SLUG = "website-aeo-seo";

/**
 * P2/P3 are per-customer SLOT structures, not checklists — Rob: "we'll pick out
 * the automations that work for them". Slots are filled at agreement signing
 * from the automation database, so before that they are genuinely empty, and
 * the count below is the default slot COUNT, not a list of pretend components.
 *
 * DEFAULT_SLOT_COUNT is marked [DRAFT — Rob confirm the count] in the checklist.
 * It is a display default only: a phase that has real slots stored renders those,
 * however many there are.
 */
export const DEFAULT_SLOT_COUNT = 3;

export const PHASE_TITLES: Record<PhaseNo, string> = {
  1: "Foundation",
  2: "High-ROI Automations",
  3: "The 95% Business",
};

/** The demo's own subtitle for Phase 3 — kept verbatim, it is Rob's language. */
export const PHASE_SUBTITLES: Partial<Record<PhaseNo, string>> = {
  3: "the deep end",
};

/** Phase 2 carries a 3-month ROI guarantee (Rob, 7.22.26-3). */
export const PHASE_2_ROI_GUARANTEE_MONTHS = 3;

export function slotDefs(phase: 2 | 3, count = DEFAULT_SLOT_COUNT): PhaseComponentDef[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `p${phase}-auto-${i + 1}`,
    label: "empty slot",
    meaning: "Filled from the automation database when this phase is signed.",
  }));
}

export function componentDefsFor(phase: PhaseNo): readonly PhaseComponentDef[] {
  return phase === 1 ? PHASE_1_COMPONENTS : slotDefs(phase);
}
