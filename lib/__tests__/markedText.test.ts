import { describe, expect, it } from "vitest";
import { markedPieces } from "@/lib/calls/markedText";

// BUILD-QUEUE Q68 (b) inc.26 — the cut that must not lose or duplicate a word.
//
// The invariant test (`rebuilds`) is applied to EVERY case, including the malformed ones:
// the failure this layer exists to prevent is a reconstruction that reads fine and is not
// what was said.

function rebuild(text: string, marks: Parameters<typeof markedPieces>[1]) {
  return markedPieces(text, marks)
    .map((p) => p.text)
    .join("");
}

const LINE = "we can do fifteen hundred, maybe fifteen fifty if you sign this week";

describe("markedPieces", () => {
  it("returns no pieces for empty text", () => {
    expect(markedPieces("", [{ start: 0, end: 2 }])).toEqual([]);
  });

  it("returns the whole text as one unmarked run when nothing matched", () => {
    expect(markedPieces(LINE, [])).toEqual([{ text: LINE, marked: false }]);
  });

  it("defaults to no marks when none are passed", () => {
    expect(markedPieces(LINE)).toEqual([{ text: LINE, marked: false }]);
  });

  it("cuts one hit into before / hit / after", () => {
    const start = LINE.indexOf("fifteen");
    const pieces = markedPieces(LINE, [{ start, end: start + 7 }]);
    expect(pieces).toEqual([
      { text: "we can do ", marked: false },
      { text: "fifteen", marked: true },
      { text: LINE.slice(start + 7), marked: false },
    ]);
  });

  it("prints the gap between two hits exactly once", () => {
    const a = LINE.indexOf("fifteen");
    const b = LINE.indexOf("fifteen", a + 1);
    const pieces = markedPieces(LINE, [
      { start: a, end: a + 7 },
      { start: b, end: b + 7 },
    ]);
    expect(pieces.filter((p) => p.marked).map((p) => p.text)).toEqual(["fifteen", "fifteen"]);
    expect(rebuild(LINE, [
      { start: a, end: a + 7 },
      { start: b, end: b + 7 },
    ])).toBe(LINE);
    // The duplicated-tail bug: the text between the hits must appear once, not twice.
    const between = LINE.slice(a + 7, b);
    expect(pieces.filter((p) => p.text === between)).toHaveLength(1);
  });

  it("marks a hit at the very start and at the very end without empty runs", () => {
    expect(markedPieces("abc", [{ start: 0, end: 3 }])).toEqual([{ text: "abc", marked: true }]);
    expect(markedPieces("abc", [{ start: 0, end: 1 }])).toEqual([
      { text: "a", marked: true },
      { text: "bc", marked: false },
    ]);
    expect(markedPieces("abc", [{ start: 2, end: 3 }])).toEqual([
      { text: "ab", marked: false },
      { text: "c", marked: true },
    ]);
  });

  it("never emits an empty piece", () => {
    const marks = [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 8 },
    ];
    for (const p of markedPieces(LINE, marks)) expect(p.text.length).toBeGreaterThan(0);
  });

  it("sorts an out-of-order list rather than refusing it", () => {
    const pieces = markedPieces("abcdef", [
      { start: 4, end: 5 },
      { start: 1, end: 2 },
    ]);
    expect(pieces).toEqual([
      { text: "a", marked: false },
      { text: "b", marked: true },
      { text: "cd", marked: false },
      { text: "e", marked: true },
      { text: "f", marked: false },
    ]);
  });

  it("drops an overlapping range instead of widening the highlight", () => {
    const marks = [
      { start: 1, end: 4 },
      { start: 2, end: 6 },
    ];
    const pieces = markedPieces("abcdefg", marks);
    expect(pieces.filter((p) => p.marked).map((p) => p.text)).toEqual(["bcd"]);
    expect(rebuild("abcdefg", marks)).toBe("abcdefg");
  });

  it("drops a range past the end of the text instead of clamping it", () => {
    const marks = [{ start: 3, end: 99 }];
    expect(markedPieces("abcdefg", marks)).toEqual([{ text: "abcdefg", marked: false }]);
    expect(rebuild("abcdefg", marks)).toBe("abcdefg");
  });

  it("drops negative, reversed, empty and non-integer ranges", () => {
    const bad = [
      { start: -1, end: 2 },
      { start: 4, end: 2 },
      { start: 3, end: 3 },
      { start: 1.5, end: 4 },
      { start: 1, end: Number.NaN },
    ];
    for (const m of bad) {
      expect(markedPieces("abcdefg", [m])).toEqual([{ text: "abcdefg", marked: false }]);
    }
  });

  it("rebuilds the original text byte-for-byte for every input, good or malformed", () => {
    const cases: Array<[string, Array<{ start: number; end: number }>]> = [
      [LINE, []],
      [LINE, [{ start: 0, end: LINE.length }]],
      [LINE, [{ start: 10, end: 17 }, { start: 34, end: 41 }]],
      [LINE, [{ start: 10, end: 17 }, { start: 12, end: 20 }]],
      [LINE, [{ start: 0, end: 5 }, { start: 5, end: 9 }]],
      [LINE, [{ start: -3, end: 4 }, { start: 60, end: 900 }]],
      ["  spaced  out  ", [{ start: 2, end: 8 }]],
      ["émoji ✅ text", [{ start: 0, end: 5 }]],
    ];
    for (const [text, marks] of cases) expect(rebuild(text, marks)).toBe(text);
  });

  it("leaves the words untouched — nothing is inserted around a mark", () => {
    const start = LINE.indexOf("fifteen");
    const pieces = markedPieces(LINE, [{ start, end: start + 7 }]);
    for (const p of pieces) {
      expect(p.text).not.toContain("*");
      expect(p.text).not.toContain("…");
    }
  });
});
