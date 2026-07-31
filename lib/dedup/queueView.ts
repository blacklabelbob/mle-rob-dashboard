// Q84 inc.49 — which dedup_review rows the queue DRAWS, and in which list.
//
// Pure per CR-3: no clock, no network, no Supabase, no React. The component
// fetches and renders; this decides. That split is why the rule below can be
// tested at all — `DedupQueue` is a client component whose data arrives through
// `fetch`, so a render test proves nothing about a row it never received.
//
// WHY THIS EXISTS: inc.48 taught the ENDPOINT to refuse the two bad reopens
// (a pair Rob dismissed himself, a pair a merge already deleted half of), and
// ended by naming the half it could not close from the server side — the queue
// draws no reopen control at all, so `dedupReopenable()` had a tested meaning
// and still no caller. A predicate with no caller is speculative code; this is
// the caller, and the alternative inc.48 offered was deleting the predicate.
//
// ONE LADDER, NOT A SECOND ONE. Every bucket below comes off `dedupClosedBy` —
// the same read the route uses — so the queue cannot decide a row is reopenable
// while the endpoint refuses to reopen it. That disagreement is the exact defect
// inc.47 and inc.48 were both spent on, one table over each time.

import { dedupClosedBy } from "./resolutionNote";

/** The fields this decision reads. Callers pass their full row through. */
export type DedupViewRow = {
  status?: string | null;
  resolution_note?: string | null;
};

export type DedupQueueView<T> = {
  /** Still to dispose: dismiss, or merge. */
  open: T[];
  /**
   * Closed by the nightly detector, and therefore a click a reviewer may undo.
   * inc.10's rule carried across: a machine close invites a second look, a close
   * Rob made himself does not.
   */
  reopenable: T[];
};

/**
 * Split the queue into the two lists the ledger renders.
 *
 * Rows that are neither — a pair Rob dismissed, a pair a merge closed — are
 * drawn NOWHERE, which is the point rather than an omission. Offering Rob a
 * reopen on his own dismissal second-guesses him; offering one on a merge
 * re-queues a pair whose duplicate row `merge.ts` has already deleted.
 *
 * An UNRECOGNISED status lands in `open`, deliberately. `dedupClosedBy` returns
 * null for anything that is not `dismissed` or `resolved`, and a pair the code
 * cannot classify is exactly the kind a human should be looking at — hiding it
 * would make a schema change silently shrink the queue instead of loudly filling
 * it. Input order is preserved inside each bucket: the API already sorts by
 * confidence then pair_key, and re-sorting here would be a second opinion about
 * an order somebody else owns.
 */
export function partitionDedupQueue<T extends DedupViewRow>(
  rows: readonly T[] | null | undefined,
): DedupQueueView<T> {
  const open: T[] = [];
  const reopenable: T[] = [];
  for (const row of rows ?? []) {
    const closer = dedupClosedBy(row.status, row.resolution_note);
    if (closer === null) open.push(row);
    else if (closer === "detector") reopenable.push(row);
  }
  return { open, reopenable };
}

/**
 * What the detector-closed list says about a row, in a reviewer's words.
 *
 * The stored note is the module's own sentence ("auto: signals no longer present
 * in source records") — accurate, and written for the row rather than for the
 * person reading it. This is the reading side of the same fact, and it says only
 * what was observed: the signals went away. It does NOT say the pair was fixed,
 * because the detector never established that — somebody may have merged them by
 * hand, corrected a typo, or blanked the field that matched.
 */
export function detectorCloseSummary(): string {
  return "Closed automatically — the matching signals are gone from both records.";
}
