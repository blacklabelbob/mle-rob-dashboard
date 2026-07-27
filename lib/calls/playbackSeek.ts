// BUILD-QUEUE Q68 inc.32 — THE JUMP LIST REACHES THE PLAYER. The last missing edge.
//
// inc.27 gave every moment a time and a button. inc.28–31 built the seam, the proxy and the
// player. And the two halves have never touched: clicking a moment SCROLLS to the words and
// the audio stays wherever it was. `MomentRow.idx` has said "the SEGMENT to seek a player to,
// once there is one" for five increments; the player now exists, so this is what a click means.
//
// This is the decision layer (CR-3). The components below it move a scroll position and an
// `<audio>` element; they judge nothing.
//
// FOUR RULES, EVERY ONE OF THEM A LIE WE ARE REFUSING TO TELL:
//
//  1. A MOMENT WITH NO TIME DOES NOT SEEK. inc.27 rule 2 in its final form: a moment whose
//     span was unusable carries `time: null` and the row prints no time — seeking such a row
//     to 0:00 would move the player to a place the transcript never claimed, and the rep would
//     hear the opening of the call while reading a phrase from minute nine. Scroll only.
//
//  2. NO PLAYER IS NOT A FAILED SEEK. A call whose recording is `absent` renders no player at
//     all and one that is `unplayable` renders its own sentence (inc.28 rule 4). Either way the
//     jump still scrolls and says NOTHING about audio — a second "we could not seek" notice
//     would be an error message about a control the rep can plainly see is not there.
//
//  3. A SEEK IS ALSO A PLAY, OR IT IS INVISIBLE. The player is `preload="none"` (inc.31 rule 1),
//     so nothing has loaded: assigning `currentTime` alone sets the *default playback start
//     position*, the control keeps reading 0:00, and the rep who clicked a moment sees and
//     hears NOTHING — the dead play button of inc.28, rebuilt one layer up. A click on a
//     moment is a deliberate request for that moment, and it starts there.
//
//  4. A REFUSED PLAY IS SAID OUT LOUD. `play()` returns a promise that can reject (autoplay
//     policy, a torn-down element, the proxy answering 503) and an unhandled rejection is
//     invisible to everyone except a console nobody is reading. The seek is the one action in
//     Q68 the rep asked for by name; it does not get to fail quietly.

import { seekSeconds } from "./recordingAudio";

/** What a click on one moment row does. */
export type SeekPlan =
  /** Scroll AND move the player to `seconds` (rule 3: and start it there). */
  | { kind: "seek"; seconds: number }
  /** Scroll only — this moment has no known time (rule 1). */
  | { kind: "no-time" }
  /** Scroll only — there is nothing to seek, and nothing to say about it (rule 2). */
  | { kind: "no-player" };

/**
 * Wire milliseconds → player seconds, or null.
 *
 * `<audio currentTime>` is seconds; the transcript is milliseconds. The conversion is here
 * rather than at the call site because `startMs / 1000` on a null quietly yields 0 — the exact
 * 0:00 seek rule 1 exists to prevent — and `null` is a normal value on a moment.
 *
 * Fractional seconds are KEPT. Rounding to whole seconds would move the seek off the sentence
 * the rep clicked (Deepgram segments routinely start mid-second), and `<audio>` takes a float.
 */
export function momentSeekSeconds(startMs: unknown): number | null {
  if (typeof startMs !== "number" || !Number.isFinite(startMs) || startMs < 0) return null;
  // Re-checked through the same gate the player's own seek uses, so a value that is refused
  // one layer down can never be planned one layer up.
  return seekSeconds(startMs / 1000);
}

/**
 * What clicking this moment should do.
 *
 * `hasPlayer` is TRUE only where an element is actually mounted and seekable — i.e. where
 * `playbackSource` returned `proxied` AND the component published its handle. It is not
 * "this call has a recording": a recording we refuse to serve has no player (rule 2).
 */
export function seekPlan(input: { seekSeconds: number | null; hasPlayer: boolean }): SeekPlan {
  // The seconds are RE-GATED, not trusted. `!== null` is not the same test as "usable": a NaN
  // or a negative arriving from a caller that skipped `momentSeekSeconds` would pass a null
  // check and be planned as a seek, and `currentTime = NaN` throws while `-1` clamps to 0 —
  // rule 1's forbidden 0:00, reached by accident. Caught by its own test, fixed here.
  const seconds = seekSeconds(input.seekSeconds);
  // Rule 1 BEFORE rule 2 on purpose: a timeless moment is a timeless moment whether or not a
  // player is mounted, and reporting it as "no player" would blame the wrong thing.
  if (seconds === null) return { kind: "no-time" };
  if (!input.hasPlayer) return { kind: "no-player" };
  return { kind: "seek", seconds };
}

/**
 * What to tell a rep when the player refused to start (rule 4).
 *
 * Deliberately does NOT name a cause: a rejected `play()` is an autoplay policy, a proxy 503,
 * a network drop and a torn-down element behind one DOMException, and inc.31 already paid for
 * naming a cause the evidence does not carry. It says what did not happen, and that the words
 * on screen — which the rep has in front of them — are unaffected.
 */
export function seekBlockedNotice(): string {
  return "We moved to that moment but could not start playing it. Press play to hear it.";
}
