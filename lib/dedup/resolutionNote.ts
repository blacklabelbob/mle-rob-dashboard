// Q84 inc.47 — what CLOSING a dedup_review pair writes, decided in one place.
//
// Pure per CR-3: no clock, no network, no Supabase. The callers supply the ids
// they already hold and write the string this module returns.
//
// THE HANDOVER THIS ANSWERS WAS WRONG ABOUT THE TABLE, AND RIGHT ABOUT THE SHAPE.
// inc.46 handed over `app/api/admin/dedup/route.ts:77` as "a SECOND resolve path
// the inc.43/44/45 provenance rule never reaches, so a dedup close writes no
// `Resolved from …` clause". Audited: it reaches nothing because it is a
// DIFFERENT TABLE. `resolvedFromNote`/`resolvedFrom`/`supersededBy` read
// `flags.resolution_note` — the Things-to-Address ledger, its archive, and its
// Reopen control. Nothing in that chain reads `dedup_review` (grep: the only
// consumers are this folder, `lib/integrity/backup.ts`, and `DedupQueue`). A
// dedup close writing no `Resolved from …` clause is not a gap; that clause
// records which CRM record a ledger finding was settled from, and a dedup pair
// is not settled from a record — it IS the two records. Stamping one would be a
// false provenance line, which is the exact failure `addressFromDetail` refuses.
//
// What the audit DID find is the inc.44/inc.45/inc.46 shape, one table over:
// three writers, three hand-rolled grammars, none of them agreeing anywhere.
//   1. components/DedupQueue.tsx  — `"reviewed: not a duplicate"`, a literal in JSX
//   2. lib/dedup/merge.ts         — `merged: ${dId} → ${sId}`
//   3. lib/dedup/detector.ts      — `"auto: signals no longer present in source records"`
// plus the route, which writes ANY caller-supplied string through raw. So the
// only reason a dismissal reads consistently is that one component holds a
// literal — inc.45's sentence exactly, and the reason it was worth removing
// there: the next caller (a script, a second button, a cron) writes its own
// wording and the queue grows two vocabularies for one act.
//
// MEASURED BEFORE CHANGING ANYTHING: `dedup_review` holds **0 rows** on prod
// (read-only query, 2026-07-31). Nothing has ever been closed through any of the
// three paths, so this is LATENT — like inc.44/inc.45/inc.46 and unlike inc.43.

/** Who closed a pair. `status` on the row, made a word instead of a string compare. */
export type DedupCloser = "reviewer" | "merge" | "detector";

/**
 * The note a human dismissal writes.
 *
 * Takes NO free-text argument, deliberately. The queue has one dismiss button
 * with one meaning — "not a duplicate" — and the route already accepts an
 * arbitrary string, so the temptation is to thread the reviewer's words through.
 * There is no input to thread: `DedupQueue` renders no note box, and inventing
 * one here would be this module deciding a UI question. When a note box exists,
 * it gets an argument and a test; until then a fixed sentence beats a literal
 * copied into whichever caller clicks next.
 */
export function dismissedNote(): string {
  return "reviewed: not a duplicate";
}

/**
 * The note a completed merge writes.
 *
 * Ids, not names. `merge.ts` plans against ids and a name is a field the merge
 * itself may have just folded — printing the survivor's name into a permanent
 * note risks recording a value that was overwritten in the same operation. An id
 * still resolves after every fold in the plan.
 */
export function mergedNote(duplicateId: string, survivorId: string): string {
  return `merged: ${duplicateId} → ${survivorId}`;
}

/**
 * The note the detector's auto-resolve writes when a pair stops matching.
 *
 * "signals no longer present" and not "resolved" or "fixed": the detector did
 * not decide these are different people. It observed that whatever made them
 * look alike — a shared phone, a near-identical name — is no longer in the
 * source records. That can mean somebody merged them by hand, or corrected a
 * typo, or blanked a field. Claiming more than was observed is how a queue
 * starts asserting conclusions nobody reached.
 */
export function autoResolvedNote(): string {
  return "auto: signals no longer present in source records";
}

/**
 * Read a closed pair back: who closed it?
 *
 * This is inc.10's `supersededBy` question on the dedup table — tell a row the
 * machine closed from a row Rob closed — and it is answered from `status`, NOT
 * by parsing the note. The three writers already put three different statuses on
 * the row (`dismissed` for the reviewer, `resolved` for both machine paths), and
 * a status is a column the database enforces while a note is prose somebody can
 * edit. inc.10 had to parse because flags carry ONE resolved status for both
 * kinds of close; this table does not, so parsing here would be a weaker check
 * dressed up as the same one.
 *
 * The note is still read — but only to split the two machine closes apart, and
 * only via the writers above, so a wording change cannot silently reclassify a
 * row. An unrecognised `resolved` note returns "detector": the auto-resolve is
 * the path that runs unattended on a cron, so it is the honest default for "a
 * machine closed this and we can't tell which one".
 *
 * @returns the closer, or null if the row is not closed at all
 */
export function dedupClosedBy(
  status: string | null | undefined,
  note: string | null | undefined,
): DedupCloser | null {
  if (status === "dismissed") return "reviewer";
  if (status !== "resolved") return null;
  const body = typeof note === "string" ? note.trim() : "";
  return body.startsWith("merged: ") ? "merge" : "detector";
}

/**
 * Is this a close a reviewer may undo?
 *
 * inc.10's rule, carried across: a row the machine closed invites a click; a row
 * Rob closed carries his own judgement and offering to reopen it is the ledger
 * second-guessing him. A merge is the third case and the strictest — `reopen`
 * would set the pair back to `open` while `merge.ts` has already DELETED the
 * duplicate row, so the queue would re-offer a pair whose second half no longer
 * exists. That is not a judgement call, it is a dangling reference.
 */
export function dedupReopenable(
  status: string | null | undefined,
  note: string | null | undefined,
): boolean {
  return dedupClosedBy(status, note) === "detector";
}

/**
 * Q84 inc.48 — may the ENDPOINT perform this reopen, and if not, what does it
 * tell the caller?
 *
 * `dedupReopenable` answers the UI question ("should the queue draw a reopen
 * control on this row?"). This answers the server question ("a PATCH just
 * arrived — write it or refuse it?"). They are not the same question and they
 * disagree on exactly one input, deliberately:
 *
 *   an ALREADY-OPEN row → no control (there is nothing to undo), but no refusal
 *   either. Reopening an open pair writes the values it already holds; a double
 *   click or a retried request is a no-op, and 409-ing a no-op teaches a caller
 *   to fear a button that did nothing wrong.
 *
 * Both are defined in terms of `dedupClosedBy`, so there is still ONE ladder
 * reading the row — the repeated defect in this queue is two ladders drifting
 * apart, not two questions sharing one.
 *
 * Why this exists at all: until now the route accepted any `pairKey` with
 * `action: "reopen"` and set it back to `open`. For a MERGED pair that is a
 * dangling reference — `merge.ts` has already DELETED the duplicate row, so the
 * queue would re-offer a pair whose second half is gone. Latent today at 0 rows
 * in `dedup_review`; live the moment a merge runs. The UI never offered the
 * click, which is not the same as the server refusing to honour it.
 *
 * @returns the refusal to send back, or null if the write may proceed
 */
export function reopenRefusal(
  status: string | null | undefined,
  note: string | null | undefined,
): string | null {
  switch (dedupClosedBy(status, note)) {
    case "reviewer":
      return "you dismissed this pair yourself — reopening it from here would second-guess your own call. Re-run the detector if the underlying records changed.";
    case "merge":
      return "this pair was merged — the duplicate record no longer exists, so reopening it would queue a pair whose second half is gone.";
    default:
      // "detector" (the unattended close this control exists for) and null (an
      // already-open row, where the write is a no-op) both proceed.
      return null;
  }
}
