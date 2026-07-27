// BUILD-QUEUE Q68 (b) inc.25 — WHAT A SEARCH LOOKS LIKE TO A READER.
//
// inc.23 found the moments and inc.24 gave them a door; between that door and a rep there is
// still nothing. A moment off the wire is offsets — `{turnIndex, start, end}` — and offsets
// are the one payload a component must not be handed raw: the obvious render is
// `text.slice(m.start, m.end)`, and every way that can be wrong (a moment for a turn that is
// not on screen, a range past the end of the text, two ranges over the same characters) fails
// SILENTLY, marking the wrong words or duplicating them. So the placement decision lives here,
// pure and tested (CR-3), and the component ahead paints spans it is given.
//
// FIVE RULES THAT ARE NOT OBVIOUS:
//
//  1. `unsearchable` NEVER RENDERS AS A ZERO. inc.23's first rule survives the last hop or it
//     did not exist: "no moments" about a call nobody transcribed tells a rep the customer
//     never said it. The two states get different sentences, and only one of them mentions
//     the phrase not being said.
//
//  2. A MOMENT THAT CANNOT BE PLACED IS DROPPED AND COUNTED, NEVER CLAMPED. Offsets come off
//     a response that describes ONE load of the transcript; a re-render against different
//     turns can hand us a `turnIndex` that no longer exists or a range past the end of the
//     text. Clamping marks characters nobody matched — attributing a phrase to a speaker who
//     did not say it. Dropping loses a hit, which is visible in the count; the count is what
//     keeps a silent loss from reading as a complete answer.
//
//  3. MARKS ARE NON-OVERLAPPING, IN TEXT ORDER, PER TURN. The UI slices the turn text on
//     these boundaries; two ranges over the same characters would render those words twice.
//     inc.23 guarantees this per query, and we re-establish it here anyway because this is
//     the layer that would show the damage.
//
//  4. THE HEADLINE COUNTS WHAT IS ON SCREEN. A header saying 3 while 2 marks survived rule 2
//     is the same lie one layer up. `moments` and `headline` are built from the same
//     post-placement list.
//
//  5. THE PHRASE IS THE REP'S OWN TEXT, NOT THE CALL'S. Echoing the query back is safe and
//     is how a rep knows what was actually searched (it is the FOLDED query — what the
//     matcher looked for); the snippets around it are customer speech and stay verbatim,
//     un-decorated, exactly as inc.23 returned them.

import type { TranscriptMoment, TranscriptSearchResult } from "./transcriptSearch";
import type { PanelTurn } from "./transcriptPanel";
import { timecode } from "./transcriptView";

/** A span of a turn's text the UI should mark. Offsets into `PanelTurn.text`. */
export type MomentMark = { start: number; end: number };

/** One moment as a reader meets it: a place to jump to and a verbatim window to read. */
export type PanelMoment = {
  /** The `PanelTurn.key` this hit is inside — what the UI scrolls to. Never an array index. */
  turnKey: number;
  /** The SEGMENT to seek the player to (inc.23 rule: the sentence, not the whole turn). */
  idx: number;
  /** "0:07", or null when the span was unusable. A moment is never faked a time. */
  time: string | null;
  /**
   * The raw offset the label was formatted from — what a player is seeked to (inc.32).
   *
   * Carried alongside `time` rather than parsed back out of it: "0:07" has already lost the
   * sub-second the segment actually starts at, and re-deriving a physical seek position from a
   * display string is how a jump lands a second off the sentence the rep clicked.
   */
  startMs: number;
  label: string;
  /** Verbatim window around the hit. Nothing inserted — see rule 5. */
  snippet: string;
  snippetStart: number;
  snippetEnd: number;
  /** The window was cut. The UI may show an ellipsis; we do not put one in the words. */
  truncatedStart: boolean;
  truncatedEnd: boolean;
};

export type SearchPanel = {
  /**
   * `results` — we looked and these are the hits (possibly none).
   * `unsearchable` — we could not look, and that is NOT a zero (rule 1).
   * `unreadable` — the answer did not parse. Also not a zero.
   */
  state: "results" | "unsearchable" | "unreadable";
  /** The one line shown above the transcript. Always present — a search always answers. */
  headline: string;
  moments: PanelMoment[];
  /** `PanelTurn.key` → the spans to mark in that turn, in text order, non-overlapping. */
  marks: Record<number, MomentMark[]>;
  /**
   * Hits that referred to text this panel is not showing (rule 2). Zero in every normal case;
   * non-zero is a real defect signal and is said out loud in the headline.
   */
  unplaced: number;
};

function phrase(count: number): string {
  return count === 1 ? "1 moment" : `${count} moments`;
}

/**
 * Place one wire moment on a rendered turn, or refuse it.
 *
 * Refusals: no such turn on screen, a range outside the turn's text, or an empty/reversed
 * range. Each of these would mark characters the matcher never saw.
 */
function place(m: TranscriptMoment, turns: readonly PanelTurn[]): PanelMoment | null {
  const turn = turns[m.turnIndex];
  if (!turn) return null;
  if (!Number.isInteger(m.start) || !Number.isInteger(m.end)) return null;
  if (m.start < 0 || m.end > turn.text.length || m.end <= m.start) return null;
  return {
    turnKey: turn.key,
    idx: m.idx,
    time: timecode(m.startMs),
    startMs: m.startMs,
    label: m.label,
    snippet: m.snippet,
    snippetStart: m.snippetStart,
    snippetEnd: m.snippetEnd,
    truncatedStart: m.truncatedStart,
    truncatedEnd: m.truncatedEnd,
  };
}

/**
 * Marks for one turn, ordered and non-overlapping (rule 3).
 *
 * A range that starts before the previous one ended is dropped rather than merged: merging
 * would widen the highlight past a hit the matcher actually made, and this only happens when
 * something upstream is already wrong.
 */
function marksFor(ranges: readonly MomentMark[]): MomentMark[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: MomentMark[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start < last.end) continue;
    out.push(r);
  }
  return out;
}

const UNSEARCHABLE: Record<"pending" | "failed", string> = {
  // Not "not said": nobody has looked. The distinction is the whole reason inc.23 has a
  // separate state for it.
  pending: "Nothing to search yet — this call has not been transcribed",
  // States the fact and stops; the cause is a log line (inc.14 / inc.18's rule).
  failed: "Nothing to search — this call could not be transcribed",
};

/**
 * A search result + the turns being rendered → what the reader is shown.
 *
 * Returns `null` for `idle` — a query nobody asked has no panel at all, the same absence
 * inc.24 keeps out of the response body. A component that renders "0 results" for an
 * un-asked question is the shape both layers exist to prevent.
 */
export function searchPanel(
  result: TranscriptSearchResult,
  turns: readonly PanelTurn[]
): SearchPanel | null {
  if (result.state === "idle") return null;
  if (result.state === "unsearchable") {
    return {
      state: "unsearchable",
      headline: UNSEARCHABLE[result.reason],
      moments: [],
      marks: {},
      unplaced: 0,
    };
  }

  const moments: PanelMoment[] = [];
  const ranges = new Map<number, MomentMark[]>();
  let unplaced = 0;

  for (const m of result.matches) {
    const placed = place(m, turns);
    if (!placed) {
      unplaced += 1;
      continue;
    }
    moments.push(placed);
    const list = ranges.get(placed.turnKey) ?? [];
    list.push({ start: m.start, end: m.end });
    ranges.set(placed.turnKey, list);
  }

  const marks: Record<number, MomentMark[]> = {};
  for (const [key, list] of ranges) marks[key] = marksFor(list);

  // Rule 4: the count is of what survived placement, and a loss is stated, not hidden.
  const found = moments.length
    ? `${phrase(moments.length)} matching “${result.query}”`
    : `No moments — “${result.query}” was not said on this call`;

  return {
    state: "results",
    headline: unplaced ? `${found} · ${unplaced} could not be shown` : found,
    moments,
    marks,
    unplaced,
  };
}

/**
 * The panel for a `search` section that did not parse.
 *
 * Deliberately NOT a zero and NOT `unsearchable` (which is a claim about the CALL): this says
 * only that the answer was unreadable, so nothing about the customer's words is implied.
 */
export function searchPanelUnreadable(): SearchPanel {
  return {
    state: "unreadable",
    headline: "Search result could not be read",
    moments: [],
    marks: {},
    unplaced: 0,
  };
}

// ── the wire boundary ─────────────────────────────────────────────────────────────────────
//
// Same reasoning as inc.19's `transcriptPanelFromResponse`: what the component holds is
// `await res.json()`, typed by whatever answered. A cast would turn every rule above into a
// comment. All-or-nothing again — a partly-parsed match list UNDER-COUNTS, and "1 moment"
// when the customer said it three times sends a rep away believing they have heard them all.

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function wireMoment(raw: unknown): TranscriptMoment | null {
  const m = obj(raw);
  if (!m) return null;
  const nums = ["turnIndex", "idx", "startMs", "start", "end", "snippetStart", "snippetEnd"];
  for (const k of nums) if (typeof m[k] !== "number") return null;
  if (typeof m.label !== "string" || typeof m.snippet !== "string") return null;
  if (m.speaker !== null && typeof m.speaker !== "string") return null;
  if (typeof m.truncatedStart !== "boolean" || typeof m.truncatedEnd !== "boolean") return null;
  return m as unknown as TranscriptMoment;
}

/**
 * The `search` section of a transcript response → a panel, or `null` when there is none.
 *
 * `null` means the body carried no search — the caller did not ask (inc.24 rule 1). An
 * unparseable section is `unreadable`, which is a different thing from an absent one and is
 * shown.
 */
export function searchPanelFromBody(body: unknown, turns: readonly PanelTurn[]): SearchPanel | null {
  const section = obj(obj(body)?.search);
  if (!section) return obj(body)?.search === undefined ? null : searchPanelUnreadable();

  if (section.state === "unsearchable") {
    const reason = section.reason;
    if (reason !== "pending" && reason !== "failed") return searchPanelUnreadable();
    return searchPanel({ state: "unsearchable", reason, matches: [] }, turns);
  }
  if (section.state === "results") {
    if (typeof section.query !== "string" || !Array.isArray(section.matches)) {
      return searchPanelUnreadable();
    }
    const matches = section.matches.map(wireMoment);
    if (matches.some((m) => m === null)) return searchPanelUnreadable();
    return searchPanel(
      { state: "results", query: section.query, matches: matches as TranscriptMoment[] },
      turns
    );
  }
  // `idle` should never reach a body (the route omits the key), and any other state is not
  // one we know. Both are answered as unreadable rather than as a zero.
  return searchPanelUnreadable();
}
