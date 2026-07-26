// BUILD-QUEUE Q68 (b) inc.23 — MOMENT SEARCH: finding the sentence, not the call.
//
// (b) argued for a segment-granular table over a text blob on exactly one promise: "segments
// are what enable moment search + playback sync". Twenty-two increments later the segments
// exist, they can be written, read, projected into turns and rendered — and nothing can find
// a phrase in them. The promise that shaped the schema was never collected.
//
// This is that collection, pure per CR-3: turns in, moments out. No DB, no clock, no network.
//
// FIVE RULES THAT ARE NOT OBVIOUS:
//
//  1. A NON-READY TRANSCRIPT IS `unsearchable`, NEVER "0 matches". A `pending` call that
//     answers "no matches for refund" tells a rep the customer never said it, when the truth
//     is nobody has looked yet. That is a false negative on evidence — the worst thing this
//     file could produce. `empty` is the exception and IS a real zero: the call finished and
//     nothing was said, so the phrase genuinely was not said (inc.9's wordless rule).
//
//  2. A MATCH NEVER SPANS TWO TURNS. Turn text is joined per speaker; a phrase assembled from
//     the tail of one speaker and the head of the next was never said by either of them, and
//     quoting it back is putting words in a person's mouth (inc.15's rule, one layer out).
//
//  3. NOTHING IS INSERTED INTO THE WORDS. No `**`, no `…`, no re-punctuation. Matches travel
//     as OFFSETS and snippets travel with `truncatedStart`/`truncatedEnd` flags, so the UI
//     decorates and the stored text stays byte-for-byte what the provider returned.
//
//  4. MATCHING IS EXACT, ONLY CASE AND WHITESPACE FOLDED. No stemming, no fuzz, no synonyms:
//     on a recorded call the near-miss is "fifteen" matching "fifty", and a rep acts on a
//     number the customer never said. Case and whitespace folding are safe because they
//     change no word — everything beyond that is a guess rendered as a quote.
//
//  5. MATCHES ARE NON-OVERLAPPING. "aa" in "aaaa" is 2 hits, not 3, so the count a rep is
//     shown is the count they can hear.

import type { TranscriptTurn } from "./transcriptView";
import type { TranscriptSegment } from "./transcriptSegments";
import type { TranscriptView } from "./transcriptView";

/** Characters of verbatim text kept either side of a hit. */
export const SNIPPET_PAD = 60;

/** One moment in a call. Everything needed to quote it and to seek to it. */
export type TranscriptMoment = {
  /** Position in `turns` — the turn this hit is inside. */
  turnIndex: number;
  speaker: string | null;
  label: string;
  /**
   * The SEGMENT the hit starts in — what a click seeks to.
   *
   * The segment, not the turn: a turn can be a minute of one speaker, and seeking to its
   * start makes a rep listen to fifty seconds of unrelated speech to reach the sentence.
   */
  idx: number;
  /** That segment's start. The player position for this moment. */
  startMs: number;
  /** Offsets into the TURN's text. The UI highlights with these; we never edit the text. */
  start: number;
  end: number;
  /** Verbatim window around the hit, cut from the turn's own text. */
  snippet: string;
  /** Where the hit sits inside `snippet`. */
  snippetStart: number;
  snippetEnd: number;
  /** The window was cut — the UI may show a leading/trailing ellipsis. We do not add one. */
  truncatedStart: boolean;
  truncatedEnd: boolean;
};

export type TranscriptSearchResult =
  /** No query. Not "everything matched" and not "nothing matched". */
  | { state: "idle"; matches: [] }
  /**
   * We cannot answer. `reason` is the view state that stopped us — `pending` means the words
   * are not back, `failed` means they never will be without a re-run.
   */
  | { state: "unsearchable"; reason: "pending" | "failed"; matches: [] }
  | { state: "results"; query: string; matches: TranscriptMoment[] };

/**
 * Fold text for matching, keeping a map back to the original offsets.
 *
 * Whitespace runs collapse to one space and the case is lowered, so a query typed flat
 * ("we can do") finds text that wrapped across a line or carried a double space. `map[k]` is
 * the index in the ORIGINAL string of folded character `k`, which is what keeps every offset
 * we return pointing at the real words.
 *
 * A character whose lowercase is not one character (Turkish dotted I, and friends) is kept
 * AS-IS rather than folded: folding it would shift every later offset by one and silently
 * mis-highlight the rest of the turn. Losing case-insensitivity on one rare character is a
 * missed hit; a shifted map is a wrong quote.
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    const lower = ch.toLowerCase();
    out.push(lower.length === 1 ? lower : ch);
    map.push(i);
  }

  return { folded: out.join(""), map };
}

/** The query, folded the same way the text is. Empty when there is nothing to look for. */
export function foldQuery(query: string): string {
  return foldWithMap(query).folded;
}

/**
 * Where each of a turn's segments sits inside the turn's text.
 *
 * Reconstructed from the SAME rule `transcriptTurns` used to build the text (trimmed segment
 * texts joined with one space). A test pins that the reconstruction equals `turn.text`, so a
 * change to the join in `transcriptView` fails here loudly instead of quietly seeking to the
 * wrong sentence.
 */
export function segmentSpans(
  turn: TranscriptTurn,
  byIdx: ReadonlyMap<number, TranscriptSegment>
): { idx: number; startMs: number; from: number; to: number }[] {
  const spans: { idx: number; startMs: number; from: number; to: number }[] = [];
  let pos = 0;
  for (const idx of turn.idx) {
    const seg = byIdx.get(idx);
    const text = (seg?.text ?? "").trim();
    spans.push({ idx, startMs: seg?.startMs ?? turn.startMs, from: pos, to: pos + text.length });
    pos += text.length + 1; // the single joining space
  }
  return spans;
}

/** The segment a turn-offset falls in — the last one that starts at or before it. */
function segmentAt(
  spans: readonly { idx: number; startMs: number; from: number; to: number }[],
  offset: number
): { idx: number; startMs: number } | null {
  let hit: { idx: number; startMs: number } | null = null;
  for (const span of spans) {
    if (span.from > offset) break;
    hit = { idx: span.idx, startMs: span.startMs };
  }
  return hit;
}

/** A verbatim window around a hit, plus where the hit is inside it. */
function snippetFor(
  text: string,
  start: number,
  end: number,
  pad: number
): Pick<
  TranscriptMoment,
  "snippet" | "snippetStart" | "snippetEnd" | "truncatedStart" | "truncatedEnd"
> {
  const from = Math.max(0, start - pad);
  const to = Math.min(text.length, end + pad);
  return {
    snippet: text.slice(from, to),
    snippetStart: start - from,
    snippetEnd: end - from,
    truncatedStart: from > 0,
    truncatedEnd: to < text.length,
  };
}

/**
 * Every moment a phrase was said, in call order.
 *
 * `turns` and `segments` come from the same load: turns carry the text and the speaker,
 * segments carry the seek target. Order is turn order, which is `idx` order, which is the
 * order the call happened — never relevance. A "best match" ranking on a call recording
 * reorders a conversation, and the second time something is said is usually the time that
 * matters.
 */
export function searchTurns(
  turns: readonly TranscriptTurn[],
  segments: readonly TranscriptSegment[],
  query: string,
  pad = SNIPPET_PAD
): TranscriptMoment[] {
  const needle = foldQuery(query);
  if (!needle) return [];

  const byIdx = new Map(segments.map((s) => [s.idx, s]));
  const moments: TranscriptMoment[] = [];

  turns.forEach((turn, turnIndex) => {
    const { folded, map } = foldWithMap(turn.text);
    const spans = segmentSpans(turn, byIdx);

    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      // Folded offsets are useless to a reader; map both ends back to the real text. `end` is
      // the character AFTER the last matched one, hence `map[...] + 1`.
      const start = map[at];
      const end = map[at + needle.length - 1] + 1;
      const seg = segmentAt(spans, start);
      moments.push({
        turnIndex,
        speaker: turn.speaker,
        label: turn.label,
        idx: seg?.idx ?? turn.idx[0],
        startMs: seg?.startMs ?? turn.startMs,
        start,
        end,
        ...snippetFor(turn.text, start, end, pad),
      });
      from = at + needle.length; // non-overlapping: see rule 5
    }
  });

  return moments;
}

/**
 * Search a whole transcript view.
 *
 * The state gate lives here rather than in the caller because it is the rule most easily
 * forgotten at a call site, and forgetting it produces the one output this file must never
 * produce: a confident "not said" about a call nobody has transcribed.
 */
export function searchTranscript(
  view: TranscriptView,
  segments: readonly TranscriptSegment[],
  query: string,
  pad = SNIPPET_PAD
): TranscriptSearchResult {
  const needle = foldQuery(query);
  if (!needle) return { state: "idle", matches: [] };
  if (view.state === "pending" || view.state === "failed") {
    return { state: "unsearchable", reason: view.state, matches: [] };
  }
  // `empty` falls through on purpose — a finished, wordless call is a true zero.
  return {
    state: "results",
    query: needle,
    matches: searchTurns(view.turns, segments, query, pad),
  };
}
