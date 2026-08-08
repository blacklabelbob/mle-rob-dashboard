/**
 * Q86 inc.10 — the deep reads that were already on disk, and the ruling that makes one COUNT.
 *
 * inc.9 wired Notion into the spine and printed, for every page with a body over the floor, that it
 * held *"characters that nothing in this repo has read"*. That sentence was FALSE for 32 of the 49
 * rows. `MLE Internal Meetings/archive-reads/*.deepread.txt` — written by Q84's archive pass — holds
 * the full recursive body of those pages, keyed by the Notion page id, in git. inc.9 never looked.
 *
 * So this module does two separate jobs and refuses to let either stand in for the other:
 *
 *   1. **READ** — a `.deepread.txt` exists for this page id. That is a fact about the repo, parsed
 *      out of the file's own header, and it is enough to stop saying nobody has read the page.
 *   2. **RULED** — a human (or an agent that actually read the file end to end) recorded a verdict
 *      in `MLE Internal Meetings/notion-read-confirmations.json`. Only a `transcript` verdict makes
 *      the row COVERAGE.
 *
 * WHY THE VERDICT IS A RECORDED RULING AND NOT A SHAPE HEURISTIC. The tempting rule is "many
 * `[paragraph]` blocks ⇒ transcript, mostly `[bulleted_list_item]` ⇒ summary". It does not hold,
 * and inc.11 replaced inc.10's justification for saying so because inc.10's was WRONG about the
 * file it cited. inc.10 called `2026-06-16-gulfcoast-ai-alex-one` "a pure AI summary (228
 * paragraphs)". It is not. It was read end to end on 2026-08-07 and ruled `transcript`: under a
 * `Notion AI is transcribing this meeting.` marker sit ~200 paragraph blocks of verbatim
 * two-party speech, profanity and all. Both of the two files inc.10 compared are transcripts.
 *
 * The real reason shape cannot decide it is stronger than the one inc.10 gave: the SAME kind of
 * content is chunked differently by the recorder. `2025-12-20-will-devito` carries its transcript
 * in FOUR paragraph blocks of 37,122 / 21,637 / 8,151 / 7,342 chars — 74k of its 77k in four
 * blocks — so its census reads `paragraph×9`. `2026-06-16-gulfcoast-ai-alex-one` carries the same
 * kind of speech as `paragraph×228` of a few hundred chars each. A block census measures how
 * Notion happened to record the page, not what the page contains; two transcripts differ by 25×
 * on the very axis the heuristic would key off. A speaker-prefix regex is no better — it scores
 * will-devito at 2 lines and gulfcoast-alex, which has no speaker labels at all, at 0.
 *
 * So someone opens the file. When they do, the ruling is written down with the evidence, once,
 * and never has to be re-derived.
 *
 * PURE per CR-3: handed already-read text; no fs, no network, no clock. The scanning lives in
 * `scripts/calendar-spine.mjs`.
 */

/** A `.deepread.txt` that exists on disk for a Notion page, as its own header describes it. */
export type NotionPageRead = {
  /** The Notion page id the read is of — the join key to the snapshot row. */
  pageId: string;
  /** Repo-relative path, so a reader is given the file rather than told one exists. */
  path: string;
  /** Blocks the read walked. Recursive, so typically HIGHER than the snapshot's top-level count. */
  blocks?: number;
  /** Characters the read walked. Same. */
  chars?: number;
};

/** What someone found when they opened the read. Recorded, never inferred. */
export type NotionReadVerdict = "transcript" | "summary-only" | "empty";

/** A ruling on one read, carrying the evidence that justifies it. */
export type NotionReadConfirmation = {
  pageId: string;
  verdict: NotionReadVerdict;
  /** What was found, in words — quoted evidence where the verdict is `transcript`. */
  note: string;
  /** `YYYY-MM-DD` the ruling was made. A date, not a clock read. */
  confirmedAt: string;
  /** Who ruled — `max` or a person. So a wrong ruling has an owner. */
  confirmedBy: string;
};

/** A read joined to its ruling, if it has one. */
export type ConfirmedNotionRead = NotionPageRead & {
  confirmation?: NotionReadConfirmation;
};

/**
 * The `id :` and `BODY:` lines a Q84 deep read writes into its own header.
 *
 * Returns null when the text carries no page id — a file that cannot name what it is a read OF is
 * not a read, and inventing an id from the filename is how the wrong body gets attached to a
 * meeting. The header format is Q84's; it is parsed, not assumed, so a change there degrades to
 * "no read found" rather than to a silent mis-join.
 */
export function parseDeepReadHeader(path: string, text: string): NotionPageRead | null {
  const id = /^id\s*:\s*([0-9a-f-]{32,36})\s*$/m.exec(text)?.[1];
  if (!id) return null;

  const body = /^BODY:\s*(\d+)\s+blocks,\s*(\d+)\s+chars/m.exec(text);
  return {
    pageId: id,
    path,
    blocks: body ? Number(body[1]) : undefined,
    chars: body ? Number(body[2]) : undefined,
  };
}

/**
 * Reads + rulings → one lookup by page id.
 *
 * A confirmation whose page id has no read on disk is DROPPED, deliberately: a ruling on a file
 * nobody can open is an assertion, and this module only carries claims a reader can check. The
 * caller is told how many were dropped so the discard is never silent.
 */
export function indexNotionReads(
  reads: NotionPageRead[],
  confirmations: NotionReadConfirmation[] = [],
): { byPageId: Map<string, ConfirmedNotionRead>; orphanedConfirmations: NotionReadConfirmation[] } {
  const byPageId = new Map<string, ConfirmedNotionRead>();
  for (const r of reads) byPageId.set(r.pageId, { ...r });

  const orphanedConfirmations: NotionReadConfirmation[] = [];
  for (const c of confirmations) {
    const read = byPageId.get(c.pageId);
    if (!read) {
      orphanedConfirmations.push(c);
      continue;
    }
    read.confirmation = c;
  }

  return { byPageId, orphanedConfirmations };
}

/**
 * Q86 inc.12 — WHERE A RULING LANDS, and the answer for both of the two we have is NOWHERE.
 *
 * inc.9–11 built the ladder that turns a Notion page body into coverage: located → pulled to disk →
 * read end to end → RULED `transcript`. Two rows have climbed all of it. Neither moved a single
 * number on the board, and this is why: `fromNotion` sets `hasTranscript: true` on the SOURCE
 * RECORD, but a coverage row is a CALENDAR MEETING, and a source record only reaches one by being
 * linked. Both ruled rows are in `unclaimed` — `will-devito` (2025-12-20) fell outside the window
 * that was read, and `gulfcoast-ai-alex-one` sits on 2026-06-16 where the only calendar event is a
 * different meeting entirely. So the most expensive artefact this repo produces — a human reading
 * 44,547 characters end to end — currently changes 0 of 29 rows, and says so nowhere.
 *
 * THIS FUNCTION DOES NOT WELD THE LINK. That is the whole point of it. The link a ruling wants is
 * exactly the link `day-and-title` already declined to make, and making it *because* a body was
 * read would be the false-coverage failure inverted: the reading proves what the page CONTAINS, and
 * proves nothing at all about WHICH calendar event it is of. Attaching Alex's Gulf Coast call to
 * "Caleb, Rob, Will | CGRoofingGroup.com" because they share a Tuesday would put a real transcript
 * under the wrong company — worse than leaving the row owed, because it looks finished.
 *
 * What it does instead is make the gap TYPED and LOUD. A ruled-but-unattached transcript is not the
 * same finding as a 26-byte stub, and today they print at the same volume in the same 54-row list.
 * Each one comes back with the placement that explains it and the ONE action that would close it —
 * widen the window, rule the day, or accept the call was never on the calendar.
 *
 * PURE per CR-3: handed already-computed rows and unclaimed records; no fs, no network, no clock.
 */

/** Where a ruling sits relative to the calendar — mirrors `UnclaimedPlacement`, kept structural. */
export type RulingPlacement =
  | "linked"
  | "undated"
  | "unknown-window"
  | "outside-window"
  | "in-window-day-empty"
  | "in-window-day-busy"
  | "not-in-spine";

/** One ruling, and what the calendar did with it. */
export type RulingAttachment = {
  pageId: string;
  title: string;
  verdict: NotionReadVerdict;
  placement: RulingPlacement;
  /** The meeting that claims it, when one does. */
  meeting?: { meetingId: string; title: string; day: string };
  /** The day the ruled record states, when it states one. */
  day?: string;
  /** The single next action that would close this gap. Never "investigate". */
  action: string;
};

/** The shapes this needs off a `SpineReconciliation`, narrowed so the join is testable in isolation. */
type RowLike = {
  meetingId: string;
  title: string;
  day: string;
  links: { source: string; id: string }[];
};
type UnclaimedLike = {
  id: string;
  title: string;
  day?: string;
  placement: string;
  sameDayMeetings: { id: string; title: string }[];
};

/**
 * Rulings → where each one landed.
 *
 * `summary-only` and `empty` rulings are carried too, and are never findings: a page opened and
 * found to hold no speech is CLOSED work whether or not a calendar event claims it. Only a
 * `transcript` ruling that nothing links is coverage this repo earned and then dropped on the floor.
 */
export function rulingAttachments(
  confirmations: NotionReadConfirmation[],
  rows: RowLike[],
  unclaimed: UnclaimedLike[],
  titleOf: (pageId: string) => string,
): RulingAttachment[] {
  return confirmations.map((c) => {
    const title = titleOf(c.pageId);
    const row = rows.find((r) => r.links.some((l) => l.source === "notion" && l.id === c.pageId));
    if (row) {
      return {
        pageId: c.pageId,
        title,
        verdict: c.verdict,
        placement: "linked" as const,
        meeting: { meetingId: row.meetingId, title: row.title, day: row.day },
        day: row.day,
        action:
          c.verdict === "transcript"
            ? `nothing owed — this ruling is counted on "${row.title}" (${row.day}).`
            : `nothing owed — read and ruled "${c.verdict}"; it is settled, not coverage.`,
      };
    }

    const u = unclaimed.find((x) => x.id === c.pageId);
    if (!u) {
      return {
        pageId: c.pageId,
        title,
        verdict: c.verdict,
        placement: "not-in-spine" as const,
        action:
          `this ruling names a page the spine never saw — neither linked to a meeting nor reported ` +
          `unclaimed. Check the page id against the snapshot; a ruling on a row nobody harvested ` +
          `cannot become coverage no matter what the body holds.`,
      };
    }

    const placement = u.placement as RulingPlacement;
    const settled = c.verdict !== "transcript";
    const action = settled
      ? `nothing owed — read and ruled "${c.verdict}"; it is settled, not coverage, so no calendar link is needed.`
      : placement === "outside-window"
        ? `WIDEN THE WINDOW past ${u.day ?? "its day"} and re-run — the ruling is good, the calendar read never reached the day it belongs to.`
        : placement === "in-window-day-empty"
          ? `the calendar holds NO event on ${u.day} — this call was never on the calendar we read. It needs a calendar entry, or an explicit note that it never had one; the transcript is not in doubt, its place on the board is.`
          : placement === "in-window-day-busy"
            ? `A HUMAN RULES which ${u.day} event this is — the spine will not guess: ${u.sameDayMeetings.map((m) => `"${m.title}"`).join(" · ") || "(none named)"}. Reading the body proved what it CONTAINS, never which event it is OF.`
            : `the ruled record states no day the spine can place, so nothing can attach it. Give the row a date before the ruling can count.`;

    return {
      pageId: c.pageId,
      title,
      verdict: c.verdict,
      placement,
      day: u.day,
      action,
    };
  });
}

/**
 * The subset that is a FINDING: a body someone read end to end and ruled a transcript, which no
 * calendar meeting claims. Separated from the full list because the full list is mostly good news.
 */
export function strandedTranscriptRulings(attachments: RulingAttachment[]): RulingAttachment[] {
  return attachments.filter((a) => a.verdict === "transcript" && a.placement !== "linked");
}
