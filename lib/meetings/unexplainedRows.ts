/**
 * Q84 — the rows no recording can explain.
 *
 * inc.1 filled the archive from every Fireflies body on disk and inc.2 checked the CRM
 * against it. Both stop at the same wall: 26 archive rows carry no recording at all. They
 * are the in-person and externally-recorded meetings — the Omega 2026-07-28 row is one, and
 * what was said in it exists only in Rob's head. No amount of code completes those.
 *
 * So this module does the one thing code CAN do honestly: say, per row, WHY it is still
 * open and WHO can close it. A row that only needs a name is not the same problem as a row
 * that needs a human who was in the room, and a row that is probably a stray duplicate of a
 * recorded call should not be sent to Rob as a memory request at all. Lumping all three into
 * "26 incomplete" is what makes the list unusable — nobody can act on a pile.
 *
 * PURE (CR-3): no clock, no network, no Notion, no Supabase. It invents nothing — every
 * disposition is derived from fields the row already carries, and a row it cannot place
 * lands in the bucket that asks a human, never in one that guesses.
 */

import { TITLE_MATCH_FLOOR, titleOverlap } from "./archiveCheck";

export type ArchiveRowDetail = {
  id: string;
  title: string;
  /** YYYY-MM-DD, or "" when the row carries no Call Date. */
  day: string;
  url?: string;
  /** Call Recording url. Non-empty means a recorder saw this meeting — not this pass's problem. */
  recording?: string;
  summary?: string;
  company?: string;
};

/**
 * What is missing from a row, in the words of the Notion columns themselves so a reader can
 * go fix the named field. Gaps are observations; the disposition below is the judgement.
 */
export type Gap = "no date" | "placeholder title" | "no summary" | "no company";

export type Disposition =
  /** A human filled it in. Nothing is owed — counted, then left alone. */
  | "complete"
  /** Same day and a matching human title as a row a recorder DID see. Merge or delete — do not ask Rob to remember it twice. */
  | "possible-duplicate"
  /** No date, or a placeholder title. Nobody can even say which meeting this is; the fix is naming it, not summarizing it. */
  | "needs-identification"
  /** Real title, real date, no recording, no account of what happened. Only someone who was there can close it. */
  | "needs-human-account";

export type UnexplainedRow = {
  row: ArchiveRowDetail;
  gaps: Gap[];
  disposition: Disposition;
  /** One line naming the next real action. Never a guess about the meeting's content. */
  nextStep: string;
  /** Set only for `possible-duplicate` — the recorded row this looks like. */
  twin?: ArchiveRowDetail;
};

export type UnexplainedReport = {
  /** Every row with no recording, classified. Includes the `complete` ones, for an honest denominator. */
  rows: UnexplainedRow[];
  /** The work-list: everything except `complete`, worst-first (see ordering below). */
  open: UnexplainedRow[];
  counts: {
    archiveRows: number;
    /** Rows a recorder saw. Not this pass's problem — the sync owns them. */
    recorded: number;
    unexplained: number;
    complete: number;
    possibleDuplicate: number;
    needsIdentification: number;
    needsHumanAccount: number;
  };
};

/**
 * Titles that name no meeting.
 *
 * THIS IS THE ONLY LADDER. `scripts/notion-meetings-sync.mjs` imports this exact function
 * through `scripts/ts-loader.mjs` to decide which titles it may overwrite — it used to carry
 * a second hand-kept copy called `isJunkTitle`, and two copies of a predicate that decides
 * "may this pass destroy what a human typed" is a divergence waiting to happen. One ladder,
 * one place, graded by the tests below: the same string now means the same thing on both
 * sides of the seam because it is the same code, not because two comments say so.
 *
 * Every rule here is TIMID on purpose. A false positive does not merely misfile a row — it
 * licenses the sync to overwrite a title a person chose, which is the one change that would
 * make the archive untrustworthy. So each pattern must match the WHOLE string: "Meeting
 * 2026-07-30" says nothing and is fair game; "Meeting 2026-07-30 with Gulf Coast" names a
 * counterparty and is left alone.
 */
export function isPlaceholderTitle(title: string | undefined): boolean {
  const s = (title || "").trim();
  if (!s) return true;
  if (/^meeting$/i.test(s)) return true;
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(s)) return true;
  if (/^[A-Z][a-z]{2} \d{1,2},? \d{1,2}:\d{2}\s?[AP]M$/i.test(s)) return true;
  if (/^fireflies demo meeting$/i.test(s)) return true;
  // A bare ISO timestamp, e.g. "2026-07-29T14:01:00.000-04:00" — a machine's stamp that
  // leaked into the title field. Same reasoning as the "Jul 29, 02:13 PM" rule above. And
  // "Meeting 2026-07-30" is the same nothing with the word in front: it restates a column
  // the row already has, so it needs a NAME, not a human who was in the room. (Q84 inc.3
  // found three of these misfiled as needs-human-account for want of this rule.)
  //
  // The optional prefix and the timestamp tail are ONE pattern on purpose. Written as two
  // rules they drifted immediately — the first draft of this ladder gave "Meeting …" a
  // shorter tail than the bare stamp, and `Meeting 2026-06-16T11:05:00.000-04:00` slipped
  // through while the identical string without the word was caught.
  if (
    /^(meeting[\s:_-]+)?\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/i.test(
      s,
    )
  )
    return true;
  // A derived title states what was known and nothing more; it is honest, but it is not a
  // human naming the meeting, so it can never stand as evidence that two rows are the same.
  if (/^untitled recording \(/i.test(s)) return true;
  return false;
}

/** Order the work-list by who can act, then newest first. */
const RANK: Record<Disposition, number> = {
  "possible-duplicate": 0, // cheapest to close, and closing it shrinks what Rob is asked for
  "needs-identification": 1, // anyone with the calendar can close these
  "needs-human-account": 2, // only someone who was in the room
  complete: 3,
};

function gapsFor(row: ArchiveRowDetail): Gap[] {
  const gaps: Gap[] = [];
  if (!row.day) gaps.push("no date");
  if (isPlaceholderTitle(row.title)) gaps.push("placeholder title");
  if (!(row.summary || "").trim()) gaps.push("no summary");
  if (!(row.company || "").trim()) gaps.push("no company");
  return gaps;
}

/**
 * Classify every archive row a recorder never saw.
 *
 * The duplicate rule is deliberately the timid one inc.1 settled on: a pair is only called
 * the same meeting when BOTH titles are human-chosen, they agree on the same day, and they
 * overlap ≥0.6. A placeholder or derived title is never evidence — two unnamed calls on one
 * day look nearly identical, and quietly merging them destroys a meeting record, while
 * leaving two rows costs one click.
 */
export function classifyUnexplainedRows(rows: ArchiveRowDetail[]): UnexplainedReport {
  const recorded = rows.filter((r) => (r.recording || "").trim());
  const unexplained = rows.filter((r) => !(r.recording || "").trim());

  const classified: UnexplainedRow[] = unexplained.map((row) => {
    const gaps = gapsFor(row);

    if (!gaps.length) {
      return { row, gaps, disposition: "complete", nextStep: "nothing owed — a human already filled this row in" };
    }

    // Identification first: a row with no date or no real name cannot be compared to
    // anything, so it can be neither a duplicate nor a memory request yet.
    //
    // EXCEPT when the row already names WHO it was with. A day plus a counterparty identifies
    // a meeting as surely as a title does — "2026-07-28, Omega Title" is not a mystery row,
    // it is a meeting whose title field was never typed. Routing it to needs-identification
    // said the fix was clerical and hid the one row in the pile that only Rob can close: the
    // 7/28 Omega meeting the queue has named for three increments sat under "give it a real
    // title", where it read as filing work nobody needed to do. Both gaps are still reported;
    // what changes is WHO is being asked, which is the whole point of the buckets.
    const identifiedByCounterparty = Boolean(row.day) && Boolean((row.company || "").trim());
    if (!row.day || (isPlaceholderTitle(row.title) && !identifiedByCounterparty)) {
      return {
        row,
        gaps,
        disposition: "needs-identification",
        nextStep: !row.day
          ? "set Call Date — without a day this row cannot be matched to anything, ever"
          : "give it a real Meeting Title — nobody can say which meeting this is",
      };
    }

    // A placeholder title can now reach this point, so guard BOTH sides: inc.1's rule is that
    // a derived or placeholder title is never evidence two rows are the same meeting. Without
    // this guard, "Meeting 2026-07-28" could overlap its way onto a recorded row and quietly
    // delete an in-person meeting nobody else recorded.
    const twin = isPlaceholderTitle(row.title)
      ? undefined
      : recorded.find(
          (r) =>
            r.day === row.day &&
            !isPlaceholderTitle(r.title) &&
            titleOverlap(r.title, row.title) >= TITLE_MATCH_FLOOR,
        );
    if (twin) {
      return {
        row,
        gaps,
        disposition: "possible-duplicate",
        nextStep: "check against the recorded row for the same day — if it is the same meeting, merge or delete this one",
        twin,
      };
    }

    return {
      row,
      gaps,
      disposition: "needs-human-account",
      nextStep: isPlaceholderTitle(row.title)
        ? `no recorder saw this — someone who was in the room with ${(row.company || "").trim()} that day has to say what happened (and give it a real title)`
        : "no recorder saw this — someone who was in the room has to say what happened",
    };
  });

  const open = classified
    .filter((r) => r.disposition !== "complete")
    .sort((a, b) => RANK[a.disposition] - RANK[b.disposition] || (b.row.day || "").localeCompare(a.row.day || ""));

  const count = (d: Disposition) => classified.filter((r) => r.disposition === d).length;

  return {
    rows: classified,
    open,
    counts: {
      archiveRows: rows.length,
      recorded: recorded.length,
      unexplained: unexplained.length,
      complete: count("complete"),
      possibleDuplicate: count("possible-duplicate"),
      needsIdentification: count("needs-identification"),
      needsHumanAccount: count("needs-human-account"),
    },
  };
}
