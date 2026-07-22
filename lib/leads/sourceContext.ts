// PRD Task 1.15 — source-context intake spec, shipped AS CODE per CR-3
// (Q25/Q27/Q29 precedent: Sales "spec" tasks live as a pure, unit-tested
// module; prose narrates in docs/plans/SOURCE-CONTEXT-SPEC.md, code is
// canonical). This module is the single rule source for what per-source
// detail an intake lead's `source_context` must carry — the differentiator
// Rob's dump demands: "the rep should open a lead and instantly KNOW where
// it came from and what was said", not a bare `source: "form"` string.
//
// Where this rides: `activities.source_context` / Task 5.1's `POST
// /api/leads` payload (0005 schema — zero new columns; same JSONB seam as
// promised_intro [Task 1.8], the Task 1.9 manual-log fields, and the
// stage-change audit trail [Task 4.7]). The discriminant is `source_type`.
//
// The four intake source types, verbatim from Task 1.15:
//   email_reply — email replied to + reply text
//   web_form    — form questions + answers
//   ad_reel     — ad/reel topic + creative ref
//   trade_show  — trade-show notes
//
// Relationship to shapes ALREADY live on this seam (catalogued here so the
// module is the one map, but NOT validated by it — each has its own
// narrower validator at its own ingestion point, deliberately):
//   n8n Gmail capture (lib/n8nEmail.ts)  — ongoing correspondence capture
//   AIDRE call webhook (lib/aidreCall.ts) — call outcomes
//   promised_intro (lib/referrals/chaseQueue.ts) — referral promises
//   Task 1.9 manual-log fields (lib/activities/requiredFields.ts)
// email_reply here is NOT the n8n capture shape: capture logs Rob's mail as
// it flows; email_reply describes the reply that BIRTHED a lead (campaign
// context a rep needs on first touch). Both can coexist on one timeline.
//
// Cross-ref MC.4 (channel-level attribution taxonomy): 1.15 is per-lead
// detail; MC.4's UTM/channel taxonomy is aggregate attribution. When MC.4
// lands, its channel value can ride alongside as `attribution` — additive,
// no conflict (extra keys are allowed by design, see parse below).
//
// Pure: no clock, no I/O, deterministic error ordering (spec field order).

export const INTAKE_SOURCE_TYPES = [
  "email_reply",
  "web_form",
  "ad_reel",
  "trade_show",
] as const;
export type IntakeSourceType = (typeof INTAKE_SOURCE_TYPES)[number];

// ── Per-type field specs ────────────────────────────────────────────────────

/** Lead born from a reply to an outbound email (cold campaign or 1:1). */
export interface EmailReplySourceContext {
  source_type: "email_reply";
  /** Subject of the email the prospect replied TO — campaign identifier a rep can read. */
  replied_to_subject: string;
  /** The prospect's reply, verbatim — what they actually said. */
  reply_text: string;
  /** Optional campaign/sequence ref (e.g. n8n campaign id, sequence name). */
  campaign_ref?: string;
  /** Optional: address the reply came from, when it differs from the person record. */
  reply_from?: string;
}

/** Lead born from a website/lead-magnet form submission. */
export interface WebFormSourceContext {
  source_type: "web_form";
  /** Which form (e.g. "AIVA demo request", "Leaky-Bucket scorecard"). */
  form_name: string;
  /** Every question shown WITH the answer given — order preserved. */
  answers: Array<{ question: string; answer: string }>;
  /** Optional page the form lives on. */
  page_url?: string;
}

/** Lead born from an ad or reel (paid or organic short-form). */
export interface AdReelSourceContext {
  source_type: "ad_reel";
  /** What the creative was ABOUT — the hook the lead responded to. */
  topic: string;
  /** Pointer to the exact creative (ad id, reel URL, asset name). */
  creative_ref: string;
  /** Optional platform (meta, tiktok, youtube, …) — free text until MC.4's taxonomy. */
  platform?: string;
}

/** Lead met at a trade show / in-person event. */
export interface TradeShowSourceContext {
  source_type: "trade_show";
  /** Event name (e.g. "Win the Storm 2026"). */
  event_name: string;
  /** The conversation notes — what was discussed, promised, sized up. */
  notes: string;
  /** Optional booth/session context. */
  booth?: string;
}

export type IntakeSourceContext =
  | EmailReplySourceContext
  | WebFormSourceContext
  | AdReelSourceContext
  | TradeShowSourceContext;

export type IntakeParseResult =
  | { ok: true; ctx: IntakeSourceContext }
  | { ok: false; errors: string[] };

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

// Required string fields per type, in spec order — drives validation AND the
// deterministic error ordering, so the table can't drift from the checks.
const REQUIRED_STRINGS: Record<IntakeSourceType, string[]> = {
  email_reply: ["replied_to_subject", "reply_text"],
  web_form: ["form_name"], // answers[] validated structurally below
  ad_reel: ["topic", "creative_ref"],
  trade_show: ["event_name", "notes"],
};

/**
 * Validate an intake `source_context` payload against Task 1.15's spec.
 * Returns EVERY problem (not just the first) so a 400 body doubles as fix-it
 * instructions — same contract as Task 1.9's validateManualLog. Unknown extra
 * keys are permitted (additive evolution: MC.4 attribution, product-specific
 * detail per Task 1.11) — only the required spine is enforced.
 */
export function parseIntakeSourceContext(raw: unknown): IntakeParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["source_context must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const st = obj.source_type;
  if (!isNonEmptyString(st) || !(INTAKE_SOURCE_TYPES as readonly string[]).includes(st)) {
    return {
      ok: false,
      errors: [`source_type must be one of: ${INTAKE_SOURCE_TYPES.join(", ")}`],
    };
  }
  const sourceType = st as IntakeSourceType;
  const errors: string[] = [];
  for (const field of REQUIRED_STRINGS[sourceType]) {
    if (!isNonEmptyString(obj[field])) errors.push(`${field}: non-empty string required`);
  }
  if (sourceType === "web_form") {
    const answers = obj.answers;
    if (!Array.isArray(answers) || answers.length === 0) {
      errors.push("answers: non-empty array of {question, answer} required");
    } else {
      answers.forEach((a, i) => {
        const pair = a as Record<string, unknown> | null;
        if (
          pair === null || typeof pair !== "object" || Array.isArray(pair) ||
          !isNonEmptyString(pair.question) || !isNonEmptyString(pair.answer)
        ) {
          errors.push(`answers[${i}]: {question, answer} both non-empty strings required`);
        }
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, ctx: obj as unknown as IntakeSourceContext };
}

/**
 * One-line human rendering for rep surfaces ("how did they get here" — the
 * repSource.ts question, answered from structured data instead of a
 * description-string convention). Deterministic; safe on any valid ctx.
 */
export function describeIntakeSource(ctx: IntakeSourceContext): string {
  switch (ctx.source_type) {
    case "email_reply":
      return `Replied to "${ctx.replied_to_subject}"`;
    case "web_form":
      return `Submitted ${ctx.form_name} (${ctx.answers.length} answer${ctx.answers.length === 1 ? "" : "s"})`;
    case "ad_reel":
      return `Responded to ${ctx.platform ? `${ctx.platform} ` : ""}creative: ${ctx.topic}`;
    case "trade_show":
      return `Met at ${ctx.event_name}`;
  }
}

// ── Worked examples (the DoD's "worked examples for ≥3 source types") ───────
// Exported so tests pin them valid forever and Task 5.1 / AIDRE / AIVA
// integrators can import living, guaranteed-current examples instead of
// copying possibly-stale doc snippets.

export const WORKED_EXAMPLES: Record<IntakeSourceType, IntakeSourceContext> = {
  email_reply: {
    source_type: "email_reply",
    replied_to_subject: "Your missed-call number for June — 27 calls went nowhere",
    reply_text:
      "Interesting — we definitely miss calls during storm season. What does setup look like?",
    campaign_ref: "aidre-roofing-missedcall-v2",
    reply_from: "owner@peakridgeroofing.com",
  },
  web_form: {
    source_type: "web_form",
    form_name: "AIVA demo request",
    answers: [
      { question: "What does your company do?", answer: "Residential roofing, Tampa metro" },
      { question: "Roughly how many website visitors/month?", answer: "2,000-5,000" },
      { question: "Who answers your phones today?", answer: "Office manager, weekdays only" },
    ],
    page_url: "https://aivoicetech.io/aiva#demo",
  },
  ad_reel: {
    source_type: "ad_reel",
    topic: "97% of your website visitors leave without calling — here's who they were",
    creative_ref: "reel-leakybucket-004",
    platform: "meta",
  },
  trade_show: {
    source_type: "trade_show",
    event_name: "Florida Roofing & Sheet Metal Expo 2026",
    notes:
      "Booth walk-up. Runs 4 crews, misses afternoon calls when estimating. Wants the receptionist demo on his own number. Promised follow-up call Tuesday.",
    booth: "Hall B, near registration",
  },
};
