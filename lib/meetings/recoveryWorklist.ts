/**
 * Q84 — turn the re-count's MEASUREMENT into the exact reads a human still owes.
 *
 * `scripts/q84-recount.mjs` retired the asserted "26 unexplainable" and replaced it with a
 * per-row verdict: 15 `body-present`, 18 `container-only`, 0 `body-empty`. That is a
 * measurement, and it is where the previous increment correctly stopped — a block count is
 * not a read, and summarizing a page from its block count is the same sin one level up.
 *
 * What it left behind is a pile again: 33 rows, four verdicts, and a sentence in BUILD-QUEUE
 * saying "then run find_meeting.py". Typing 33 commands by hand is precisely the
 * hand-maintenance that produced the mess Q84 exists to clean up, so the commands are
 * derived here instead — same input, same list, every time (CR-3).
 *
 * THE ONE JUDGEMENT THIS MODULE MAKES, and it is a demotion not a promotion:
 * `container-only` is NOT evidence of an empty page. The re-count walks the block tree with
 * a depth cap (a rate-limit guard, stated in its own comments), so a row that came back
 * "blocks but no text" may be a page whose transcript sits one level below where the walk
 * stopped. Calling those rows empty would re-commit the original error in a new column. They
 * are therefore re-read with `--deep` BEFORE any cross-database sweep is allowed to run —
 * the cheap local read comes first, and only a page that survives it may be called absent.
 *
 * PURE (CR-3): no clock, no network, no Notion, no filesystem. It never reads a page, never
 * writes one, and never produces a summary of a meeting — it produces commands and the
 * reason each one is owed.
 */

/** The re-count's verdict for one row. Mirrors `scripts/q84-recount.mjs`. */
export type BodyVerdict = "body-present" | "container-only" | "body-empty" | "unmeasured";

export type MeasuredRow = {
  id: string;
  title: string;
  /** YYYY-MM-DD, or "" when neither Call Date nor the title stamp gave one. */
  day?: string;
  /** True when `day` was read off the row's own title, not typed by a human. */
  dayIsDerived?: boolean;
  url?: string;
  body?: { blocks: number; chars: number };
  error?: string;
  verdict: BodyVerdict;
};

/**
 * What kind of work a row is owed. Named for the ACTION, not the row's state, because the
 * question a reader has in front of this list is "what do I run next".
 */
export type Action =
  /** Text is on the page. Open it and read it. Nothing else can be said about it until then. */
  | "read-page"
  /** Blocks but no text within the walk's depth cap. Re-read uncapped before believing it. */
  | "deep-read-page"
  /** Nothing on the page. Sweep the other databases by date before anyone calls it lost. */
  | "sweep-by-date"
  /** Nothing on the page and no day to sweep with. The fix is identifying it, not reading it. */
  | "identify-first"
  /** The measurement itself failed. Re-measure — never inherit "empty" from an error. */
  | "re-measure";

export type WorklistStep = {
  action: Action;
  row: MeasuredRow;
  /** The exact command to run. Empty only for `identify-first`, which has nothing to run. */
  command: string;
  /** One line naming why this command is owed. Never a claim about the meeting's content. */
  why: string;
};

export type Worklist = {
  steps: WorklistStep[];
  counts: Record<Action, number> & { rows: number };
  /**
   * The honest headline. `atMostUnrecoverable` is the count that could still turn out to be
   * "no record exists anywhere" — and it is only knowable AFTER every read below has run, so
   * it is reported as a ceiling with the work that would lower it, never as a finding.
   */
  atMostUnrecoverable: number;
};

/** The script whose reads this list schedules. Stated once so the commands cannot drift apart. */
export const FIND_MEETING =
  "~/.claude/skills/meeting-record-recovery/scripts/find_meeting.py";

/**
 * Depth the re-count's walk stops at. It is a rate-limit guard, not a judgement, and it is
 * the entire reason `container-only` gets a `--deep` re-read rather than a verdict.
 */
export const MEASURED_DEPTH_CAP = 4;

/** Cheapest-and-most-certain first; the row that can say nothing yet goes last. */
const RANK: Record<Action, number> = {
  "read-page": 0,
  "deep-read-page": 1,
  "sweep-by-date": 2,
  "identify-first": 3,
  "re-measure": 4,
};

/** A page is addressed by its url when it has one, and by its uuid when it does not. */
function pageRef(row: MeasuredRow): string {
  return (row.url || "").trim() || row.id;
}

function stepFor(row: MeasuredRow): WorklistStep {
  const ref = pageRef(row);
  const day = (row.day || "").trim();

  if (row.verdict === "unmeasured") {
    return {
      action: "re-measure",
      row,
      command: `${FIND_MEETING} --page ${ref}`,
      why: `the re-count could not measure this row (${row.error || "no reason recorded"}) — an error is not an empty page`,
    };
  }

  if (row.verdict === "body-present") {
    return {
      action: "read-page",
      row,
      command: `${FIND_MEETING} --page ${ref}`,
      why: `${row.body?.chars ?? 0} chars of readable text are already on this page — it is unread, not unexplainable`,
    };
  }

  if (row.verdict === "container-only") {
    return {
      action: "deep-read-page",
      row,
      command: `${FIND_MEETING} --page ${ref} --deep`,
      why: `${row.body?.blocks ?? 0} blocks with no text within the walk's depth cap of ${MEASURED_DEPTH_CAP} — a container is not an absence, so re-read it uncapped before sweeping`,
    };
  }

  // body-empty from here: nothing on the page at all.
  if (!day) {
    return {
      action: "identify-first",
      row,
      command: "",
      why: "no blocks on the page and no date to sweep with — this row needs identifying before any read can be attempted",
    };
  }

  return {
    action: "sweep-by-date",
    row,
    command: `${FIND_MEETING} --date ${day}`,
    why: row.dayIsDerived
      ? `no blocks on the page; sweeping ${day}, a date read off the row's own title rather than typed — confirm it before trusting a miss`
      : `no blocks on the page — sweep every database for ${day} before this row may be called unrecoverable`,
  };
}

/**
 * Build the ordered work-list from the re-count's `measured` array.
 *
 * Ordering is by action, then newest day first, so the reads that are certain to return
 * something are done before the sweeps that may return nothing. Rows sharing a day keep a
 * stable order by title, so two runs on the same input print the same list.
 */
export function buildRecoveryWorklist(measured: MeasuredRow[]): Worklist {
  const steps = measured
    .map(stepFor)
    .sort(
      (a, b) =>
        RANK[a.action] - RANK[b.action] ||
        (b.row.day || "").localeCompare(a.row.day || "") ||
        a.row.title.localeCompare(b.row.title),
    );

  const count = (action: Action) => steps.filter((s) => s.action === action).length;

  return {
    steps,
    counts: {
      rows: steps.length,
      "read-page": count("read-page"),
      "deep-read-page": count("deep-read-page"),
      "sweep-by-date": count("sweep-by-date"),
      "identify-first": count("identify-first"),
      "re-measure": count("re-measure"),
    },
    // Only a row with nothing on its page could ever be unrecoverable, and only after its
    // sweep comes back empty. A `container-only` row is excluded on purpose: it has blocks,
    // and counting it here would smuggle the retired assertion back in under a new name.
    atMostUnrecoverable: count("sweep-by-date") + count("identify-first"),
  };
}
