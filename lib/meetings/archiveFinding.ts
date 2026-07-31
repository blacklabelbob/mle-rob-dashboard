// Q84 inc.11 — turn the unexplained-rows classification into the ONE ledger row that
// carries it. Pure per CR-3: no clock, no network, no Supabase, no fetch. The caller
// reads the counts and POSTs whatever this returns.
//
// Why this module exists rather than a literal in the script: inc.8 built the dedupe
// mechanism to stop the meeting-archive finding stacking three contradicting counts on
// Rob's ledger — and then said, in its own commit body, that `notion-crm-check.mjs`
// "still does not send a dedupeKey, so the count is corrected by hand today — the
// mechanism exists, the finding is not yet on it." A number corrected by hand is a
// number that goes stale the next time nobody types the command, which is the disease,
// not the cure. This is the finding put ON the mechanism.
//
// KEY_NEEDS_HUMAN_ACCOUNT is the key already carried by prod flag #134, deliberately:
// the point is to CORRECT that row, not to open a fourth one beside it.

import type { UnexplainedReport } from "./unexplainedRows";

/** The classifier's own count block — referenced, not re-declared, so the two cannot drift. */
export type UnexplainedCounts = UnexplainedReport["counts"];

export const KEY_NEEDS_HUMAN_ACCOUNT = "meeting-archive/needs-human-account";

export type ArchiveFinding = {
  entityName: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  dedupeKey: string;
};

/**
 * The ledger row for "archive rows only a human who was in the room can close".
 *
 * Returns null when the bucket is empty. A row reading "0 meetings can only be closed
 * by someone who was in the room" is not a finding — it is noise on a to-do list, and
 * the honest way to say "nothing left" is to leave the ledger alone. (The existing row
 * is NOT auto-resolved either: whether a finding is done is Rob's call, and closing his
 * row from a script is the machine deciding his list is finished.)
 */
export function buildArchiveFinding(counts: UnexplainedCounts): ArchiveFinding | null {
  const n = counts.needsHumanAccount;
  if (!n) return null;

  // Every number in the detail comes off the same classification pass as the title, in
  // the same run. Two numbers from two runs is exactly how #132 and #134 came to
  // disagree about the same pile.
  const detail =
    `${n} row(s) in the Notion meeting archive were never recorded, so only someone who ` +
    `was in the room can say what happened. Of the archive's ${counts.archiveRows} rows: ` +
    `${counts.recorded} carry a recording, ${counts.complete} were filled in by a human, ` +
    `and ${counts.unexplained} have no recording to explain them — ` +
    `${counts.needsIdentification} of those are missing a date or a real title (anyone ` +
    `with the calendar can close them) and ${counts.possibleDuplicate} look like a ` +
    `duplicate of a recorded row. Nothing here is ever auto-filled: an invented summary ` +
    `for a meeting nobody attended on the record is worse than an empty one. ` +
    `Run \`npm run check:archive\` for the row-by-row list.`;

  return {
    entityName: "Meeting archive",
    title: `${n} archived meetings can only be closed by someone who was in the room`,
    detail,
    severity: "medium",
    dedupeKey: KEY_NEEDS_HUMAN_ACCOUNT,
  };
}
