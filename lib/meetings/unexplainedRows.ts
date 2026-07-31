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

import { titleOverlap } from "./archiveCheck";

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
 * Titles that name no meeting. Same ladder as `scripts/notion-meetings-sync.mjs` uses to
 * decide a title is safe to overwrite — the same string should mean the same thing on both
 * sides of the seam, or one pass will "fix" what the other calls fine.
 */
export function isPlaceholderTitle(title: string | undefined): boolean {
  const s = (title || "").trim();
  if (!s) return true;
  if (/^meeting$/i.test(s)) return true;
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(s)) return true;
  if (/^[A-Z][a-z]{2} \d{1,2},? \d{1,2}:\d{2}\s?[AP]M$/i.test(s)) return true;
  if (/^fireflies demo meeting$/i.test(s)) return true;
  // A derived title states what was known and nothing more; it is honest, but it is not a
  // human naming the meeting, so it can never stand as evidence that two rows are the same.
  if (/^untitled recording \(/i.test(s)) return true;
  return false;
}

const TITLE_MATCH_FLOOR = 0.6;

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
    if (!row.day || isPlaceholderTitle(row.title)) {
      return {
        row,
        gaps,
        disposition: "needs-identification",
        nextStep: !row.day
          ? "set Call Date — without a day this row cannot be matched to anything, ever"
          : "give it a real Meeting Title — nobody can say which meeting this is",
      };
    }

    const twin = recorded.find(
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
      nextStep: "no recorder saw this — someone who was in the room has to say what happened",
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
