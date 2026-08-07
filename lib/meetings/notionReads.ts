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
 * `[paragraph]` blocks ⇒ transcript, mostly `[bulleted_list_item]` ⇒ summary". It was measured
 * against the real corpus this increment and it does not hold: the read that provably contains
 * verbatim speech (`2025-12-20-will-devito`, 49 blocks) is 34 bullets and 9 paragraphs, while a
 * pure AI summary (`2026-06-16-gulfcoast-ai-alex-one`) is 228 paragraphs. A speaker-prefix regex
 * scores the transcript at 2 lines and every other file at 0. Guessing from shape here would call
 * summaries transcripts and transcripts summaries — the exact false-coverage failure Q86 exists to
 * kill. Someone has to open the file. When they do, the ruling is written down with the evidence,
 * once, and never has to be re-derived.
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
