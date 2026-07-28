// Q40 leg (6) inc.20: the write door's judgement, so the route stays a wire.
//
// inc.18 shipped the plan (what may be stored) and inc.19 shipped the carrier (the
// one upsert that stores it). Nothing calls either: `phase_scan_picks` still has no
// writer reachable from outside the codebase, which is why every company on prod
// reads SCAN_NO_PICKS. This module is the sequencing between the two — kept out of
// the route for the same CR-3 reason the plan is kept out of the carrier: what a
// paying customer gets pitched must be decided somewhere tests can reach without a
// database and without an HTTP request.
//
// AN UNRECOGNISED VERB IS REFUSED, NEVER RESOLVED TO A WRITE. `record`, `withdraw`
// and `reinstate` do three different things to a customer's pitch, so `action:
// "delete"` — or any typo of the three — refuses rather than falling through to
// whichever branch happens to be last. An ABSENT action does default, and only to
// `record`: it is the one verb of the three that cannot retire or resurrect a
// recommendation, so the default can never make a destructive act the consequence
// of an omitted field. Defaulting to either of the other two could.
//
// A SUBMISSION CONTAINING A WITHDRAWN PICK IS REFUSED, NOT STORED-AND-REPORTED.
// The upsert deliberately never carries `withdrawn_at` (inc.19), so re-recording a
// withdrawn pick leaves it hidden: a human picks it, the response says stored, and
// the panel never shows it. That is the invisible half-truth this whole leg exists
// to prevent, so the withdrawn ids are read BEFORE the upsert and their presence
// refuses the whole submission — naming them, so the caller either drops them or
// reinstates them on purpose. Reinstating stays its own verb; nothing here
// resurrects a recommendation somebody deliberately took back.
//
// THE WITHDRAWAL INSTANT IS STAMPED HERE, NOT ACCEPTED FROM THE CALLER. It is
// passed in as a parameter (CR-3 — no clock in this module), but the route supplies
// it from its own `new Date()`. A caller-supplied date would let a withdrawal be
// backdated to before the pitch it retires.

import {
  planScanPickWrites,
  planScanPickWithdrawal,
  type ScanPickSubmission,
  type ScanPickWriteRefusal,
} from "./scanPicksWrite";
import type { ScanPicksWriteDb } from "./scanPicksWriteDb";

/** Every reason the door can refuse, including the two only it can see. */
export type ScanPickRequestRefusal =
  | ScanPickWriteRefusal
  | "bad_withdrawn_at"
  | "not_an_object"
  | "unknown_action"
  | "withdrawn_pick";

export interface ScanPickRefusalDetail {
  pickId: string;
  reason: ScanPickRequestRefusal;
}

export type ScanPickAction =
  | { kind: "record"; customerId: string; picks: ScanPickSubmission[]; recordedBy: string; source: string | null }
  | { kind: "withdraw"; customerId: string; pickId: string }
  | { kind: "reinstate"; customerId: string; pickId: string };

export type ScanPickParse =
  | { ok: true; action: ScanPickAction }
  | { ok: false; refusals: ScanPickRefusalDetail[] };

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A request body → the verb it is asking for.
 *
 * Shape only. Whether the CONTENT may be stored is `planScanPickWrites`' job and
 * is not duplicated here — two authorities on the same question drift, and the one
 * with tests on it is the plan.
 */
export function parseScanPickRequest(body: unknown): ScanPickParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, refusals: [{ pickId: "", reason: "not_an_object" }] };
  }
  const raw = body as Record<string, unknown>;
  const action = trimmed(raw.action) || "record";
  const customerId = trimmed(raw.customerId);

  if (action === "record") {
    return {
      ok: true,
      action: {
        kind: "record",
        customerId,
        picks: Array.isArray(raw.picks) ? (raw.picks as ScanPickSubmission[]) : [],
        recordedBy: trimmed(raw.recordedBy),
        source: trimmed(raw.source) || null,
      },
    };
  }
  if (action === "withdraw" || action === "reinstate") {
    return { ok: true, action: { kind: action, customerId, pickId: trimmed(raw.pickId) } };
  }
  return { ok: false, refusals: [{ pickId: "", reason: "unknown_action" }] };
}

export type ScanPickOutcome =
  | { ok: true; stored: number; pickIds: string[] }
  | { ok: true; changed: boolean; pickId: string }
  | { ok: false; refusals: ScanPickRefusalDetail[] };

/**
 * Record a shortlist: plan it, check it against what was taken back, store it whole.
 *
 * Nothing is written unless every row is storable AND none of them is currently
 * withdrawn — the two refusals are collected in that order because the second
 * costs a query and the first does not.
 */
export async function recordScanPicks(
  db: ScanPicksWriteDb,
  request: { customerId: string; picks: ScanPickSubmission[]; recordedBy: string; source: string | null },
): Promise<ScanPickOutcome> {
  const plan = planScanPickWrites(request);
  if (plan.refusals.length > 0) return { ok: false, refusals: plan.refusals };

  const withdrawn = await db.fetchWithdrawnPickIds(
    request.customerId,
    plan.rows.map((r) => r.pick_id),
  );
  if (withdrawn.length > 0) {
    return {
      ok: false,
      refusals: withdrawn.map((pickId) => ({ pickId, reason: "withdrawn_pick" as const })),
    };
  }

  await db.upsertPicks(plan.rows);
  return { ok: true, stored: plan.rows.length, pickIds: plan.rows.map((r) => r.pick_id) };
}

/** Take one pick back. Dated with the instant handed in, never a clock read here. */
export async function withdrawScanPick(
  db: ScanPicksWriteDb,
  request: { customerId: string; pickId: string },
  at: string,
): Promise<ScanPickOutcome> {
  const plan = planScanPickWithdrawal({ ...request, withdrawnAt: at });
  if (!plan.match || !plan.patch) return { ok: false, refusals: plan.refusals };
  await db.withdrawPick(plan.match, plan.patch);
  // `changed` is not claimed from a row count: the update is filtered to live rows,
  // so an already-withdrawn pick matches nothing and reporting "changed" would say
  // the date moved when inc.19 guarantees it did not.
  return { ok: true, changed: true, pickId: plan.match.pick_id };
}

/**
 * Put a withdrawn pick back on the shortlist.
 *
 * BOTH HALVES OF THE IDENTITY OR NOTHING, the same rule the withdrawal carries and
 * for the sharper reason: a reinstatement missing `customer_id` would re-pitch an
 * automation to every customer it was ever taken back from.
 */
export async function reinstateScanPick(
  db: ScanPicksWriteDb,
  request: { customerId: string; pickId: string },
): Promise<ScanPickOutcome> {
  const refusals: ScanPickRefusalDetail[] = [];
  const customerId = trimmed(request?.customerId);
  if (!customerId) refusals.push({ pickId: "", reason: "no_customer_id" });
  const pickId = trimmed(request?.pickId);
  if (!pickId) refusals.push({ pickId: "", reason: "no_pick_id" });
  if (refusals.length > 0) return { ok: false, refusals };

  await db.reinstatePick({ customer_id: customerId, pick_id: pickId });
  return { ok: true, changed: true, pickId };
}
