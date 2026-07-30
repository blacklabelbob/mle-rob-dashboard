// Q46 R10 (research §5 Δ10) — the LOG-INTERACTION form's pure seam.
//
// Task 1.9's rules already exist and are already enforced server-side
// (`validateManualLog` + `POST /api/admin/activities`). This module does NOT
// re-implement them — it COMPOSES them, for one reason: the day the form's own
// idea of "required" drifts from the route's, a rep fills in every field the
// screen asks for and still gets a 400 they cannot act on. One rule source.
//
// What this module owns is the three things a validator cannot own:
//
//   1. THE THIRD STATE ON DOOR-OPENED. Task 1.9 requires an explicit Y/N. A
//      checkbox has two states, and its unchecked state is indistinguishable
//      from "the rep never touched it" — so a checkbox would log "door not
//      opened" about every interaction nobody answered for. `doorOpened` is
//      therefore "yes" | "no" | undefined, and an unanswered form FAILS rather
//      than submitting a fabricated no. (Same class as the audit's
//      reviewed-vs-never-looked-at collapse, Q73 inc.29.)
//
//   2. REP-READABLE NAMES FOR EVERY REFUSAL. The route answers with payload
//      paths (`sourceContext.door_opened.by`) because a 400 body doubles as
//      fix-it instructions for a caller. A rep is not a caller. Every path the
//      validator can emit has a label here, and a test drives the validator to
//      enumerate its own paths so a new rule cannot ship a raw path onto a
//      rep's screen.
//
//   3. THE DECLARATION / WRITE BOUNDARY. `stage_change` is a rep's statement
//      about what happened, not an instruction to move a deal. The payload this
//      builder produces carries no deal-stage field of any kind; moving a deal
//      goes through the audited `PATCH /api/admin/deals` (R3/R5) so that column
//      keeps exactly one audit row. Test-pinned, because "the form also updates
//      the stage" is a one-line convenience away.
//
// Pure per CR-3: no clock, no network, no Next imports. The wall time comes in
// as the browser's `datetime-local` string plus its offset, both arguments —
// so the same inputs always produce the same instant, in tests and in prod.

import {
  MANUAL_CHANNELS,
  validateManualLog,
  type RequiredFieldsResult,
} from "./requiredFields";
import { REP_PIPELINE_STAGES } from "@/lib/deals/repPipelineBoard";

export type ManualChannel = (typeof MANUAL_CHANNELS)[number];

/** Y/N/unanswered. `undefined` is a real, distinct state — see note 1 above. */
export type DoorAnswer = "yes" | "no";

/**
 * Exactly what the form holds. Every field is optional because a half-filled
 * form is the normal state of a form; validity is decided at build time by the
 * server's own rule, never by the presence of a field here.
 */
export interface ManualLogFormState {
  /** Browser `datetime-local` value, e.g. "2026-07-30T14:30". */
  occurredAtLocal?: string;
  channel?: ManualChannel | "";
  /** "none" is a valid ANSWER; "" is the absence that rejects. */
  referralSource?: string;
  doorOpened?: DoorAnswer;
  doorOpenedBy?: string;
  nextStep?: string;
  /** `date` input value, "YYYY-MM-DD". */
  nextStepDue?: string;
  /** "none" | a stage — a DECLARATION, never a write (note 3). */
  stageChange?: string;
  /** Free text; not a Task 1.9 field, so never required. */
  summary?: string;
}

export interface ManualLogAnchor {
  /** The account workspace is anchored on a person. */
  personId?: string;
  orgId?: string;
  /** Who is logging it. Free text until Phase-4 profiles exist. */
  createdBy?: string;
}

export interface ManualLogPayload {
  source: "manual";
  personId?: string;
  orgId?: string;
  createdBy?: string;
  type?: string;
  occurredAt?: string;
  summary?: string;
  sourceContext: Record<string, unknown>;
}

export interface BuiltManualLog {
  payload: ManualLogPayload;
  validation: RequiredFieldsResult;
  /** Rep-readable one-liners, one per refusal, in the validator's order. */
  problems: string[];
}

/** The stage-change declaration options. "none" first: it is the common answer. */
export const STAGE_CHANGE_OPTIONS = ["none", ...REP_PIPELINE_STAGES] as const;

export const CHANNEL_LABELS: Record<ManualChannel, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
};

/**
 * Payload path → what a rep is actually missing. Keyed on the paths
 * `validateManualLog` emits; exhaustiveness is asserted by test, not by hope.
 */
export const MANUAL_LOG_PROBLEM_LABELS: Record<string, string> = {
  occurredAt: "When did this happen? Pick a date and time.",
  "personId|orgId": "This log has no contact attached.",
  type: "How did you reach them? Pick call, email, meeting or note.",
  "sourceContext.referral_source":
    "Where did this come from? Answer “none” if it was not a referral — leaving it blank is not an answer.",
  "sourceContext.door_opened.opened":
    "Did this open a door? Answer yes or no — an unanswered question is not a no.",
  "sourceContext.door_opened.by": "You said a door opened — who opened it?",
  "sourceContext.next_step.description": "What is the next step?",
  "sourceContext.next_step.due_date": "When is that next step due?",
  "sourceContext.stage_change":
    "Did this change the deal stage? Answer “none” if it did not.",
};

/**
 * A path with no label is a bug in THIS module, and it must be loud on the way
 * out rather than silently rendering nothing. The rep still gets the raw path
 * (better than a blank line next to a rejected save) plus a marker that says
 * whose fault it is.
 */
export function describeProblem(path: string): string {
  return MANUAL_LOG_PROBLEM_LABELS[path] ?? `Missing required field: ${path} (unlabelled — report this)`;
}

const trimmed = (v: string | undefined): string | undefined => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : undefined;
};

/**
 * `datetime-local` carries no zone; the browser's offset does. Both are
 * arguments so this stays deterministic. Returns undefined on anything that is
 * not a well-formed local datetime — the validator then reports `occurredAt`
 * missing, which is the truth: we have no instant, not a wrong one.
 *
 * @param offsetMinutes JS convention (`new Date().getTimezoneOffset()`):
 *   minutes to ADD to local time to reach UTC (ET summer = 240).
 */
export function localToIsoInstant(
  local: string | undefined,
  offsetMinutes: number
): string | undefined {
  const t = trimmed(local);
  if (!t) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return undefined;
  if (!Number.isFinite(offsetMinutes)) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const asUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0")
  );
  if (Number.isNaN(asUtc)) return undefined;
  // Reject a date the calendar does not have (2026-02-31) rather than letting
  // Date.UTC roll it forward into a day the rep did not pick.
  const rolled = new Date(asUtc);
  if (
    rolled.getUTCFullYear() !== Number(y) ||
    rolled.getUTCMonth() !== Number(mo) - 1 ||
    rolled.getUTCDate() !== Number(d)
  ) {
    return undefined;
  }
  return new Date(asUtc + offsetMinutes * 60_000).toISOString();
}

/**
 * Form state + anchor → the exact body `POST /api/admin/activities` takes,
 * together with the server's own verdict on it and rep-readable problems.
 *
 * Absent answers are OMITTED, never defaulted: an omitted `door_opened` is
 * rejected, whereas a defaulted `{opened:false}` would save a claim nobody made.
 */
export function buildManualLog(
  state: ManualLogFormState,
  anchor: ManualLogAnchor,
  offsetMinutes: number
): BuiltManualLog {
  const sourceContext: Record<string, unknown> = {};

  const referral = trimmed(state.referralSource);
  if (referral) sourceContext.referral_source = referral;

  if (state.doorOpened === "yes" || state.doorOpened === "no") {
    const door: { opened: boolean; by?: string } = {
      opened: state.doorOpened === "yes",
    };
    // `by` only travels with a yes — attaching a name to a "no" records a door
    // opener for a door that did not open.
    const by = trimmed(state.doorOpenedBy);
    if (door.opened && by) door.by = by;
    sourceContext.door_opened = door;
  }

  const nextDesc = trimmed(state.nextStep);
  const nextDue = trimmed(state.nextStepDue);
  if (nextDesc || nextDue) {
    const next: { description?: string; due_date?: string } = {};
    if (nextDesc) next.description = nextDesc;
    if (nextDue) next.due_date = nextDue;
    sourceContext.next_step = next;
  }

  const stage = trimmed(state.stageChange);
  if (stage) sourceContext.stage_change = stage;

  const channel = trimmed(state.channel);
  const payload: ManualLogPayload = {
    source: "manual",
    ...(anchor.personId ? { personId: anchor.personId } : {}),
    ...(anchor.orgId ? { orgId: anchor.orgId } : {}),
    ...(anchor.createdBy ? { createdBy: anchor.createdBy } : {}),
    ...(channel ? { type: channel } : {}),
    ...(() => {
      const iso = localToIsoInstant(state.occurredAtLocal, offsetMinutes);
      return iso ? { occurredAt: iso } : {};
    })(),
    ...(trimmed(state.summary) ? { summary: trimmed(state.summary) } : {}),
    sourceContext,
  };

  const validation = validateManualLog(payload);
  return {
    payload,
    validation,
    problems: validation.ok ? [] : validation.missing.map(describeProblem),
  };
}
