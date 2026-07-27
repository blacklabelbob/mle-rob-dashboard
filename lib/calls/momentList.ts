// BUILD-QUEUE Q68 (b) inc.27 — THE MOMENTS BECOME PLACES YOU CAN GO.
//
// inc.25 built `PanelMoment[]` and inc.26 put the highlights in the words — and then nothing
// rendered the moments themselves. On a two-minute call that is a cosmetic gap. On a
// forty-minute call it is the whole feature: the rep is told "3 moments matching pricing",
// the marks are somewhere below the fold, and the only way to reach them is to read the call
// they searched precisely so they would not have to.
//
// This is the row model for that list, pure (CR-3). The component ahead prints rows and
// scrolls to a turn; it decides nothing.
//
// FOUR RULES THAT ARE NOT COSMETIC:
//
//  1. THE ELLIPSIS IS NOT IN THE WORDS. `snippet` is verbatim customer speech (inc.23 rule,
//     re-stated by inc.25 rule 5). A window that was cut is marked by an adornment the UI
//     prints BESIDE the text — `leadEllipsis` / `trailEllipsis` — never by "…" + snippet,
//     because the moment a character is prepended, the string a rep might copy into an email
//     is no longer what the customer said, and nothing downstream can tell the difference.
//
//  2. A MOMENT WITH NO TIME IS NOT A MOMENT AT 0:00. `time` is null when the span was
//     unusable (inc.25). "0:00" is a specific, checkable claim about when a thing was said;
//     rendering it for "we do not know" invites a rep to seek there and hear something else.
//     The row carries null and the label says only where, not when.
//
//  3. EVERY ROW IS UNIQUELY KEYED, AND THE KEY IS NOT AN ARRAY POSITION. The same phrase said
//     twice inside one segment produces two rows with the same `turnKey` AND the same `idx`;
//     keyed on those they collide, and React reuses one row's DOM for the other — the classic
//     way a list of five moments renders as three. Position breaks every remaining tie, and
//     uniqueness is asserted rather than assumed.
//
//  4. THE JUMP LABEL NAMES THE DESTINATION, NOT THE ACTION. A screen reader announcing
//     "jump, jump, jump" down a list of moments has told the listener nothing. Each label
//     carries the time and the speaker — the two things that distinguish one row from the
//     next.

import { momentSeekSeconds } from "./playbackSeek";
import type { PanelMoment } from "./searchPanel";

/** One moment as a row in the jump list. Everything the UI needs; nothing it must derive. */
export type MomentRow = {
  /** React key. Stable across re-renders, unique within a list (rule 3). */
  key: string;
  /** The `PanelTurn.key` to scroll to. Never an array index (inc.25). */
  turnKey: number;
  /** The SEGMENT to seek a player to, once there is one (inc.23: the sentence, not the turn). */
  idx: number;
  /** "0:07", or null when this moment has no known time (rule 2). */
  time: string | null;
  /**
   * Where to seek a player, in seconds, or null when this moment has no usable time (inc.32).
   *
   * Null and `time === null` are the SAME condition by construction — both come off `startMs`
   * through the same gate — so a row can never print a time it will not seek to, or seek to a
   * time it did not print.
   */
  seekSeconds: number | null;
  label: string;
  /** Verbatim. Nothing added, nothing removed (rule 1). */
  snippet: string;
  leadEllipsis: boolean;
  trailEllipsis: boolean;
  /** Accessible name for the control that jumps here (rule 4). */
  jumpLabel: string;
};

/**
 * `PanelMoment[]` → the rows to print, in the order the moments were found.
 *
 * Order is deliberately the matcher's order (inc.23 returns hits in transcript order); this
 * layer does not re-sort, because a list whose order disagrees with the marks below it makes
 * "the third moment" mean two different things on one screen.
 */
export function momentRows(moments: readonly PanelMoment[]): MomentRow[] {
  return moments.map((m, i) => ({
    key: `${m.turnKey}:${m.idx}:${m.snippetStart}:${i}`,
    turnKey: m.turnKey,
    idx: m.idx,
    time: m.time,
    seekSeconds: momentSeekSeconds(m.startMs),
    label: m.label,
    snippet: m.snippet,
    leadEllipsis: m.truncatedStart,
    trailEllipsis: m.truncatedEnd,
    jumpLabel: m.time
      ? `Jump to ${m.label} at ${m.time}`
      : // Rule 2: no invented time, and the label still says which turn it goes to.
        `Jump to ${m.label}`,
  }));
}
