// Q40 leg (4) — the phase component SIGNAL, decided as pure code.
//
// Contract: docs/plans/PHASE-SIGNAL-WEBHOOK-CONTRACT.md (v1).
// Rob (dump 7.22.26-3, verbatim): "in order for those elements of each Phase to
// toggle over to live, a signal has to be sent from my partners tools that are
// doing all of this. So, the plan would be to have that signal be sent to us."
//
// This module is the DECISION half. The route (next increment) does the secret
// check, the store write and the HTTP status; it decides nothing. That split is
// the point: what a signal does to a customer's Blueprint — and to their refund
// window — is the part that can be wrong invisibly, so it is pure per CR-3 (no
// clock, no network, no store) and tested without a partner in the room.
//
// `lib/phases/blueprint.ts` says today, out loud on the page, that no signal
// source exists and an unlit board is the truth. This is the beginning of that
// source; until the route lands, nothing here is reachable from the network.

import {
  componentDefsFor,
  REFUND_TRIGGER_SLUG,
  type PhaseNo,
} from "./components";

/** Contract v1 is the only version this module speaks. */
export const SIGNAL_CONTRACT_VERSION = 1;

export type SignalStatus = "live" | "in_progress" | "reverted";

/** What we already hold for that (customer, component), if anything. */
export interface StoredComponentState {
  /** Set once the component is lit. Cleared by a revert. */
  liveAt?: string | null;
  /**
   * The FIRST time this component ever went live, and never cleared.
   *
   * This is a separate field from `liveAt` on purpose, and the reason is the
   * refund window: `liveAt` answers "is the light on right now", which a revert
   * legitimately turns off. If the clock keyed on `liveAt` being absent, a
   * revert-then-relight would hand the customer a BRAND NEW 30 days — a real
   * change to their refund rights, produced by a partner's deploy hiccup, that
   * nobody decided and nobody would see.
   */
  everLiveAt?: string | null;
  /** `occurredAt` of the last signal we APPLIED — the ordering baseline. */
  lastSignalAt?: string | null;
  /** eventIds already applied for this customer. Replays must not re-apply. */
  seenEventIds?: readonly string[];
}

export interface SignalContext {
  /** Whether `customerId` resolves to a company we actually hold. */
  customerKnown: boolean;
  stored?: StoredComponentState;
}

/** A malformed payload — the sender must change the request, so the route 400s. */
export interface SignalMalformed {
  outcome: "malformed";
  /** The offending field, named. A 400 with no field name is a 3am mystery. */
  field: string;
  reason: string;
}

/**
 * Well-formed but nothing to do. The route answers 200 so the sender never
 * retry-loops on a condition retrying cannot fix.
 */
export interface SignalNotApplied {
  outcome: "not_applied";
  reason:
    | "unknown_customer"
    | "unknown_component"
    | "phase_mismatch"
    | "duplicate"
    | "stale"
    | "ambiguous_timestamp"
    | "already_live";
  detail: string;
}

export interface SignalApplied {
  outcome: "applied";
  /**
   * The idempotency key that produced this decision, carried OUT of the decider.
   *
   * inc.2: the writer has to record this event as seen, or the very next replay
   * re-applies it. Without the field it would have to reach back into the raw
   * payload for the key — a SECOND reader of the body, which can disagree with
   * the one that decided (a different trim, a different field, a stale copy).
   * The decider already validated and trimmed it; it hands over what it used.
   */
  eventId: string;
  customerId: string;
  phase: PhaseNo;
  componentId: string;
  status: SignalStatus;
  /** Always the sender's `occurredAt`, never receipt time. */
  occurredAt: string;
  /** New `live_at` for the component. `null` means CLEAR it (a revert). */
  liveAt: string | null;
  /**
   * True only on the FIRST `live` of `website-aeo-seo` — the moment Rob's
   * 30-day Phase-1 refund promise starts running. `lib/phases/refund.ts`
   * takes this timestamp as `startedAt`.
   */
  startsRefundWindow: boolean;
  /**
   * A light going dark is a Rob-attention event, never silent (contract §3).
   * Carries the reason so "Things to Address" can state it.
   */
  attention?: string;
  source: string;
}

export type SignalDecision = SignalMalformed | SignalNotApplied | SignalApplied;

const STATUSES: readonly SignalStatus[] = ["live", "in_progress", "reverted"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * ISO-8601 → epoch ms, or null if it is not a real instant.
 *
 * `new Date("2026-13-45")` is `Invalid Date`, not a throw — so an unparseable
 * timestamp would otherwise sail through and compare `NaN` against every stored
 * value, which is false in BOTH directions: a stale event would look fresh and
 * a fresh one would look stale. It has to be rejected here.
 */
function instantMs(v: unknown): number | null {
  if (!nonEmptyString(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decide what one v1 signal does. Pure: every result is a function of the
 * payload plus what we already hold.
 */
export function decideSignal(payload: unknown, ctx: SignalContext): SignalDecision {
  if (!isPlainObject(payload)) {
    return { outcome: "malformed", field: "body", reason: "body is not a JSON object" };
  }

  // Version first. An unknown version means the sender's field meanings may not
  // be ours, so nothing below it can be trusted — including the fields that
  // happen to look familiar.
  if (payload.version !== SIGNAL_CONTRACT_VERSION) {
    return {
      outcome: "malformed",
      field: "version",
      reason: `unsupported contract version ${JSON.stringify(payload.version)} — this endpoint speaks v${SIGNAL_CONTRACT_VERSION}`,
    };
  }

  if (!nonEmptyString(payload.eventId)) {
    return { outcome: "malformed", field: "eventId", reason: "required idempotency key is missing" };
  }
  if (!nonEmptyString(payload.customerId)) {
    return { outcome: "malformed", field: "customerId", reason: "required" };
  }
  if (!nonEmptyString(payload.componentId)) {
    return { outcome: "malformed", field: "componentId", reason: "required" };
  }
  if (payload.phase !== 1 && payload.phase !== 2 && payload.phase !== 3) {
    return {
      outcome: "malformed",
      field: "phase",
      reason: `phase must be 1, 2 or 3 — got ${JSON.stringify(payload.phase)}`,
    };
  }
  if (!STATUSES.includes(payload.status as SignalStatus)) {
    return {
      outcome: "malformed",
      field: "status",
      reason: `status must be one of ${STATUSES.join(" | ")} — got ${JSON.stringify(payload.status)}`,
    };
  }
  const occurredMs = instantMs(payload.occurredAt);
  if (occurredMs === null) {
    return {
      outcome: "malformed",
      field: "occurredAt",
      reason: "required ISO-8601 instant, and it must parse — it drives the refund clock",
    };
  }

  const eventId = payload.eventId.trim();
  const customerId = payload.customerId.trim();
  const componentId = payload.componentId.trim();
  const phase = payload.phase as PhaseNo;
  const status = payload.status as SignalStatus;
  const occurredAt = payload.occurredAt as string;
  const source = nonEmptyString(payload.source) ? payload.source.trim() : "partner-tools";

  const stored = ctx.stored ?? {};

  // Idempotency BEFORE anything else that could act, and before the customer
  // check: a replay of an event we already applied is settled, and re-deciding
  // it against today's context could produce a different answer for the same
  // event — which is the one thing an idempotency key exists to prevent.
  if ((stored.seenEventIds ?? []).includes(eventId)) {
    return { outcome: "not_applied", reason: "duplicate", detail: `eventId ${eventId} already applied` };
  }

  if (!ctx.customerKnown) {
    return {
      outcome: "not_applied",
      reason: "unknown_customer",
      detail: `no company matches customerId ${customerId}`,
    };
  }

  // An unknown slug is not malformed — the partner's list and ours have drifted,
  // which is a mapping conversation (contract OPEN), not a request to fix and
  // resend. 200/applied:false, so it is logged instead of retried forever.
  const defs = componentDefsFor(phase);
  const known = defs.some((d) => d.slug === componentId);
  if (!known) {
    const elsewhere = ([1, 2, 3] as PhaseNo[]).find(
      (p) => p !== phase && componentDefsFor(p).some((d) => d.slug === componentId),
    );
    // A slug we DO know, filed under a different phase, is worse than one we
    // don't: the two sides disagree about the phase model itself. Never trust
    // the slug and quietly move the light — say which phase we have it in.
    if (elsewhere) {
      return {
        outcome: "not_applied",
        reason: "phase_mismatch",
        detail: `component ${componentId} is phase ${elsewhere} on our side, signal claimed phase ${phase}`,
      };
    }
    return {
      outcome: "not_applied",
      reason: "unknown_component",
      detail: `no phase ${phase} component with slug ${componentId}`,
    };
  }

  // Out-of-order delivery is tolerated by COMPARING timestamps (contract §5),
  // never by trusting arrival order. A `reverted` that was emitted before the
  // `live` we already hold must not dark a light that is currently correct.
  const lastMs = instantMs(stored.lastSignalAt);
  if (lastMs !== null) {
    if (occurredMs < lastMs) {
      return {
        outcome: "not_applied",
        reason: "stale",
        detail: `occurredAt ${occurredAt} precedes the applied signal at ${stored.lastSignalAt}`,
      };
    }
    if (occurredMs === lastMs) {
      // Same instant, different event: nothing in the payload can order them,
      // so applying one would let network arrival order decide a customer's
      // component state. Refuse and surface it instead of guessing.
      return {
        outcome: "not_applied",
        reason: "ambiguous_timestamp",
        detail: `another signal is already applied at exactly ${occurredAt} — cannot order these`,
      };
    }
  }

  const currentlyLive = nonEmptyString(stored.liveAt);

  if (status === "in_progress") {
    // `in_progress` never darks a live light. A partner re-running a job that
    // re-announces its start would otherwise un-light a component that is up —
    // and, on `website-aeo-seo`, put a started refund clock in question.
    if (currentlyLive) {
      return {
        outcome: "not_applied",
        reason: "already_live",
        detail: `${componentId} is live since ${stored.liveAt}; an in_progress signal does not un-light it`,
      };
    }
    return {
      outcome: "applied",
      eventId,
      customerId,
      phase,
      componentId,
      status,
      occurredAt,
      liveAt: null,
      startsRefundWindow: false,
      source,
    };
  }

  if (status === "reverted") {
    const attention = currentlyLive
      ? `${componentId} was reverted by ${source} — it was live since ${stored.liveAt}`
      : `${componentId} reported reverted by ${source} while not lit on our side`;
    return {
      outcome: "applied",
      eventId,
      customerId,
      phase,
      componentId,
      status,
      occurredAt,
      liveAt: null,
      // A revert clears the LIGHT. It does not retract a refund window the
      // customer has already earned — that promise was made the day the site
      // went live, and silently restarting or cancelling the clock from a
      // partner's revert would change a customer's refund rights without
      // anyone deciding to. `refundStatus` keeps its own `startedAt`; this
      // surfaces for a human instead.
      startsRefundWindow: false,
      attention,
      source,
    };
  }

  // status === "live"
  if (currentlyLive) {
    return {
      outcome: "not_applied",
      reason: "already_live",
      detail: `${componentId} is already live since ${stored.liveAt}`,
    };
  }

  return {
    outcome: "applied",
    eventId,
    customerId,
    phase,
    componentId,
    status,
    occurredAt,
    liveAt: occurredAt,
    // FIRST-EVER live of the trigger component only — keyed on `everLiveAt`,
    // not on `liveAt` being absent. The window runs from the original go-live,
    // because that is the day the promise was made to the customer.
    startsRefundWindow:
      phase === 1 &&
      componentId === REFUND_TRIGGER_SLUG &&
      !nonEmptyString(stored.everLiveAt),
    source,
  };
}
