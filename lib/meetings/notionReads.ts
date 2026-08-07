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
