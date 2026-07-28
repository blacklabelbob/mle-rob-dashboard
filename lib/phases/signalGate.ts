// Q40 leg (4) inc.4: the gate in front of the decider, and the HTTP shape behind
// it. Pure — no clock, no network, no store (CR-3).
//
// inc.1 decided WHETHER a signal applies, inc.2 what row it writes, inc.3 how
// that row reaches Postgres. Everything a partner can do wrong BEFORE the decider
// sees the body lives here, plus the outcome→status mapping, because that mapping
// is the thing that decides whether a partner's tools retry us forever.
//
// WHY THE STATUS MAPPING IS A TESTED FUNCTION AND NOT THREE LINES IN THE ROUTE:
// contract §"Valid but unmatchable → 200" is not politeness. A partner's queue
// retries non-2xx. If an unknown component slug came back 4xx, their tools would
// re-POST a signal that CANNOT succeed until two humans agree on a slug list —
// forever, against a production endpoint. The one status in here that is
// deliberately a failure is the storage failure: see `signalHttp`.

import { verifyVapiSecret } from "../vapi";
import type { NetworkData } from "../types";
import type { SignalDecision } from "./signalIntake";

/** Header the partner sends the shared secret in (contract v1). */
export const PHASE_SIGNAL_HEADER = "x-phase-signal-secret";

export interface PhaseSignalEnv {
  webhookSecret?: string;
}

export function phaseSignalEnv(env: NodeJS.ProcessEnv = process.env): PhaseSignalEnv {
  return { webhookSecret: env.PHASE_SIGNAL_WEBHOOK_SECRET };
}

/** Unset secret → the endpoint is inert (503), so it can ship before the partner exists. */
export function phaseSignalConfigured(env: PhaseSignalEnv): boolean {
  return Boolean(env.webhookSecret);
}

/** Same constant-time comparison every other webhook seam here uses. */
export const verifyPhaseSignalSecret = verifyVapiSecret;

/**
 * Does `customerId` name a company we actually hold?
 *
 * EXACT MATCH ON THE COMPANY ROW'S id, and nothing else. Two refusals are
 * deliberate:
 *
 *  • **No name/fuzzy fallback.** The partner's id and ours are a shared mapping
 *    (contract OPEN), and until that mapping is agreed the safe failure is "we
 *    don't know this customer" — a near-match would light a component on the
 *    WRONG customer's Blueprint, which is a thing Rob shows customers.
 *  • **A person id is not a customer.** Orgs and people live in the same rows
 *    here (`entityKind`), so an id that resolves to a human would otherwise sail
 *    through and hang a phase light off a person's record. Phases belong to
 *    companies.
 *
 * Returns the matched company's display name too — an audit line that says only
 * "applied for acme-holdings" is unreadable at 3am next to one that names it.
 */
export function resolveSignalCustomer(
  data: Pick<NetworkData, "people">,
  customerId: string,
): { known: boolean; name?: string } {
  const id = customerId.trim();
  if (!id) return { known: false };
  const row = data.people.find((p) => p.id === id);
  if (!row || row.entityKind !== "company") return { known: false };
  return { known: true, name: row.name };
}

export interface SignalHttp {
  status: number;
  body: Record<string, unknown>;
}

/**
 * One decision → the response the partner gets.
 *
 * `malformed` is 400 WITH the offending field: the sender has to change the
 * request, and a 400 that doesn't say which field is a 3am mystery for whoever
 * is on the other side.
 *
 * `not_applied` is 200 with `applied: false` and the reason. Nothing the sender
 * can do makes a retry succeed (unknown slug, unknown customer, duplicate,
 * stale) so a retry-triggering status would be a queue that never drains.
 *
 * `applied` is 200 with what we recorded, echoed back — the partner can diff
 * their state against ours without asking a human.
 */
export function signalHttp(decision: SignalDecision): SignalHttp {
  if (decision.outcome === "malformed") {
    return {
      status: 400,
      body: { ok: false, applied: false, field: decision.field, error: decision.reason },
    };
  }
  if (decision.outcome === "not_applied") {
    return {
      status: 200,
      body: { ok: true, applied: false, reason: decision.reason, detail: decision.detail },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      applied: true,
      componentState: {
        customerId: decision.customerId,
        phase: decision.phase,
        componentId: decision.componentId,
        status: decision.status,
        liveAt: decision.liveAt,
        occurredAt: decision.occurredAt,
        startsRefundWindow: decision.startsRefundWindow,
        ...(decision.attention ? { attention: decision.attention } : {}),
      },
    },
  };
}

/**
 * A store read or write that failed, as a response — 500, ON PURPOSE.
 *
 * This is the ONE case in this endpoint where we want the partner's retry. The
 * decider said the signal applies and the row did not land: answering 200 would
 * have their tools mark it delivered and never send it again, leaving a
 * component dark forever on a customer's Blueprint with no error anywhere. A 500
 * is re-POSTed, and inc.1's `seenEventIds` makes that re-POST safe.
 */
export function signalStorageFailure(stage: "read" | "write", message: string): SignalHttp {
  return {
    status: 500,
    body: { ok: false, applied: false, error: `phase signal ${stage} failed`, detail: message },
  };
}
