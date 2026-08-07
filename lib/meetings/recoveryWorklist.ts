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
 * ⚠ WHAT `--deep` ACTUALLY DOES — corrected 2026-08-07 (inc.47) after reading the reader.
 * The paragraph above says the deep re-read exists to get BELOW a depth cap. That is the
 * right instinct pointed at the wrong flag. `find_meeting.py`'s `walk_blocks` recurses on
 * `has_children` with **no depth limit at all**; `--deep` raises its BLOCK BUDGET, 6,000 →
 * 60,000. So the flag lifts a width/volume ceiling, never a depth one. The depth-4 cap is
 * the RE-COUNT's, and it belongs to the measurement, not the reader — which means a
 * `container-only` row measured at 5 blocks was never budget-limited, and its scheduled
 * `--deep` re-read returns byte-identical output to the measurement's own reach. Verified,
 * not reasoned: four rows re-read uncapped (`3b21de57…7129c6`, `…6718ef`, `…76a138`,
 * `…a6c96a`) each came back 5 blocks / 76 chars, a `[transcription]` wrapper over four empty
 * paragraphs. The re-read is still owed once per row — a page CAN be budget-truncated, and
 * only running it proves which — but a row that has run it and come back empty must stop
 * being re-scheduled, which is what `open-in-notion` below exists to record.
 *
 * PURE (CR-3): no clock, no network, no Notion, no filesystem. It never reads a page, never
 * writes one, and never produces a summary of a meeting — it produces commands and the
 * reason each one is owed. It now grades transcription statuses through
 * `transcriptionStatus.ts`, which is pure for the same reasons: the status is HANDED to this
 * module by a caller that did the network, exactly as the read log's text is.
 */

import { classifyTranscription } from "./transcriptionStatus";

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
   * The uncapped re-read RAN and the API had nothing more to give: a `[transcription]`
   * wrapper with no recoverable text under it. This is a THIRD state and both neighbours
   * would be a lie about it.
   *
   * `deep-read-page` would re-schedule a command already proven to return the same bytes,
   * forever — the re-scheduling defect inc.37 and inc.46 each fixed in a different column.
   * `already-read` would say "nothing further is owed on the page itself", and something is:
   * `find_meeting.py` prints, in its own words, *"Do NOT report 'no transcript' — open the
   * page in Notion and say so."* The content exists in Notion's AI transcription block and
   * is simply not exposed by `/blocks/{id}/children`. Filing that as read would convert a
   * TOOL limit into a claim about the MEETING, which is the exact substitution Q84 exists
   * to kill (INCIDENT-LEDGER #22/#34).
   *
   * So it is neither owed-again nor done: it is owed to a HUMAN, in a browser, and it is
   * never counted toward `atMostUnrecoverable` — the page has blocks.
   */
  | "open-in-notion"
  /**
   * `open-in-notion`, ANSWERED. The row's transcription block carries a `status`, Notion
   * reports it as never produced, and so the human read that bucket asks for cannot recover
   * text that was never written.
   *
   * This is deliberately a SEPARATE action rather than a quiet removal from `open-in-notion`.
   * The row still exists, still holds blocks, and still may have a recording somewhere that is
   * not Notion (Fireflies, Fathom, Zoom, Drive — that is Q86). What has been retired is exactly
   * one task: opening this page in a browser. Collapsing it into `already-read` would claim a
   * read that never happened; leaving it in `open-in-notion` would keep asking a human to go
   * find nothing. Both are lies of a different sign, so it gets its own rung.
   *
   * Only Notion's own recognised statuses may put a row here — see `transcriptionStatus.ts`.
   * An unknown status leaves the row in `open-in-notion` untouched.
   */
  | "notion-says-no-transcript"
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
  /**
   * The exact command to run. Empty for the three actions that have nothing to RUN:
   * `identify-first`, `already-read`, and `open-in-notion` — the last of which is owed to a
   * human in a browser rather than to a shell.
   */
  command: string;
  /**
   * The page's address — its Notion url, falling back to its uuid. Always present, on every
   * action, because a step that names work without naming WHICH page is not actionable.
   *
   * It exists because of the bucket that has no command: `open-in-notion`'s entire content is
   * "a human must open this page", and until this field the list printed a date and a
   * truncated title and no link — three separate rows reading `Meeting 2026-08-04`, none of
   * them openable. A command-bearing step already carries the ref inside its command; a
   * commandless one had nowhere to carry it at all.
   */
  ref: string;
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
  // Above `already-read` and below every machine action: it asks for work, but not work a
  // script can do. Burying it under the finished rows would hide the only bucket whose
  // remedy is a human opening a browser.
  "open-in-notion": 4.5,
  // Directly under the bucket it answers, and above `already-read`, because it is not a read.
  // It sits adjacent to `open-in-notion` on purpose: the two are the same rows before and
  // after Notion was asked, and a reader scanning the list should see them next to each other.
  "notion-says-no-transcript": 4.8,
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
 *
 * SECOND ACCEPTED HEADING SHAPE, added 2026-08-07 (Q84 inc.46) because the first one silently
 * dropped a real entry. inc.45 filed its write-up under `` ## `3761de57-…` — `2026-06-05T13:56` ``
 * — a heading that names the page by ID and never types the word READ. The section was skipped,
 * and the pass then printed that page as a read "proven by an archived dump but ABSENT from the
 * read log", i.e. a write-up owed that had in fact been written. A checker that reports owed work
 * as owed when it is done is the same class of lie Q84 exists to kill, so the shape the log
 * actually uses is now recognised rather than reported as a gap.
 *
 * The discipline is NOT loosened by it: in an id-headed section only the ids IN THE HEADING
 * count. The heading is the log addressing that page; the body is prose, and a page id mentioned
 * in prose stays exactly as unread as it was before. `READ`-headed sections keep scanning their
 * whole section, which is the convention their entries were written against.
 */
export function parseReadLogPageIds(markdown: string): string[] {
  const ids = new Set<string>();
  // Split on `##` headings, keeping each heading with the body that follows it.
  const sections = markdown.split(/\n(?=##\s)/);
  for (const section of sections) {
    const heading = section.split("\n", 1)[0] ?? "";
    const headingIds = heading.match(PAGE_ID_PATTERN) ?? [];
    // An id-headed section is scanned in the heading ONLY; a READ-headed one, in full.
    const scanned = /\bREAD\b/.test(heading)
      ? (section.match(PAGE_ID_PATTERN) ?? [])
      : headingIds;
    for (const raw of scanned) ids.add(normalizePageId(raw));
  }
  return [...ids];
}

/** Notion page ids as the log writes them — dashed uuid or the 32-char dashless form. */
const PAGE_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32}\b/gi;

/**
 * Page ids proven read by the ARCHIVED OUTPUT ITSELF, independent of whether anyone wrote the
 * log paragraph.
 *
 * This exists because the log was a single point of failure and it failed. A prior run read
 * `3b11de57-0199-8020-9fb9-c3171150b472` in full (31,417 bytes), archived it, and never wrote
 * the log entry — and it landed in a `MLE Internal Meetings/` directory OUTSIDE the repo, a
 * sibling of it, so git never saw the file either. The work-list then printed that page at the
 * TOP of "to read", and the next run would have re-read 28,869 chars that were already on disk.
 * Same shape as the six re-scheduled reads inc.37 fixed: the read happened, the record of it
 * did not.
 *
 * So a read now has two independent witnesses and either one is sufficient — the human-written
 * log OR the machine-written artifact. The artifact is the stronger of the two: the log records
 * an intention to remember, the file records the read.
 *
 * PURE like its sibling: handed each archive's TEXT, never a directory — the caller walks the
 * filesystem. Reads the `id :` header `find_meeting.py` writes at the top of every dump, which
 * is the only place the page id survives; the filenames are human-chosen and carry no id.
 */
export function parseArchivedReadPageIds(archives: Iterable<string>): string[] {
  const ids = new Set<string>();
  for (const text of archives) {
    // Anchored to the header line, not a loose scan: a page id quoted in the BODY of a
    // transcript (a pasted link, a cross-reference) is not evidence that page was read.
    const match = /^\s*id\s*:\s*([0-9a-f-]{32,36})\s*$/im.exec(text);
    if (match) ids.add(normalizePageId(match[1]));
  }
  return [...ids];
}

/**
 * Page ids whose archived read PROVES the reader hit the end of what the API exposes: a
 * `[transcription]` wrapper with no recoverable text under it.
 *
 * The witness is the reader's OWN warning line, not this module's inference. `find_meeting.py`
 * emits `‼ A [transcription] wrapper is present but recovered almost no text.` only when it
 * has walked the wrapper and come back empty-handed — so the marker means the walk happened,
 * which is precisely what distinguishes this from "nobody has looked yet".
 *
 * Deliberately NOT keyed on a char count. A threshold here would be a second, drifting copy
 * of the reader's own judgement, and the first page that sits either side of it would be
 * classified by this module rather than by the tool that did the reading.
 *
 * PURE like its siblings: handed each archive's TEXT, never a directory.
 */
export function parseExhaustedDeepReadPageIds(archives: Iterable<string>): string[] {
  const ids = new Set<string>();
  for (const text of archives) {
    if (!/\[transcription\] wrapper is present but recovered almost no text/i.test(text)) continue;
    const match = /^\s*id\s*:\s*([0-9a-f-]{32,36})\s*$/im.exec(text);
    if (match) ids.add(normalizePageId(match[1]));
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

/** The ref is stamped by the caller, so every branch gets it — including the early returns. */
function stepFor(row: MeasuredRow): Omit<WorklistStep, "ref"> {
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
  opts: {
    alreadyRead?: Iterable<string>;
    deepReadExhausted?: Iterable<string>;
    /**
     * What Notion says about each page's own transcription block, keyed by page id — the
     * verbatim `status` string, exactly as `status:q84` measured it. Absent, every row keeps
     * the disposition it had before this option existed.
     *
     * It is consulted in ONE place — the `open-in-notion` branch — and that narrowness is
     * deliberate. `open-in-notion`'s entire content is "a human must open this page and look at
     * the transcription wrapper", which is precisely the task a never-produced status retires.
     * A `container-only` row is NOT short-circuited by the same status: its `--deep` re-read
     * looks for ALL body text (AI summaries, action items, section blocks), not only the
     * transcript, so a page with no transcript can still have a body worth reading. Letting a
     * transcription status cancel that read would convert a claim about the TRANSCRIPT into a
     * claim about the PAGE — the substitution Q84 exists to kill.
     */
    transcriptionStatuses?: Iterable<readonly [string, string | null | undefined]>;
  } = {},
): Worklist {
  // Absent `alreadyRead`, every row is scheduled exactly as before — a caller that knows
  // nothing about the read log gets a byte-identical list, so this cannot quietly hide work.
  const read = new Set([...(opts.alreadyRead ?? [])].map(normalizePageId));
  const exhausted = new Set([...(opts.deepReadExhausted ?? [])].map(normalizePageId));
  const statuses = new Map(
    [...(opts.transcriptionStatuses ?? [])].map(([id, status]) => [normalizePageId(id), status]),
  );
  const steps = measured
    .map((row): WorklistStep => {
      const id = normalizePageId(row.id);
      // Stamped here, once, on every branch below — including the two that return early.
      // A step that named work without naming the page is exactly the defect this closes,
      // so the ref is attached at the single point every step passes through.
      const ref = pageRef(row);
      // Checked BEFORE `already-read`, and the order is the whole point. An exhausted dump
      // is also an archived dump, so `parseArchivedReadPageIds` matches it too — and letting
      // that win would file "nothing further is owed" onto the one bucket where something
      // is: a human opening the page in Notion. The stronger claim must not be reachable by
      // the weaker witness.
      if (exhausted.has(id)) {
        // Notion is allowed to answer the question this bucket asks, and ONLY with a status
        // the ladder recognises as never-produced. `transcript-exists`, `unknown`, and a row
        // nobody measured all fall through to the human read below, unchanged.
        const verdict = statuses.has(id) ? classifyTranscription(statuses.get(id)) : null;
        if (verdict?.disposition === "never-produced") {
          return {
            action: "notion-says-no-transcript" as const,
            row,
            command: "",
            ref,
            why: `${verdict.why} — the human read this row was owed is retired; a recording elsewhere (Fireflies, Fathom, Zoom, Drive) is Q86, not a Notion read`,
          };
        }
        return {
          action: "open-in-notion" as const,
          row,
          command: "",
          ref,
          why: "the uncapped re-read ran and the API returned a [transcription] wrapper with no text under it — the reader is exhausted, the page is not; open it in Notion rather than calling it empty",
        };
      }
      if (read.has(id)) {
        return {
          action: "already-read" as const,
          row,
          command: "",
          ref,
          why: "this page has been opened and its read is filed in the read log — nothing further is owed on the page itself",
        };
      }
      return { ...stepFor(row), ref };
    })
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
      "open-in-notion": count("open-in-notion"),
      "notion-says-no-transcript": count("notion-says-no-transcript"),
      "already-read": count("already-read"),
    },
    // Only a row with nothing on its page could ever be unrecoverable, and only after its
    // sweep comes back empty. A `container-only` row is excluded on purpose: it has blocks,
    // and counting it here would smuggle the retired assertion back in under a new name.
    // `open-in-notion` is excluded for the same reason and one more: its page has blocks AND
    // a transcription wrapper, so it is the row LEAST entitled to be called an absence.
    // `notion-says-no-transcript` is excluded on exactly the same grounds and is NOT promoted
    // by having been answered: Notion saying it never transcribed a meeting is a claim about
    // Notion's transcript, never about whether the meeting was recorded anywhere else.
    atMostUnrecoverable: count("sweep-by-date") + count("identify-first"),
  };
}
