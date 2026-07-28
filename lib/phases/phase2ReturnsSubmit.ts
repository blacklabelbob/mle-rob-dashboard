// Q63 leg (5) inc.11: the submission — the first path on which a human being can
// actually record a Phase 2 measurement. inc.1-inc.7 built the read path and the
// write door; inc.8 built the seam that survives a browser's string typing. All of
// it was reachable only from a test. This module is the ORDER those pieces run in,
// and the order is the whole content of the file — which is why it is here, pure and
// injected, rather than inlined in a route handler where nothing can test it (CR-3).
//
// THE SEQUENCE, AND WHY EACH STEP PRECEDES THE NEXT:
//
//   1. INTAKE FIRST (`intakePhase2Returns`). A body that is not an object at all has
//      no fields to judge, so there is nothing for the door to say about it. Running
//      the door first would produce a list of nine field refusals for a payload whose
//      real defect is that it is a string.
//
//   2. THE DOOR SECOND (`planPhase2ReturnsWrite`). Every judgement about whether a
//      measurement is usable lives there and stays there. This module adds no field
//      rules of its own — if it did, a submission could be refused for a reason the
//      door does not know, and the two vocabularies would drift.
//
//   3. THE RETRACTION CHECK THIRD, AND ONLY ON A ROW THAT WOULD OTHERWISE LAND.
//      `fetchSupersededMeasuredAt` is a database read; asking it about a submission
//      the door already refused spends a round trip to learn nothing. More
//      importantly it is asked about the NORMALISED instant — the door's
//      `isoInstant` is what makes `"7/28/2026 3pm"` and `"2026-07-28T19:00:00Z"` the
//      same measurement, and the retraction check must ask about the same instant
//      the upsert will write, or a retracted measurement resubmitted in a different
//      date format walks straight past its own retraction.
//
//   4. THE UPSERT LAST. `phase2_returns_identity` is (customer, measured_at), so a
//      resubmission of the same instant CORRECTS that measurement rather than
//      stacking a second one — the intended behaviour, and the reason step 3 exists
//      at all: without it, correcting and RESURRECTING are the same gesture.
//
// WHY A RETRACTED INSTANT IS REFUSED RATHER THAN SILENTLY REINSTATED. Someone
// retracted that measurement deliberately — it was wrong, or it was disputed, and
// the guarantee that decides whether Rob owes a customer money reads only live rows.
// An upsert would clear nothing (`superseded_at` is not in the row), so the write
// would appear to succeed while the number stayed invisible: the measurer sees
// "saved" and the page keeps showing the old answer. Refusing names the real state
// and points at the one path that exists for this — `reinstateMeasurement`.
//
// NOTHING HERE CATCHES. Both db methods throw on failure by design (an empty array
// from a failed retraction read would read as "nothing was retracted" — a claim
// about a customer's history on no evidence). Swallowing that here would rebuild
// exactly the silent failure those methods were written to prevent; the route turns
// a throw into a 500, which is what an unknown outcome is.

import { intakePhase2Returns } from "./phase2ReturnsIntake";
import {
  planPhase2ReturnsWrite,
  type Phase2ReturnsWritePlan,
  type Phase2ReturnsWriteRow,
} from "./phase2ReturnsWrite";
import type { Phase2ReturnsWriteDb } from "./phase2ReturnsWriteDb";

export type Phase2ReturnsSubmitOutcome =
  /** The body was not an object — there were no fields to judge. */
  | { status: "not_an_object" }
  /** The door refused. Every failing field, in one round trip. */
  | { status: "refused"; refusals: Phase2ReturnsWritePlan["refusals"] }
  /** That instant is retracted for that customer. Reinstate it; do not re-record it. */
  | { status: "superseded"; customerId: string; measuredAt: string }
  /** Stored. The row is returned exactly as written, normalised instant included. */
  | { status: "stored"; row: Phase2ReturnsWriteRow };

/**
 * An untrusted body + a write db → the measurement stored, or the reason it was not.
 *
 * The db is injected rather than imported so this runs against a fake in tests and
 * against Supabase in the route, with the same sequence proven in both.
 */
export async function submitPhase2Returns(
  body: unknown,
  db: Phase2ReturnsWriteDb,
): Promise<Phase2ReturnsSubmitOutcome> {
  const intake = intakePhase2Returns(body);
  if (!intake.submission) return { status: "not_an_object" };

  const plan = planPhase2ReturnsWrite(intake.submission);
  if (!plan.row) return { status: "refused", refusals: plan.refusals };

  const row = plan.row;
  const retracted = await db.fetchSupersededMeasuredAt(row.customer_id, [row.measured_at]);
  if (retracted.length > 0) {
    return { status: "superseded", customerId: row.customer_id, measuredAt: row.measured_at };
  }

  await db.upsertMeasurements([row]);
  return { status: "stored", row };
}
