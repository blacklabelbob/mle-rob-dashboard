// Q40 leg (6) inc.18: the write door for 0027. Pure — decides what may be stored.
//
// inc.16 shipped the ordering, inc.17 shipped the read, and both are wired on the
// company record and the rep workspace. Every company on prod still reads
// SCAN_NO_PICKS for one reason: `phase_scan_picks` has no writer. This module is
// that writer's judgement, kept out of the carrier for the same reason
// `scanPicksRow` is kept out of `scanPicksDb` (CR-3) — what a paying customer gets
// pitched is decided in code with tests on it, never inside a Supabase call.
//
// A SUBMISSION IS A CLAIM ABOUT A HUMAN'S DECISION. The panel's own copy tells the
// customer their shortlist was "chosen from the scan, not from a template". Every
// refusal below exists because storing the row instead would let that sentence be
// printed over something nobody chose.
//
//   • REFUSE, DO NOT STORE-AND-SKIP. A row with no `pick_id` or no `label` is
//     already reported as unusable by inc.16 on every read — writing one stores a
//     permanent skip, so the whole submission is rejected at the door instead.
//
//   • A DUPLICATE `pick_id` REJECTS THE SUBMISSION, it does not last-write-win.
//     0027's unique index makes the upsert succeed either way, applying whichever
//     of two disagreeing rows came last. Two rows naming the same automation with
//     different labels is a caller bug, and picking one silently is how a stale
//     label survives a correction.
//
//   • SUBMITTED ORDER IS RECORDED AS RANK WHEN NONE IS GIVEN. Every row of one
//     batch takes the same `recorded_at` default, so inc.16's tie-break falls
//     through to `pick_id` — alphabetical. A shortlist handed over in priority
//     order would then be pitched in alphabetical order, silently reordering which
//     picks land inside `slotCount` and which are named as overflow.
//
//   • OMISSION IS NEVER WITHDRAWAL. A submission that leaves out a pick recorded
//     last week does not retire it: a partial import and a deliberate removal look
//     identical from here, and one of them un-recommends something to a customer.
//     Withdrawing is its own verb, and it names the pick.
//
//   • AN EMPTY SUBMISSION IS REFUSED, NOT "CLEAR THE SHORTLIST". Same reason, at
//     the limit — an importer that produced nothing must not blank a real pitch.
//
//   • ATTRIBUTION IS REQUIRED. 0027 lets `recorded_by` be null; the panel's claim
//     that a human chose these does not. A pick that cannot say who recorded it
//     cannot back the sentence printed above it.

/** One automation as a caller submits it. `rank` optional — position is the fallback. */
export interface ScanPickSubmission {
  pickId: string;
  label: string;
  why?: string | null;
  rank?: number | null;
}

export interface ScanPickWriteRequest {
  customerId: string;
  picks: ScanPickSubmission[];
  /** Who decided. Required — the panel claims a human did. */
  recordedBy: string;
  /** Where it came from (scan import, admin UI). Optional, stored as given. */
  source?: string | null;
}

/** A row ready for upsert against `phase_scan_picks_identity`. */
export interface ScanPickWriteRow {
  customer_id: string;
  pick_id: string;
  label: string;
  why: string | null;
  rank: number;
  recorded_by: string;
  source: string | null;
}

export type ScanPickWriteRefusal =
  | "no_customer_id"
  | "no_recorded_by"
  | "no_picks"
  | "no_pick_id"
  | "no_label"
  | "duplicate_pick_id"
  | "bad_rank";

export interface ScanPickWritePlan {
  /** Rows to upsert. Empty whenever `refusals` is non-empty — this is all-or-nothing. */
  rows: ScanPickWriteRow[];
  /** Every reason the submission was refused, with the pick it came from. */
  refusals: { pickId: string; reason: ScanPickWriteRefusal }[];
}

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A submitted shortlist → the rows that may be stored, or the reasons it may not.
 *
 * ALL-OR-NOTHING ON PURPOSE. A partially applied shortlist is the one outcome
 * nobody can see: the customer is shown some of what was decided, in an order
 * derived from what happened to survive, and the panel still says a human picked
 * it. Either the whole submission is storable or none of it is written.
 *
 * Every refusal is collected rather than thrown on the first — a caller fixing an
 * import wants the whole list of what is wrong, not one item per round trip.
 */
export function planScanPickWrites(request: ScanPickWriteRequest): ScanPickWritePlan {
  const refusals: ScanPickWritePlan["refusals"] = [];

  const customerId = trimmed(request?.customerId);
  if (!customerId) refusals.push({ pickId: "", reason: "no_customer_id" });

  const recordedBy = trimmed(request?.recordedBy);
  if (!recordedBy) refusals.push({ pickId: "", reason: "no_recorded_by" });

  const submitted = Array.isArray(request?.picks) ? request.picks : [];
  if (submitted.length === 0) refusals.push({ pickId: "", reason: "no_picks" });

  const seen = new Set<string>();
  const rows: ScanPickWriteRow[] = [];

  submitted.forEach((pick, index) => {
    const pickId = trimmed(pick?.pickId);
    if (!pickId) {
      refusals.push({ pickId: "", reason: "no_pick_id" });
      return;
    }
    if (seen.has(pickId)) {
      refusals.push({ pickId, reason: "duplicate_pick_id" });
      return;
    }
    seen.add(pickId);

    if (!trimmed(pick?.label)) {
      refusals.push({ pickId, reason: "no_label" });
      return;
    }

    // `rank` is the pitch order, so an unreadable one is refused rather than
    // coerced. `Number(null)` and `Number("")` are both 0 — a rank that means
    // "first" — so absent is distinguished from unparseable BEFORE any coercion.
    const givenRank = pick?.rank;
    const rankOmitted = givenRank === null || givenRank === undefined;
    const rank = rankOmitted ? index : Number(givenRank);
    if (!Number.isFinite(rank) || !Number.isInteger(rank)) {
      refusals.push({ pickId, reason: "bad_rank" });
      return;
    }

    const why = trimmed(pick?.why);
    rows.push({
      customer_id: customerId,
      pick_id: pickId,
      label: trimmed(pick.label),
      // Stored NULL, not "": inc.16 omits `why` as a key when blank, and the two
      // must agree or a reason nobody wrote round-trips as one somebody did.
      why: why ? why : null,
      rank,
      recorded_by: recordedBy,
      source: trimmed(request?.source) || null,
    });
  });

  return refusals.length > 0 ? { rows: [], refusals } : { rows, refusals };
}

/** Taking a pick back. Named, dated, and never a delete — 0027's `withdrawn_at`. */
export interface ScanPickWithdrawal {
  customerId: string;
  pickId: string;
  /** ISO instant the decision was made. Supplied, never `now()` here (CR-3). */
  withdrawnAt: string;
}

export interface ScanPickWithdrawPlan {
  match: { customer_id: string; pick_id: string } | null;
  patch: { withdrawn_at: string } | null;
  refusals: { pickId: string; reason: ScanPickWriteRefusal | "bad_withdrawn_at" }[];
}

/**
 * A withdrawal → the exact row it may touch.
 *
 * BOTH KEYS OR NOTHING. `phase_scan_picks_identity` is (customer_id, pick_id); a
 * patch missing the customer would retire that automation for every customer who
 * was ever recommended it. There is no partial match here — the plan is null
 * unless both halves of the identity are present.
 *
 * The timestamp is a parameter rather than `new Date()` so the same input always
 * produces the same plan (CR-3), and it must parse — an unparseable instant would
 * be stored as a withdrawal date the customer's record cannot explain.
 */
export function planScanPickWithdrawal(request: ScanPickWithdrawal): ScanPickWithdrawPlan {
  const refusals: ScanPickWithdrawPlan["refusals"] = [];

  const customerId = trimmed(request?.customerId);
  if (!customerId) refusals.push({ pickId: "", reason: "no_customer_id" });

  const pickId = trimmed(request?.pickId);
  if (!pickId) refusals.push({ pickId: "", reason: "no_pick_id" });

  const withdrawnAt = trimmed(request?.withdrawnAt);
  if (!withdrawnAt || Number.isNaN(Date.parse(withdrawnAt))) {
    refusals.push({ pickId, reason: "bad_withdrawn_at" });
  }

  if (refusals.length > 0) return { match: null, patch: null, refusals };
  return {
    match: { customer_id: customerId, pick_id: pickId },
    patch: { withdrawn_at: withdrawnAt },
    refusals: [],
  };
}
