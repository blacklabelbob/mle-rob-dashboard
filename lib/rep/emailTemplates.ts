// Q46 R6 inc.1 (rep cockpit wiring, research §5 Δ6) — the pure seam behind
// "Email" on a rep surface. Today both `/rep` and `/rep/accounts/[id]` hand the
// rep a bare `mailto:` and an empty compose window; this module turns the record
// they are already looking at into a stage-aware, vertical-aware draft.
//
// WHY THIS SHIPS AS A PURE MODULE FIRST (CR-3, and the R2/R3/R5 precedent): the
// half that can be wrong INVISIBLY here is merge resolution. A tint that is
// wrong is wrong on our screen; a merge field that is wrong is wrong in a
// client's inbox, with MLE's name on it, and nobody on our side ever sees it.
// So the resolver is graded before a single pixel renders.
//
// THREE OUTCOMES, NEVER TWO. `ready`, `missing_fields` (we hold the channel but
// not the words) and `no_recipient` (we hold the words but not the channel) are
// three DIFFERENT instructions to a rep — "send it", "fill in the company name",
// "go find an email address". Collapsing them into one disabled button is the
// defect: only the first is actionable without leaving the page, and the last
// two are fixed in different places.
//
// A BLANK IS NEVER AN ACCEPTABLE MERGE RESULT. `resolve()` refuses rather than
// substituting "" — "Hi , about your  project" is worse than no template at
// all, because it looks like a rep who does not know who they are writing to.
// Same rule one level up: an UNKNOWN token (a typo'd `{{firstname}}`) refuses
// too, instead of shipping the literal braces to a client.
//
// NO MONEY TOKEN EXISTS, DELIBERATELY. There is no `{{quoted_amount}}` and
// `resolve()` rejects one if a template ever adds it. Two reasons and both are
// load-bearing: `quoted_amount` is one of the money columns Q73's audit counts
// as sensitive, and an auto-quoted figure is a PRICE WE DID NOT CONFIRM leaving
// the building under a rep's name. The rep types money by hand or not at all.

import type { Deal, DealStage, Person } from "../types";
import { STAGE_LABELS } from "../labels";

/** The merge tokens a template body may use. Anything else refuses. */
export const TEMPLATE_TOKENS = [
  "first_name",
  "company",
  "rep_name",
  "vertical",
  "stage",
  "demo_link",
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

/**
 * Tokens whose value is a money figure. Empty ON PURPOSE — the list exists so
 * that the ban is a mechanism rather than a comment, and so a future token
 * named `amount`/`price`/`quote` trips `unknownTokens()` loudly.
 */
export const BANNED_TOKEN_PATTERN = /amount|price|quote[d_]|value|invoice|paid/i;

/** The live demo, the one asset every vertical's first email points at. */
export const DEMO_LINK = "https://mylocaleverything.com/app?demo=1";

export interface EmailTemplate {
  id: string;
  /** What the rep picks from a menu. */
  label: string;
  /** Stages this template is offered at. */
  stages: readonly DealStage[];
  /**
   * Verticals this template is scoped to. `undefined` = offered in every
   * vertical (the generic fallback). A vertical-scoped template always wins
   * over a generic one at the same stage — see `templatesFor`.
   */
  verticals?: readonly string[];
  subject: string;
  body: string;
}

/**
 * The config table. Small on purpose — research §2.6/§4: a 3-person shop needs
 * the PATTERN (vertical × stage → asset), not a content platform. Roofing and
 * title/RE get their own first-touch because they are Rob's two named target
 * verticals; everything else reads the generic one rather than a wrong one.
 */
export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    id: "intro-roofing",
    label: "Intro — roofing",
    stages: ["new_lead", "contacted"],
    verticals: ["roofing"],
    subject: "{{company}} — the calls you're missing after hours",
    body:
      "Hi {{first_name}},\n\n" +
      "Most roofing shops we look at lose more work to unanswered phones than to price. " +
      "I put together a 90-second look at what that costs and what closes the gap:\n" +
      "{{demo_link}}\n\n" +
      "Worth 15 minutes?\n\n" +
      "{{rep_name}}\nMy Local Everything",
  },
  {
    id: "intro-title",
    label: "Intro — title / real estate",
    stages: ["new_lead", "contacted"],
    verticals: ["title"],
    subject: "{{company}} — a tool your agents would actually use",
    body:
      "Hi {{first_name}},\n\n" +
      "The title and brokerage side of this has a second angle: the same system your " +
      "office runs on is something you can hand your agents as retention bait.\n" +
      "Here's the working version: {{demo_link}}\n\n" +
      "Open to a short call?\n\n" +
      "{{rep_name}}\nMy Local Everything",
  },
  {
    id: "intro-generic",
    label: "Intro",
    stages: ["new_lead", "contacted"],
    subject: "{{company}} — quick look",
    body:
      "Hi {{first_name}},\n\n" +
      "I work with {{vertical}} businesses on the leaks that never show up on a P&L — " +
      "missed calls, website visitors who leave, leads nobody followed up.\n" +
      "Here's the working demo: {{demo_link}}\n\n" +
      "Worth 15 minutes?\n\n" +
      "{{rep_name}}\nMy Local Everything",
  },
  {
    id: "confirm-meeting",
    label: "Confirm the meeting",
    stages: ["meeting_booked"],
    subject: "Confirming our time — {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Confirming we're on. I'll walk you through the live system and where it would " +
      "sit in {{company}} — no deck.\n\n" +
      "Anything specific you want covered, send it over and I'll build the walkthrough around it.\n\n" +
      "{{rep_name}}",
  },
  {
    id: "recap-meeting",
    label: "Recap + next step",
    stages: ["meeting_held"],
    subject: "Recap — {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Good talking. Recapping what we landed on:\n\n" +
      "-\n-\n-\n\n" +
      "Next step on my side:\n\n" +
      "{{rep_name}}",
  },
  {
    id: "followup-quote",
    label: "Follow up on the quote",
    stages: ["quote_sent", "negotiating"],
    subject: "Following up — {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Checking in on what I sent over. Happy to walk any of it back through with " +
      "whoever else needs to see it.\n\n" +
      "What's the hold-up on your end — timing, scope, or something I haven't answered?\n\n" +
      "{{rep_name}}",
  },
  {
    id: "kickoff",
    label: "Kickoff",
    stages: ["signed"],
    subject: "Welcome aboard, {{company}}",
    body:
      "Hi {{first_name}},\n\n" +
      "Signed and moving. Here's what happens next and what I need from you to start:\n\n" +
      "-\n-\n\n" +
      "{{rep_name}}\nMy Local Everything",
  },
];

/**
 * What the merge draws from. Built by the caller from the record it is already
 * rendering, so the seam never reads a store or a clock.
 */
export interface TemplateContext {
  person: Person;
  /** The deal whose stage picks the template. Absent = no anchored deal. */
  deal?: Deal;
  /** Display name of the vertical (`Vertical.name`), not the slug. */
  verticalName?: string;
  repName: string;
}

export type DraftState = "ready" | "missing_fields" | "no_recipient";

export interface EmailDraft {
  templateId: string;
  label: string;
  state: DraftState;
  /** Populated only when `state === "ready"`. */
  subject?: string;
  body?: string;
  to?: string;
  /**
   * Which tokens could not be resolved, in template order. Non-empty exactly
   * when `state === "missing_fields"` — these are field names a rep can go fix
   * on the record, never a generic "something's missing".
   */
  missing: string[];
  /**
   * Tokens the template asked for that this module does not define, or that
   * name a money field. A template shipping one of these is OUR bug, not
   * missing customer data, so it is reported separately — a rep filling in
   * fields would never make it resolve.
   */
  invalidTokens: string[];
}

/**
 * First name only, and ONLY from a person row.
 *
 * Orgs live in the same `people` array as people (R2 inc.2 established this the
 * hard way), and a company row's `name` is the COMPANY. Splitting it would
 * greet "Acme Roofing LLC" as "Hi Acme," — a mistake that reads as a mail-merge
 * blowout to the recipient. A company row therefore has NO first name and the
 * draft says so, rather than guessing one.
 */
export function firstNameOf(person: Person): string | undefined {
  if (person.entityKind === "company") return undefined;
  const first = (person.name ?? "").trim().split(/\s+/)[0];
  return first || undefined;
}

/** The business this draft is about — `business`, falling back to the row name. */
export function companyOf(person: Person): string | undefined {
  const business = (person.business ?? "").trim();
  if (business) return business;
  if (person.entityKind === "company") {
    const name = (person.name ?? "").trim();
    if (name) return name;
  }
  return undefined;
}

/**
 * Templates offered for this context, most-specific first.
 *
 * SELECTION IS DETERMINISTIC AND VERTICAL-SCOPED WINS. Two templates at the
 * same stage would otherwise order by however the config happens to be written,
 * and a rep would get the generic intro for a roofer on Tuesday and the roofing
 * one on Wednesday with nothing on screen explaining the difference.
 *
 * NO DEAL IS NOT STAGE `new_lead`. A record with no anchored deal gets the
 * templates registered for `new_lead` because that is the honest read of "we
 * have not started" — but the caller is told which stage was used via
 * `stageUsed` so a surface can say "no deal yet" instead of implying one.
 */
export function templatesFor(ctx: TemplateContext): {
  stageUsed: DealStage;
  hasDeal: boolean;
  templates: EmailTemplate[];
} {
  const stageUsed: DealStage = ctx.deal?.stage ?? "new_lead";
  const verticalId = ctx.person.verticalId;
  const atStage = EMAIL_TEMPLATES.filter((t) => t.stages.includes(stageUsed));
  const scoped = atStage.filter((t) => t.verticals?.includes(verticalId));
  const generic = atStage.filter((t) => !t.verticals);
  return { stageUsed, hasDeal: Boolean(ctx.deal), templates: [...scoped, ...generic] };
}

function tokenValues(ctx: TemplateContext, stageUsed: DealStage): Record<TemplateToken, string | undefined> {
  return {
    first_name: firstNameOf(ctx.person),
    company: companyOf(ctx.person),
    rep_name: ctx.repName.trim() || undefined,
    vertical: ctx.verticalName?.trim() || undefined,
    stage: STAGE_LABELS[stageUsed],
    demo_link: DEMO_LINK,
  };
}

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Every token a template body+subject asks for, in first-appearance order. */
export function tokensIn(template: EmailTemplate): string[] {
  const seen: string[] = [];
  for (const source of [template.subject, template.body]) {
    for (const match of source.matchAll(TOKEN_RE)) {
      const name = match[1].toLowerCase();
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/**
 * Tokens this module cannot honour: not in `TEMPLATE_TOKENS`, or naming a money
 * field. Checked against the money pattern FIRST so that adding
 * `{{quoted_amount}}` to `TEMPLATE_TOKENS` some day still refuses — the ban
 * must not be defeatable by editing one list.
 */
export function invalidTokensIn(template: EmailTemplate): string[] {
  return tokensIn(template).filter(
    (name) =>
      BANNED_TOKEN_PATTERN.test(name) || !(TEMPLATE_TOKENS as readonly string[]).includes(name),
  );
}

/**
 * Resolve one template against one record. Never returns a partially merged
 * body: a draft is either fully resolved and sendable, or it names exactly what
 * is stopping it.
 */
export function resolve(template: EmailTemplate, ctx: TemplateContext): EmailDraft {
  const { stageUsed } = templatesFor(ctx);
  const invalidTokens = invalidTokensIn(template);
  const base = { templateId: template.id, label: template.label, missing: [] as string[], invalidTokens };

  if (invalidTokens.length > 0) return { ...base, state: "missing_fields" };

  const to = (ctx.person.email ?? "").trim();
  const values = tokenValues(ctx, stageUsed);
  const missing = tokensIn(template).filter((name) => !values[name as TemplateToken]);

  // Recipient is reported ahead of merge gaps when BOTH are absent: an email
  // with nowhere to go is the blocker a rep hits first, and naming five missing
  // fields for a record we cannot write to at all is noise.
  if (!to) return { ...base, state: "no_recipient", missing };
  if (missing.length > 0) return { ...base, state: "missing_fields", missing };

  const fill = (source: string) =>
    source.replace(TOKEN_RE, (_, name: string) => values[name.toLowerCase() as TemplateToken] as string);

  return { ...base, state: "ready", to, subject: fill(template.subject), body: fill(template.body) };
}

/**
 * Percent-encoding, NOT form-encoding, and that distinction is the whole reason
 * this helper exists instead of `URLSearchParams`.
 *
 * `URLSearchParams` serialises `application/x-www-form-urlencoded`, where a
 * space becomes `+`. A `mailto:` query is not form data (RFC 6068 requires
 * percent-encoding), so a mail client renders those pluses LITERALLY — the rep's
 * draft opens as "Hi+Caleb,+Most+roofing+shops+we+look+at…" and the first thing
 * the client sees is a broken machine. Caught by the mailto test on the first
 * run of this module. `encodeURIComponent` emits `%20`, which is unambiguously a
 * space to both a mail client and Gmail's own parser, so both call sites take
 * the same path rather than one being quietly right.
 */
function encodeParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Gmail compose handoff — the PRE-AUTH half of research §5 Δ6. Until 4.6b's
 * send-as-rep exists we do not send anything; we open the rep's own Gmail
 * compose window with the draft in it, so the mail leaves from their real
 * mailbox and lands in their real Sent folder.
 *
 * Returns undefined for anything not `ready`. A compose URL built from a
 * half-resolved draft is exactly the "Hi , about your " email this module
 * exists to prevent, and a disabled button cannot cause it.
 */
export function gmailComposeUrl(draft: EmailDraft): string | undefined {
  if (draft.state !== "ready" || !draft.to || !draft.subject || !draft.body) return undefined;
  const q = encodeParams({
    view: "cm",
    fs: "1",
    to: draft.to,
    su: draft.subject,
    body: draft.body,
  });
  return `https://mail.google.com/mail/?${q}`;
}

/** `mailto:` fallback for a rep whose mail client is not Gmail. Same gate. */
export function mailtoUrl(draft: EmailDraft): string | undefined {
  if (draft.state !== "ready" || !draft.to || !draft.subject || !draft.body) return undefined;
  const q = encodeParams({ subject: draft.subject, body: draft.body });
  // The address is encoded (a quoted local-part may legally contain `?` or `&`,
  // which would otherwise truncate the draft) but `@` is restored, because it is
  // legal literally in a mailto target and some clients balk at `%40`.
  const to = encodeURIComponent(draft.to).replace(/%40/g, "@");
  return `mailto:${to}?${q}`;
}
