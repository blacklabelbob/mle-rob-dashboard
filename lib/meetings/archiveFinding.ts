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

import { isPlaceholderTitle, type UnexplainedReport, type UnexplainedRow } from "./unexplainedRows";

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
/**
 * The calendar sync that fills the archive glues the meeting's start instant onto the end of
 * the title — `📊 Weekly Review … 2026-07-17T16:00:00.000-04:00`. On a line that already
 * OPENS with that day, the tail restates it in machine notation and pushes the words Rob
 * actually reads off the edge. 19 of the 23 real rows carry one.
 *
 * Stripped for DISPLAY ONLY. Nothing is written back, which is why this is not part of
 * `isPlaceholderTitle`: that ladder decides whether the sync may OVERWRITE what a human
 * typed and has to stay whole-string timid. Here the archive is untouched, so a tail can go.
 *
 * Timid regardless — the stamp must be a complete one at the very end, and must leave a real
 * name behind. A title that is ONLY a stamp survives intact rather than becoming a blank.
 */
const ISO_TAIL = /\s+\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Some rows carry the day with no time — "Gulf Coast RE KICKOFF 2026-07-22". That is dropped
 * only when it is EXACTLY the day this line already opens with, so the trim can never lose
 * information: a date that does not match the row's own Call Date might be saying something
 * ("… | Q1 close 2026-03-31") and is left alone.
 */
function trimDateTail(title: string, day: string): string {
  const withoutStamp = title.replace(ISO_TAIL, "").trim();
  if (!day) return withoutStamp;
  const bare = withoutStamp.replace(/\s+(\d{4}-\d{2}-\d{2})$/, (m, d: string) => (d === day ? "" : m));
  return bare.trim();
}

/**
 * One line per meeting Rob is being asked to remember: the day, what the row is called, and
 * who it was with when the row says. Nothing else — no summary, no inferred attendee, no
 * "probably the Gulf Coast call". The line exists to jog a memory, and a jog that guesses is
 * worse than a blank, because Rob would then be correcting the machine instead of recalling
 * the meeting.
 *
 * Newline-separated because it is a list and reads as one; `ThingsToAddress` renders the
 * detail with `whitespace-pre-line` so the breaks survive to the screen.
 */
function rowLines(rows: UnexplainedRow[]): string {
  return rows
    .map(({ row }) => {
      const company = (row.company || "").trim();
      const named = trimDateTail(row.title.trim(), row.day);
      // A row can reach this bucket with no title at all when the COMPANY is what identifies
      // it (see `identifiedByCounterparty` in unexplainedRows) — the 7/28 Omega meeting is
      // exactly that row. Its title field says "Meeting 2026-07-28", which is the day printed
      // back at Rob between two things he can actually use. Say who it was with and say the
      // title is missing; do not spend the line repeating the date.
      if (isPlaceholderTitle(named) && company) return `• ${row.day} — with ${company} · no title was ever typed`;
      return `• ${row.day} — ${named || row.title.trim()}${company ? ` · with ${company}` : ""}`;
    })
    .join("\n");
}

/**
 * @param report the WHOLE classification, not just its counts — see the list in the detail.
 */
export function buildArchiveFinding(report: UnexplainedReport): ArchiveFinding | null {
  const { counts } = report;
  const n = counts.needsHumanAccount;
  if (!n) return null;

  // The list is taken from the same pass as the counts, filtered by the same disposition the
  // title names — so the number in the title is the number of lines below it, always. Sorted
  // newest first: the 7/28 Omega meeting is both the most recent and the one whose account
  // exists nowhere but in Rob's head, and it belongs at the top rather than buried under
  // last December's STG calls.
  const owed = report.open
    .filter((r) => r.disposition === "needs-human-account")
    .sort((a, b) => (b.row.day || "").localeCompare(a.row.day || ""));

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
    `for a meeting nobody attended on the record is worse than an empty one.` +
    // The list used to live behind "Run `npm run check:archive`" — a terminal command on a
    // ledger Rob reads in a browser, which is the same as not telling him at all. The rows
    // ARE the ask; a count he cannot act on is not a to-do.
    `\n\n${rowLines(owed)}`;

  return {
    entityName: "Meeting archive",
    title: `${n} archived meetings can only be closed by someone who was in the room`,
    detail,
    severity: "medium",
    dedupeKey: KEY_NEEDS_HUMAN_ACCOUNT,
  };
}
