// BUILD-QUEUE Q68 (b) inc.26 — THE CUT: offsets become the pieces a component prints.
//
// inc.25 decided WHERE the highlights go; this is the one operation left between those
// offsets and the DOM, and it is the operation that loses words. A component that renders
// `text.slice(0, m.start)` + `<mark>` + `text.slice(m.end)` per mark is correct for exactly
// one mark and silently WRONG for two: the tail of the first is re-printed by the second, so
// the rep reads a sentence the customer never said — assembled entirely out of words they
// did say, which is why nobody catches it by eye.
//
// So the cut happens here, once, pure (CR-3), with one invariant standing over all of it:
//
//   THE PIECES CONCATENATE BACK TO THE ORIGINAL TEXT, EXACTLY, ALWAYS.
//
// That single property is the whole defence. Every failure mode of this layer — a duplicated
// tail, a swallowed gap, a clamped range, an off-by-one — shows up as a reconstruction that
// is not byte-for-byte the stored turn, and it is pinned for the malformed inputs too, not
// just the good ones. It is the same promise inc.17 made at the store and inc.23 made at the
// matcher: nothing is inserted into the words, nothing is taken out of them.
//
// TWO REFUSALS THAT LOOK LIKE PARANOIA AND ARE NOT:
//
//  1. A MARK THAT DOES NOT FIT IS DROPPED, NOT CLAMPED. `searchPanel` already refuses these,
//     so a bad range reaching here means the two layers disagree about which text is on
//     screen. Clamping would resolve that disagreement by marking whatever characters happen
//     to sit at the boundary — attributing a phrase to a speaker who did not say it (inc.25
//     rule 2). Dropping keeps the words honest and loses only a highlight.
//
//  2. AN OVERLAP IS DROPPED, NOT MERGED. Merging widens a highlight past any hit the matcher
//     actually made. Marks arrive ordered and disjoint from `searchPanel`; this re-establishes
//     it because this is the layer where the damage would be printed.
//
// A caller may hand us an unsorted list — sorting is free and a wrong ORDER is not a wrong
// ANSWER, unlike the two cases above.

import type { MomentMark } from "./searchPanel";

/** One run of a turn's text, either inside a match or between matches. */
export type TextPiece = { text: string; marked: boolean };

/**
 * A turn's text + the spans to highlight → the runs to print, in order.
 *
 * Guarantees, for ANY input:
 *   • `pieces.map(p => p.text).join("") === text`
 *   • no piece is empty (an empty `<mark>` is an invisible element with a real caret)
 *   • marked runs never touch each other (they are separated by at least one unmarked run)
 *
 * Empty text yields no pieces at all rather than one empty run.
 */
export function markedPieces(text: string, marks: readonly MomentMark[] = []): TextPiece[] {
  if (!text) return [];

  const usable = [...marks]
    .filter(
      (m) =>
        Number.isInteger(m.start) &&
        Number.isInteger(m.end) &&
        m.start >= 0 &&
        m.end <= text.length &&
        m.end > m.start
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const pieces: TextPiece[] = [];
  let cursor = 0;
  for (const m of usable) {
    // Refusal 2: this range began inside the previous highlight.
    if (m.start < cursor) continue;
    if (m.start > cursor) pieces.push({ text: text.slice(cursor, m.start), marked: false });
    pieces.push({ text: text.slice(m.start, m.end), marked: true });
    cursor = m.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), marked: false });
  return pieces;
}
