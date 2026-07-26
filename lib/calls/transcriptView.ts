// BUILD-QUEUE Q68 (b) inc.15 — THE TRANSCRIPT READ SEAM.
//
// 0021 stores a call SEGMENT-GRANULAR on purpose: segments are what make moment search and
// playback sync possible (that was (b)'s whole argument against a text blob). Fourteen
// increments later every path into that table is a WRITE. Nothing in the system can read a
// stored transcript back — not the timeline, not an API route, not a test. The words are in
// Postgres and no human can reach them.
//
// This is the projection that turns stored rows into something a reader can be shown, kept
// pure per CR-3: it takes rows as they come out of 0021 and returns turns. No network, no
// clock, no DB — the DB read and the route sit on top of it and are ahead.

import type { TranscriptSegment, TranscriptStatus } from "./transcriptSegments";

/**
 * A run of consecutive segments from one speaker.
 *
 * Turns exist because nobody reads a call as 400 one-line utterances, and because a
 * highlight that follows playback needs a span, not a word.
 */
export type TranscriptTurn = {
  /** The provider's speaker key verbatim ("0", "1", …), or null when it labelled none. */
  speaker: string | null;
  /** "Speaker 1", numbered by order of first appearance. Never "Rep"/"Customer" — see below. */
  label: string;
  startMs: number;
  endMs: number;
  /** The segments' text joined with a single space, verbatim — never re-punctuated. */
  text: string;
  /** The indexes this turn covers, so a click on a turn can seek to a segment. */
  idx: number[];
  /**
   * The WEAKEST confidence in the turn, or null if any segment carried none.
   *
   * Deliberately not an average: an average is a number no provider produced, and it hides
   * the one mangled word that changes what the sentence means. Null when coverage is
   * partial, because an average over the segments that happen to have a score misrepresents
   * how much of the turn was measured at all.
   */
  minConfidence: number | null;
};

/**
 * What a reader gets for a call.
 *
 * `state` is four distinct answers, never collapsed, because they are four different things
 * to say to a rep — and inc.12 already pays for the distinction upstream (`transcript
 * failed` vs `no segments` is the only trace of why a call has no summary; collapsing it
 * here would throw that away at the last layer, exactly the mistake inc.14 fixed for
 * summaries):
 *   ready     — words to show.
 *   pending   — transcription has not finished. Not "no words".
 *   failed    — it ran and did not produce a transcript.
 *   empty     — it FINISHED and there was nothing said. A silent call is a real outcome
 *               (inc.9's wordless rule) and must not read as a system failure.
 */
export type TranscriptView = {
  state: "ready" | "pending" | "failed" | "empty";
  turns: TranscriptTurn[];
  /** Distinct speakers the provider separated. 0 when it diarised nothing. */
  speakerCount: number;
  /** End of the last turn — what a player can scrub to. null when there are no turns. */
  endMs: number | null;
};

/** A segment key that keeps "no speaker" distinct from a speaker literally named "". */
function speakerKey(seg: TranscriptSegment): string | null {
  const s = seg.speaker?.trim();
  return s ? s : null;
}

/**
 * Turns, in stored order.
 *
 * Ordering is `idx` ASCENDING and nothing else. `normalizeSegments` already assigned idx
 * from time order at write time; re-sorting by `startMs` here would let the reading order
 * disagree with the index a click seeks to, on exactly the overlapping-timestamp payloads
 * that made idx authoritative in the first place.
 *
 * A turn breaks on SPEAKER CHANGE ONLY. The textbook extra rule — split after N seconds of
 * silence — is refused: any threshold picked here is a boundary the call did not have, and
 * a rep reading two turns believes the speaker stopped and started. The timestamps are on
 * the turn; a gap remains visible without inventing a break.
 *
 * An unlabelled segment never merges into a labelled neighbour: attributing a word to a
 * speaker the provider did not attribute it to is putting words in a person's mouth.
 */
export function transcriptTurns(segments: readonly TranscriptSegment[]): TranscriptTurn[] {
  const ordered = [...segments].sort((a, b) => a.idx - b.idx);
  const turns: TranscriptTurn[] = [];
  // Speaker labels are numbered by first appearance and are NEVER role names. Deepgram
  // diarisation returns anonymous channels; "Rep"/"Customer" would be a guess rendered as
  // a fact, and on a recorded call that guess is quoted back to a customer.
  const labels = new Map<string, number>();

  for (const seg of ordered) {
    const key = speakerKey(seg);
    const text = seg.text.trim();
    if (!text) continue; // 0021 refuses empty text; a stray one adds a blank line, not a turn.

    const prev = turns[turns.length - 1];
    if (prev && prev.speaker === key) {
      prev.text = `${prev.text} ${text}`;
      // MAX, not last-segment end: segments may overlap or nest, and a turn whose end went
      // backwards would break every scrub that trusts it.
      prev.endMs = Math.max(prev.endMs, seg.endMs);
      prev.idx.push(seg.idx);
      prev.minConfidence =
        seg.confidence === undefined || prev.minConfidence === null
          ? null
          : Math.min(prev.minConfidence, seg.confidence);
      continue;
    }

    if (key !== null && !labels.has(key)) labels.set(key, labels.size + 1);
    turns.push({
      speaker: key,
      label: key !== null ? `Speaker ${labels.get(key)}` : "Speaker",
      startMs: seg.startMs,
      endMs: seg.endMs,
      text,
      idx: [seg.idx],
      minConfidence: seg.confidence ?? null,
    });
  }

  return turns;
}

/**
 * The whole reader-facing view of a stored transcript.
 *
 * `status` comes from the transcript row and OUTRANKS the segments: a `pending` row that
 * somehow carries segments is still not finished, and showing its partial words as a
 * transcript is how a rep quotes half a call back to a customer.
 */
export function transcriptView(
  status: TranscriptStatus,
  segments: readonly TranscriptSegment[]
): TranscriptView {
  if (status === "pending") return { state: "pending", turns: [], speakerCount: 0, endMs: null };
  if (status === "failed") return { state: "failed", turns: [], speakerCount: 0, endMs: null };

  const turns = transcriptTurns(segments);
  const speakers = new Set(turns.map((t) => t.speaker).filter((s): s is string => s !== null));
  return {
    state: turns.length ? "ready" : "empty",
    turns,
    speakerCount: speakers.size,
    endMs: turns.length ? Math.max(...turns.map((t) => t.endMs)) : null,
  };
}

/** "0:07" — the seek label for a turn. Same shape as the timeline's durations. */
export function timecode(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
