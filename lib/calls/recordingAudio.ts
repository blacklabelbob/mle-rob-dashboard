// BUILD-QUEUE Q68 inc.28 — THE MOMENTS GET SOMEWHERE TO SEEK TO.
//
// inc.23 chose segment-granular transcripts over a text blob on ONE argument: segments are
// what enable moment search AND PLAYBACK SYNC. Five increments later search is end-to-end —
// a rep types "refund", gets a jump list, each row carries a time and a segment index — and
// every one of those times points at nothing, because there is no player anywhere in the
// system. `MomentRow.idx` is documented "the SEGMENT to seek a player to, once there is one".
// This is the seam that decides what that player is pointed at, pure (CR-3).
//
// FOUR RULES, ALL OF THEM ABOUT A SILENT FAILURE:
//
//  1. THE TWILIO MEDIA URL IS NEVER THE `src`. It is stored on the activity row and it is
//     RIGHT THERE — `<audio src={detail.recordingUrl}>` is the one-line version of this
//     feature. It is protected by account auth: the browser gets a 401, `<audio>` fires a
//     silent `error` event, and the rep sees a player with a dead play button and no
//     explanation. Playback goes through our own route, which holds the credential.
//
//  2. THE ROUTE IS ADDRESSED BY SID, NEVER BY URL. `/api/calls/recording?url=…` is the
//     obvious shape and it is an SSRF primitive WITH CREDENTIALS ATTACHED: whatever host a
//     caller puts in that parameter, our server fetches while holding the Twilio account
//     token. The sid names a row we already trust; the URL is read back from that row.
//
//  3. A FOREIGN HOST IS REFUSED, NOT PROXIED. Same reason from the other end — the stored
//     URL is only trusted to the extent we know who serves it. Anything that is not Twilio
//     media is `unplayable` and says so, and is NEVER offered as a raw link instead: a raw
//     link either 401s (a dead end dressed as an answer) or, worse, works — which would mean
//     verbatim customer speech sitting on an unauthenticated URL.
//
//  4. UNPLAYABLE IS NOT ABSENT. A call with no recording renders no player at all; a call
//     with a recording we cannot play renders a sentence. Collapsing them hides the second
//     case inside the first, and "this call has no recording" about a call that HAS one is
//     the same class of lie as inc.23's "0 matches" for a call nobody transcribed.

/** Our own route. The credential lives behind it; the browser never sees Twilio. */
export const RECORDING_MEDIA_PATH = "/api/calls/recording";

/**
 * Hosts whose media we are willing to fetch on the rep's behalf.
 *
 * A list, not a `.endsWith(".twilio.com")` test: a suffix check matches
 * `api.twilio.com.evil.example` for anyone who writes it slightly wrong, and this list is
 * short enough that being explicit costs nothing.
 */
export const RECORDING_MEDIA_HOSTS: readonly string[] = Object.freeze([
  "api.twilio.com",
  "media.twiliocdn.com",
]);

/** Twilio sids are 34 alphanumerics; the bound is loose, the character set is not. */
const SID_RE = /^[A-Za-z0-9]{10,64}$/;

export type PlaybackSource =
  /** No recording on this call. The UI renders no player (rule 4). */
  | { kind: "absent" }
  /** There is a recording and we will not play it. The UI states this (rule 4). */
  | { kind: "unplayable"; reason: string }
  /** Point an `<audio>` at `src`. Never the upstream URL (rule 1). */
  | { kind: "proxied"; src: string; sid: string };

export type PlaybackInput = {
  /** `CallTimelineDetail.recordingSid` — the key everything else in Q68 is addressed by. */
  recordingSid: string | null | undefined;
  /** `CallTimelineDetail.recordingUrl` — checked here, sent nowhere (rule 2). */
  recordingUrl: string | null | undefined;
};

/**
 * What, if anything, this call's audio can be played from.
 *
 * The stored URL is an INPUT to this decision and never an OUTPUT: it is inspected so a
 * host we do not serve is refused before a rep clicks anything, and then discarded. The
 * route re-reads it from the same row under the same rules.
 */
export function playbackSource(input: PlaybackInput): PlaybackSource {
  const raw = typeof input.recordingUrl === "string" ? input.recordingUrl.trim() : "";
  if (!raw) return { kind: "absent" };

  const sid = typeof input.recordingSid === "string" ? input.recordingSid.trim() : "";
  if (!sid) {
    // Rule 2: with no sid there is no safe way to ask for this audio. Falling back to the
    // URL is exactly the door this rule closes, so the recording stays unplayed.
    return { kind: "unplayable", reason: "This recording predates call tracking and cannot be played here." };
  }
  if (!SID_RE.test(sid)) {
    return { kind: "unplayable", reason: "This recording's id is not one we can look up." };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "unplayable", reason: "This recording's location is not a usable address." };
  }
  if (url.protocol !== "https:") {
    return { kind: "unplayable", reason: "This recording is not served over a secure connection." };
  }
  if (!RECORDING_MEDIA_HOSTS.includes(url.hostname.toLowerCase())) {
    // Rule 3. The host is named because a rep reporting this is reporting something we can
    // act on; the URL itself is not, because it is a link to customer speech.
    return { kind: "unplayable", reason: `This recording is hosted somewhere we do not play from (${url.hostname}).` };
  }

  return {
    kind: "proxied",
    sid,
    src: `${RECORDING_MEDIA_PATH}?sid=${encodeURIComponent(sid)}`,
  };
}

/**
 * The accessible name for the player.
 *
 * Named after the call, not "audio player" — a person page carries a dozen calls, and a
 * screen-reader listener moving between them hears the same two words at every stop
 * (inc.27's rule 4, one layer down).
 */
export function playbackLabel(detail: { direction?: string | null; duration?: string | null }): string {
  const which =
    detail.direction === "outbound" ? "outbound call" : detail.direction === "inbound" ? "inbound call" : "call";
  return detail.duration ? `Recording of this ${which} (${detail.duration})` : `Recording of this ${which}`;
}

/**
 * Seconds to seek to for a moment, or null.
 *
 * inc.27 rule 2 survives the last hop: a moment with no known time does not seek to 0 —
 * seeking is a physical claim ("it was said here"), and 0:00 is the one place a player is
 * already sitting, so a bad seek is indistinguishable from no seek at all. Negative and
 * non-finite inputs are refused for the same reason rather than clamped to 0.
 */
export function seekSeconds(startSec: unknown): number | null {
  if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0) return null;
  return startSec;
}
