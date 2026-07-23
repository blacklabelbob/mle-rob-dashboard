// PRD Task MC.4 (base 7.5) — lead-source taxonomy + UTM convention as CODE
// per CR-3 (docs/plans/LEAD-SOURCE-TAXONOMY-SPEC.md narrates; this module is
// canonical). Q52/Q54 precedent: definition tasks ship as a pure, unit-tested
// module so the table can't drift from what consumers actually evaluate.
//
// Relationship to Task 1.15 (lib/leads/sourceContext.ts): 1.15 captures
// PER-LEAD detail ("what was said"), MC.4 captures CHANNEL-LEVEL attribution
// ("which bucket does this lead count under"). Complementary by design —
// the taxonomy value rides alongside a source_context as `attribution`
// (extra keys are additive there, see parseIntakeSourceContext).
//
// Consumers registered:
//   MC.2 source_close_rate — its compute fn takes (source, isClosedWon)
//     pairs; THIS enum is the source domain (the adapter MC.2 said MC.4
//     would supply). deals.source column itself is still future schema.
//   MC.9 Cal.com ingestion — classifyUtm() turns booking UTM params into a
//     taxonomy value at ingestion time (passthrough verdict = MC.4 inc.2).
//   MC.12 KPI Summary / MC.15 weekly rollup — group-by domain.
//
// Honest scope, on the record: the base-PRD enum is exactly these FIVE
// values — there is deliberately NO separate "paid ads" bucket. Paid-vs-
// organic is a dimension of utm_medium (cpc/paid_social vs social/organic),
// not a sixth source; an ad-driven lead classifies by what it responded to
// (a lead-magnet ad → lead_magnet). Widening the enum is a Rob call.
//
// Pure: no clock, no I/O, deterministic ladder ordering.

import { INTAKE_SOURCE_TYPES, type IntakeSourceType } from "./sourceContext";

export const LEAD_SOURCES = [
  "cold_email",
  "referral",
  "lead_magnet",
  "organic",
  "direct_unknown",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type LeadSourceDef = {
  id: LeadSource;
  label: string; // plain language — Rob's no-jargon bar
  definition: string;
  examples: string[];
};

export const LEAD_SOURCE_TAXONOMY: readonly LeadSourceDef[] = [
  {
    id: "cold_email",
    label: "Cold Email",
    definition:
      "Lead replied to outbound email we initiated (campaign or 1:1) with no prior relationship.",
    examples: ["AIDRE missed-call campaign reply", "1:1 outbound reply"],
  },
  {
    id: "referral",
    label: "Referral",
    definition:
      "Lead introduced by a person or company already in the network — a referral edge exists or is owed.",
    examples: ["Caleb intro", "promised_intro follow-through", "partner hand-off"],
  },
  {
    id: "lead_magnet",
    label: "Lead Magnet",
    definition:
      "Lead came in through a free asset built to capture contacts — scorecard, calculator, demo request form, gated report. Includes paid ads that drive to one.",
    examples: ["Leaky-Bucket scorecard", "AIVA demo request form", "Growth Scan"],
  },
  {
    id: "organic",
    label: "Organic",
    definition:
      "Lead found us unpaid and un-referred — search, social content, directory, event walk-up — and we can name the channel.",
    examples: ["Google search", "reel comment → DM", "trade-show booth walk-up"],
  },
  {
    id: "direct_unknown",
    label: "Direct / Unknown",
    definition:
      "No attribution evidence exists. The honest bucket — never guessed into a prettier one.",
    examples: ["typed the URL", "untracked phone call", "no UTM, no referrer, no note"],
  },
];

// ── UTM convention ──────────────────────────────────────────────────────────
// One row per parameter: what we PUT there when building links, so what we
// READ back is classifiable. Values are lowercase kebab-case, always.

export type UtmParamConvention = {
  param: string;
  convention: string;
  reservedValues?: string[];
  example: string;
};

export const UTM_CONVENTION: readonly UtmParamConvention[] = [
  {
    param: "utm_source",
    convention: "The platform or property the click left FROM.",
    reservedValues: ["meta", "google", "youtube", "tiktok", "linkedin", "coldemail", "newsletter", "partner"],
    example: "utm_source=meta",
  },
  {
    param: "utm_medium",
    convention:
      "The traffic mechanism. THE classification driver — paid vs organic vs email vs referral lives here, not in a sixth taxonomy bucket.",
    reservedValues: ["cpc", "paid_social", "social", "email", "referral", "organic"],
    example: "utm_medium=cpc",
  },
  {
    param: "utm_campaign",
    convention:
      "Campaign ref, kebab-case, matching Task 1.15's campaign_ref / creative_ref so per-lead detail and channel attribution join on one string. Lead-magnet campaigns are prefixed `lm-`.",
    example: "utm_campaign=lm-leakybucket-scorecard",
  },
  {
    param: "utm_content",
    convention: "The exact creative or placement variant (ad id, reel ref, button).",
    example: "utm_content=reel-leakybucket-004",
  },
  {
    param: "utm_term",
    convention: "Paid-search keyword only; omit everywhere else.",
    example: "utm_term=ai-receptionist-roofing",
  },
];

/** Campaign prefix marking lead-magnet campaigns in utm_campaign. */
export const LEAD_MAGNET_CAMPAIGN_PREFIX = "lm-";

export type UtmParams = Partial<{
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}>;

const norm = (v: string | undefined): string => (v ?? "").trim().toLowerCase();

/**
 * Classify UTM params into the taxonomy. Deterministic ladder, first match
 * wins (rung order IS the spec — tests pin it):
 *   1. utm_medium=email + utm_source=coldemail → cold_email
 *   2. utm_medium=referral                     → referral
 *   3. utm_campaign starts `lm-`               → lead_magnet
 *   4. any other UTM value present             → organic (trackable, named)
 *   5. nothing present                         → direct_unknown
 */
export function classifyUtm(params: UtmParams): LeadSource {
  const source = norm(params.utm_source);
  const medium = norm(params.utm_medium);
  const campaign = norm(params.utm_campaign);
  if (medium === "email" && source === "coldemail") return "cold_email";
  if (medium === "referral") return "referral";
  if (campaign.startsWith(LEAD_MAGNET_CAMPAIGN_PREFIX)) return "lead_magnet";
  const anyValue = [params.utm_source, params.utm_medium, params.utm_campaign, params.utm_content, params.utm_term]
    .some((v) => norm(v).length > 0);
  return anyValue ? "organic" : "direct_unknown";
}

// ── Bridge from Task 1.15's per-lead source types ───────────────────────────
// Every intake source_type maps to a DEFAULT taxonomy value (tests pin the
// map total — a new 1.15 source type without a rung here fails the suite).
// UTM evidence, when present, wins over the default: classifyUtm carries
// more signal than the intake channel alone (e.g. a web_form submission
// arriving on a referral link counts as referral).

export const INTAKE_TYPE_DEFAULT_SOURCE: Record<IntakeSourceType, LeadSource> = {
  email_reply: "cold_email",
  web_form: "lead_magnet",
  ad_reel: "organic", // by default un-UTM'd reel response; cpc UTM upgrades via classifyUtm
  trade_show: "organic",
};

/**
 * One classification for a lead given whatever evidence exists.
 * UTM (when any param present) beats the intake-type default; no evidence
 * at all is honestly direct_unknown.
 */
export function classifyLeadSource(evidence: {
  utm?: UtmParams;
  intakeType?: IntakeSourceType;
}): LeadSource {
  const utmVerdict = evidence.utm ? classifyUtm(evidence.utm) : "direct_unknown";
  if (utmVerdict !== "direct_unknown") return utmVerdict;
  if (evidence.intakeType) return INTAKE_TYPE_DEFAULT_SOURCE[evidence.intakeType];
  return "direct_unknown";
}

/** Normalize free text (notes, CSV cells, human entry) onto the taxonomy; null = no confident match, caller keeps direct_unknown. */
export function parseLeadSource(raw: string): LeadSource | null {
  const v = raw.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if ((LEAD_SOURCES as readonly string[]).includes(v)) return v as LeadSource;
  const aliases: Record<string, LeadSource> = {
    cold_outbound: "cold_email",
    outbound: "cold_email",
    email: "cold_email",
    referred: "referral",
    intro: "referral",
    leadmagnet: "lead_magnet",
    scorecard: "lead_magnet",
    seo: "organic",
    search: "organic",
    social: "organic",
    direct: "direct_unknown",
    unknown: "direct_unknown",
  };
  return aliases[v] ?? null;
}

// ── Worked examples — test-pinned so the ladder can't drift ─────────────────

export const TAXONOMY_WORKED_EXAMPLES: ReadonlyArray<{
  scenario: string;
  evidence: Parameters<typeof classifyLeadSource>[0];
  expected: LeadSource;
}> = [
  {
    scenario: "Cold-email campaign click-through",
    evidence: { utm: { utm_source: "coldemail", utm_medium: "email", utm_campaign: "aidre-roofing-missedcall-v2" } },
    expected: "cold_email",
  },
  {
    scenario: "Partner referral link",
    evidence: { utm: { utm_source: "partner", utm_medium: "referral" } },
    expected: "referral",
  },
  {
    scenario: "Paid Meta ad driving to the scorecard (paid lives in utm_medium, bucket stays lead_magnet)",
    evidence: { utm: { utm_source: "meta", utm_medium: "cpc", utm_campaign: "lm-leakybucket-scorecard", utm_content: "reel-leakybucket-004" } },
    expected: "lead_magnet",
  },
  {
    scenario: "Organic reel response, no lead-magnet campaign",
    evidence: { utm: { utm_source: "tiktok", utm_medium: "social" }, intakeType: "ad_reel" },
    expected: "organic",
  },
  {
    scenario: "Web form with zero UTM evidence — intake default applies",
    evidence: { intakeType: "web_form" },
    expected: "lead_magnet",
  },
  {
    scenario: "Nothing known",
    evidence: {},
    expected: "direct_unknown",
  },
];

// Re-export for the completeness pin (every intake type must have a default).
export { INTAKE_SOURCE_TYPES };
