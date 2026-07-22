// PRD Task 1.9 — mandatory per-interaction fields, shipped AS CODE per CR-3
// (Q25/Q27 precedent: Sales "spec" tasks live as a pure, unit-tested module;
// prose narrates, code is canonical). This module is the single rule source
// for what a MANUAL interaction log must carry before it may be saved.
//
// The mandatory list, verbatim from Task 1.9:
//   date, contact, channel, referral source, door-opened (Y/N + who),
//   next step + date, stage change
//
// Mapping onto the Activity shape (0005 schema — zero new columns; the
// per-interaction answers ride sourceContext, Task 1.15's seam):
//   date            → occurredAt (ISO timestamp)
//   contact         → personId | orgId (≥1; Task 1.9 says CONTACT, so a bare
//                     dealId anchor is NOT enough for a manual log)
//   channel         → type ∈ call|email|meeting|note ("status_change" is
//                     server-written by the Task 4.7 audit trail, never a
//                     manual channel)
//   referral source → sourceContext.referral_source: non-empty string; "none"
//                     is a valid ANSWER — absence is what gets rejected
//   door-opened     → sourceContext.door_opened: { opened: boolean, by?: str }
//                     with `by` required when opened=true (the "+ who")
//   next step +date → sourceContext.next_step: { description: non-empty str,
//                     due_date: "YYYY-MM-DD" }
//   stage change    → sourceContext.stage_change: "none" | <stage string> — a
//                     DECLARATION keeping the rep honest; the authoritative
//                     status_change row is still only ever written server-side
//                     by the deals PATCH audit trail (Task 4.7 / Q28)
//
// Scope, stated honestly: this governs MANUAL logs only. Automated captures
// (n8n email, AIDRE, dialer webhooks) cannot answer door-opened/next-step and
// keep their own narrower validation — enforcing 1.9 there would just kill
// capture, the opposite of the PRD's "capture never depends on discipline".
//
// Pure: no clock, no I/O, deterministic `missing` ordering (spec order above).

export const MANUAL_CHANNELS = ["call", "email", "meeting", "note"] as const;

export interface ManualLogCandidate {
  personId?: unknown;
  orgId?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  sourceContext?: unknown;
}

export type RequiredFieldsResult =
  | { ok: true }
  | { ok: false; missing: string[] };

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

// Full ISO timestamp (what occurredAt stores everywhere else in the app).
const isIsoTimestamp = (v: unknown): v is string =>
  isNonEmptyString(v) && !Number.isNaN(Date.parse(v));

const isIsoDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/**
 * Validate a manual interaction log against Task 1.9's mandatory-field spec.
 * Returns every missing/invalid field (not just the first) so the UI can mark
 * the whole form in one round trip. Field names in `missing` are the
 * PAYLOAD paths, so a 400 body doubles as fix-it instructions.
 */
export function validateManualLog(candidate: ManualLogCandidate): RequiredFieldsResult {
  const missing: string[] = [];
  const ctx = (
    candidate.sourceContext && typeof candidate.sourceContext === "object"
      ? candidate.sourceContext
      : {}
  ) as Record<string, unknown>;

  // date
  if (!isIsoTimestamp(candidate.occurredAt)) missing.push("occurredAt");

  // contact — exactly the 0005 "≤1 of person/org" rule is the store's job;
  // here we only demand that a contact anchor exists at all.
  if (!isNonEmptyString(candidate.personId) && !isNonEmptyString(candidate.orgId)) {
    missing.push("personId|orgId");
  }

  // channel
  if (!MANUAL_CHANNELS.includes(candidate.type as (typeof MANUAL_CHANNELS)[number])) {
    missing.push("type");
  }

  // referral source — explicit answer required ("none" passes)
  if (!isNonEmptyString(ctx.referral_source)) missing.push("sourceContext.referral_source");

  // door-opened Y/N + who
  const door = ctx.door_opened as { opened?: unknown; by?: unknown } | undefined;
  if (!door || typeof door !== "object" || typeof door.opened !== "boolean") {
    missing.push("sourceContext.door_opened.opened");
  } else if (door.opened === true && !isNonEmptyString(door.by)) {
    missing.push("sourceContext.door_opened.by");
  }

  // next step + date
  const next = ctx.next_step as { description?: unknown; due_date?: unknown } | undefined;
  if (!next || typeof next !== "object" || !isNonEmptyString(next.description)) {
    missing.push("sourceContext.next_step.description");
  }
  if (!next || typeof next !== "object" || !isIsoDay(next.due_date)) {
    missing.push("sourceContext.next_step.due_date");
  }

  // stage change declaration ("none" passes)
  if (!isNonEmptyString(ctx.stage_change)) missing.push("sourceContext.stage_change");

  return missing.length ? { ok: false, missing } : { ok: true };
}
