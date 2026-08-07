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
  | "re-measure"
  /**
   * The page has already been opened, read, and filed in the read log. It is carried here
   * rather than dropped: a row that vanishes from a work-list is indistinguishable from a row
   * nobody ever owed, and "16 to read" that silently includes six finished reads is the same
   * kind of stale claim Q84 exists to retire.
   */
  | "already-read";

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
  // Last, because it is the only entry that asks for nothing. It stays visible so the list
  // can be checked against the read log, and so a wrongly-matched id is caught by eye.
  "already-read": 5,
};

/**
 * Page ids the read log says have actually been opened and read.
 *
 * PURE: it is handed the log's TEXT, never a path — the caller does the filesystem read, so
 * this stays testable against a string and cannot go looking for a file that moved.
 *
 * The gate is deliberately narrow. An id counts as read only when it sits inside a `##`
 * section whose heading carries the literal token `READ` — the log's own convention for
 * "this page was opened and its output is on disk". Ids that appear anywhere else (a
 * still-owed list, a cross-reference, a prose mention) are NOT read, because the whole
 * discipline of that file is that a mention is not a read.
 */
export function parseReadLogPageIds(markdown: string): string[] {
  const ids = new Set<string>();
  // Split on `##` headings, keeping each heading with the body that follows it.
  const sections = markdown.split(/\n(?=##\s)/);
  for (const section of sections) {
    const heading = section.split("\n", 1)[0] ?? "";
    if (!/\bREAD\b/.test(heading)) continue;
    for (const raw of section.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32}\b/gi) ?? []) {
      ids.add(normalizePageId(raw));
    }
  }
  return [...ids];
}

/** Notion prints the same id dashed and undashed; compare on the dashless lower-case form. */
export function normalizePageId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * How much text a row is already known to hold, used only to order the reads.
 *
 * It is a SIZE, never a verdict: a 101k-char page and a 900-char page are both unread, and
 * neither number says anything about what the meeting contains. Reading the biggest bodies
 * first is simply the order that retires the most unread text per read — BUILD-QUEUE's
 * "largest-body-first" now lives here rather than in a sentence a session has to remember.
 * `container-only` rows have no chars yet, so they fall back to blocks, which is the only
 * size a depth-capped walk actually measured.
 */
function bodyWeight(row: MeasuredRow): number {
  return row.body?.chars || row.body?.blocks || 0;
}

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
 * Ordering is by action, then by how much text the row is already known to hold (largest
 * first), then newest day first. Action first, so the reads that are certain to return
 * something are done before the sweeps that may return nothing; size next, so the pages
 * carrying the most unread text are opened first. Rows tying on both keep a stable order by
 * title, so two runs on the same input print the same list.
 */
export function buildRecoveryWorklist(
  measured: MeasuredRow[],
  opts: { alreadyRead?: Iterable<string> } = {},
): Worklist {
  // Absent `alreadyRead`, every row is scheduled exactly as before — a caller that knows
  // nothing about the read log gets a byte-identical list, so this cannot quietly hide work.
  const read = new Set([...(opts.alreadyRead ?? [])].map(normalizePageId));
  const steps = measured
    .map((row) =>
      read.has(normalizePageId(row.id))
        ? {
            action: "already-read" as const,
            row,
            command: "",
            why: "this page has been opened and its read is filed in the read log — nothing further is owed on the page itself",
          }
        : stepFor(row),
    )
    .sort(
      (a, b) =>
        RANK[a.action] - RANK[b.action] ||
        bodyWeight(b.row) - bodyWeight(a.row) ||
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
      "already-read": count("already-read"),
    },
    // Only a row with nothing on its page could ever be unrecoverable, and only after its
    // sweep comes back empty. A `container-only` row is excluded on purpose: it has blocks,
    // and counting it here would smuggle the retired assertion back in under a new name.
    atMostUnrecoverable: count("sweep-by-date") + count("identify-first"),
  };
}
