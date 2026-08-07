/**
 * What a Notion `transcription` block SAYS about itself.
 *
 * Q84 inc.49 handed 18 rows to a human with the reason *"the uncapped re-read ran and the API
 * returned a [transcription] wrapper with no text under it — the reader is exhausted, the page
 * is not; open it in Notion rather than calling it empty."* That was the right call on the
 * evidence available, and it was still an inference about the READER. Nobody had looked at the
 * transcription block's own JSON.
 *
 * It carries a `status`. Measured live against all 18 on 2026-08-07: **14
 * `transcription_not_started`, 4 `transcription_paused`, 0 completed.** Notion is not
 * withholding text from the API — it is stating that no transcript was ever produced. A human
 * opening those pages in a browser would find the same nothing, 18 times.
 *
 * This module is the ladder for that field and nothing else: pure, no clock, no network, no fs
 * (CR-3). It reads a status string and returns what may be claimed from it.
 *
 * THE DIRECTION OF CAUTION IS FIXED AND DELIBERATE. Only a status this module RECOGNISES as
 * never-produced may retire a row's human read. An unknown status — a value Notion adds later,
 * a typo, a block shape we have not seen — returns `unknown`, which keeps the existing
 * open-in-notion disposition. A field is a claim, never a finding: this module lets Notion
 * assert an absence about its OWN transcript, and refuses to infer one from silence. That is
 * the whole Q84 lesson (`Call Recording` empty over a 114k-char body) applied in the one place
 * where the field is genuinely about the artifact rather than about a human filling a column.
 */

/** The dispositions this module is willing to state. */
export type TranscriptionDisposition =
  /** Notion says a transcript exists. The text is owed and the reader should get it. */
  | "transcript-exists"
  /** Notion says no transcript was ever produced. Opening the page cannot change that. */
  | "never-produced"
  /** Not a status we recognise — claim nothing, keep whatever disposition the row already had. */
  | "unknown";

/**
 * Statuses that assert no complete transcript exists.
 *
 * `transcription_paused` is included and the reasoning matters: a paused run MAY have written
 * partial text, so this is not "the block is empty" — it is "Notion did not finish producing a
 * transcript here." Every paused row in the 2026-08-07 measurement independently read 0 chars,
 * so the partial case is theoretical on today's data; the status is still reported verbatim by
 * `classifyTranscription` rather than collapsed, so a caller can tell the two apart.
 */
const NEVER_PRODUCED = new Set(["transcription_not_started", "transcription_paused"]);

/** Statuses that assert a transcript IS there to be read. */
const PRODUCED = new Set(["transcription_completed"]);

/** The verbatim status plus what may be claimed from it. The status is never dropped. */
export interface TranscriptionVerdict {
  /** Exactly what Notion returned, unmodified — including a value we do not recognise. */
  status: string | null;
  disposition: TranscriptionDisposition;
  /** Why, in the words that will be printed to Rob. */
  why: string;
}

/**
 * Classify one `transcription` block's status.
 *
 * `null`/`undefined` means we never saw a transcription block on that page — which is NOT the
 * same as a block reporting nothing, and is deliberately `unknown` rather than `never-produced`.
 */
export function classifyTranscription(status: string | null | undefined): TranscriptionVerdict {
  if (status == null || status === "") {
    return {
      status: status ?? null,
      disposition: "unknown",
      why: "no transcription block was found on this page, which says nothing either way about whether a transcript exists",
    };
  }
  if (NEVER_PRODUCED.has(status)) {
    return {
      status,
      disposition: "never-produced",
      why: `Notion reports this page's transcription as \`${status}\` — no transcript was ever produced, so opening the page in a browser returns the same nothing the API did`,
    };
  }
  if (PRODUCED.has(status)) {
    return {
      status,
      disposition: "transcript-exists",
      why: `Notion reports this page's transcription as \`${status}\` — a transcript exists and the reader has not recovered it`,
    };
  }
  return {
    status,
    disposition: "unknown",
    why: `\`${status}\` is not a transcription status this ladder recognises — claiming nothing and leaving the row's disposition unchanged`,
  };
}

/**
 * Read the status off a raw Notion block object, without asserting the block's shape.
 *
 * Returns `null` for anything that is not a transcription block carrying a string status, so a
 * shape change downgrades to `unknown` above rather than throwing or inventing a value.
 */
export function transcriptionStatusOf(block: unknown): string | null {
  if (typeof block !== "object" || block === null) return null;
  const b = block as Record<string, unknown>;
  if (b.type !== "transcription") return null;
  const payload = b.transcription;
  if (typeof payload !== "object" || payload === null) return null;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

/** The first transcription status on a page's block list, or `null` if there is none. */
export function pageTranscriptionStatus(blocks: readonly unknown[]): string | null {
  for (const b of blocks) {
    const s = transcriptionStatusOf(b);
    if (s !== null) return s;
  }
  return null;
}
