// BUILD-QUEUE Q68 inc.29 — WHAT OUR SERVER SENDS UPSTREAM, AND WHAT IT SENDS BACK.
//
// inc.28 pointed the player at `/api/calls/recording?sid=…` and stopped there: the route
// does not exist. This is the seam it is made of — pure (CR-3), no network, no env read, no
// clock — because the half of a media proxy that fails invisibly is not the `fetch`, it is
// which headers travel in each direction.
//
// SIX RULES, EVERY ONE OF THEM A SILENT FAILURE:
//
//  1. THE HOST IS RE-CHECKED HERE, NOT TRUSTED FROM inc.28. That check runs in the browser
//     bundle and protects the UI; this one runs where the credential is. The stored URL is
//     a value a webhook payload put in our database — the only thing standing between it
//     and "our server fetches an arbitrary host with the Twilio account token attached" is
//     this function.
//
//  2. THE CREDENTIAL IS BUILT AFTER THE HOST IS APPROVED, IN THE SAME FUNCTION. Not because
//     ordering is elegant — because there is then NO code path that produces an
//     `Authorization` header for a URL that was not allow-listed. A separate `authHeader()`
//     helper is one careless call site away from being the leak.
//
//  3. RANGE TRAVELS BOTH WAYS AND A 206 STAYS A 206. Collapse it to 200 and `<audio>` marks
//     the stream unseekable: the moment list still renders, every row still says 4:12, and
//     clicking one moves the playhead NOWHERE. That is inc.28's "a bad seek is
//     indistinguishable from no seek" reproduced one layer down, and it is the entire
//     reason segments were chosen over a blob in inc.23.
//
//  4. HEADERS ARE COPIED BY ALLOW-LIST, NEVER FORWARDED WHOLESALE. A `set-cookie` from a
//     third party arriving on our origin is a session-fixation primitive, and anything
//     Twilio echoes about authentication is not ours to relay.
//
//  5. NOTHING ABOUT THIS IS SHARED-CACHEABLE. These bytes are verbatim customer speech and
//     prod is unauthenticated by Rob's 7/21 call (Q64). A CDN copy outlives whatever access
//     decision Q64 lands on, and it is keyed by a URL anyone can construct.
//
//  6. AN UPSTREAM 401 IS NOT OUR 401. Relaying it makes the browser prompt the REP for
//     credentials to OUR dashboard over a failure that is entirely between us and Twilio —
//     they type a password, it fails, and the report is "the dashboard logged me out".
//     Their auth failure is our 502.

import { RECORDING_MEDIA_HOSTS } from "@/lib/calls/recordingAudio";

/**
 * Basic-auth material for Twilio media.
 *
 * An API key pair is preferred over the account token: it is scoped and revocable without
 * re-keying every other Twilio surface. Both shapes are `basic`, so the caller cannot pick
 * the wrong one for the wrong header.
 */
export type MediaCredential = { user: string; pass: string };

export type UpstreamRequest =
  | { kind: "request"; url: string; headers: Record<string, string> }
  /** Nothing is fetched. `reason` is for our log, `status` is what the caller answers. */
  | { kind: "refused"; reason: string; status: 400 | 404 | 503 };

/**
 * Build the request to Twilio, or refuse to make one.
 *
 * `storedUrl` is what the recording row holds; it is validated as untrusted input every
 * single time, because that is what it is.
 */
export function upstreamRequest(input: {
  storedUrl: string | null | undefined;
  credential: MediaCredential | null;
  /** The rep's `Range`, verbatim, or null. Forwarded — see rule 3. */
  range?: string | null;
}): UpstreamRequest {
  const raw = typeof input.storedUrl === "string" ? input.storedUrl.trim() : "";
  // 404 and not 400: the sid was well-formed (the route checked) and simply names a call
  // with no recording. A 400 there would say the REP asked wrongly.
  if (!raw) return { kind: "refused", reason: "no recording url on this call", status: 404 };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "refused", reason: "stored recording url is not a url", status: 404 };
  }
  // Rule 1, twice: a plaintext hop would put the credential AND the audio on the wire.
  if (url.protocol !== "https:") {
    return { kind: "refused", reason: `stored recording url is not https (${url.protocol})`, status: 404 };
  }
  if (!RECORDING_MEDIA_HOSTS.includes(url.hostname.toLowerCase())) {
    return { kind: "refused", reason: `stored recording url host not allowed (${url.hostname})`, status: 404 };
  }

  // Rule 2. Past this line the host is approved; before it, no header exists to misuse.
  // No credential is `disabled`, deliberately a 503 and not a 404 — "we are not configured
  // to play this" and "there is nothing to play" are the same distinction inc.2 built two
  // tables to keep (a 404 here would have a rep reporting a missing recording that exists).
  if (!input.credential || !input.credential.user || !input.credential.pass) {
    return { kind: "refused", reason: "twilio media credential not configured", status: 503 };
  }
  const basic = Buffer.from(`${input.credential.user}:${input.credential.pass}`).toString("base64");

  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    // Asked for explicitly so a Twilio error page (which is HTML) is a shape we can reject
    // in `proxyResponse` rather than something we pipe into an <audio> element.
    Accept: "audio/*",
  };
  const range = typeof input.range === "string" ? input.range.trim() : "";
  // Rule 3, outbound half. Not parsed, not rebuilt — a Range we re-derive is a Range that
  // can disagree with the one the player will measure the response against.
  if (range) headers.Range = range;

  return { kind: "request", url: url.toString(), headers };
}

/** Upstream headers worth relaying. Rule 4: everything absent from this list is dropped. */
const PASSTHROUGH = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

export type ProxyResponse =
  | { kind: "stream"; status: number; headers: Record<string, string> }
  /** The body is discarded; the rep sees our sentence, never Twilio's page. */
  | { kind: "error"; status: 404 | 502; reason: string };

/**
 * Turn Twilio's response into ours.
 *
 * `header` is a lookup (case-insensitive by contract — pass `res.headers.get`), so this
 * function never needs a `Response` and the tests never need a network.
 */
export function proxyResponse(input: {
  status: number;
  header: (name: string) => string | null | undefined;
}): ProxyResponse {
  const { status, header } = input;

  // Rule 6. 401/403 collapse into 502 with everything else that is upstream's problem.
  if (status === 404) {
    return { kind: "error", status: 404, reason: "twilio has no media for this recording" };
  }
  if (status !== 200 && status !== 206) {
    return { kind: "error", status: 502, reason: `twilio media responded ${status}` };
  }

  const contentType = (header("content-type") || "").toLowerCase();
  // A 200 carrying HTML is an error page with a success code — Twilio serves those. Piping
  // it through would give the rep a player that loads "successfully" and is silent forever,
  // which reads as a broken recording rather than a broken fetch.
  if (contentType && !contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
    return { kind: "error", status: 502, reason: `twilio media returned ${contentType}` };
  }

  const headers: Record<string, string> = {};
  for (const name of PASSTHROUGH) {
    const value = header(name);
    if (typeof value === "string" && value.trim()) headers[name] = value;
  }
  // A 206 with no `content-range` is unusable: the player cannot tell which bytes it got,
  // so seeking silently lands wrong. Better a stated failure than an audible one.
  if (status === 206 && !headers["content-range"]) {
    return { kind: "error", status: 502, reason: "twilio returned 206 without content-range" };
  }
  // Absent from upstream on a full response, but the player needs it to offer a scrub bar
  // at all — and Twilio media does support ranges.
  if (status === 200 && !headers["accept-ranges"]) headers["accept-ranges"] = "bytes";

  // Rule 5. `private` alone still lets the browser keep a copy on disk; `no-store` is the
  // one that matters, and it is repeated in the CDN-specific header because Vercel's edge
  // reads that one first.
  headers["cache-control"] = "private, no-store, max-age=0";
  headers["cdn-cache-control"] = "no-store";
  // The bytes are customer speech: nothing about them belongs in a referrer or a frame.
  headers["referrer-policy"] = "no-referrer";
  headers["x-content-type-options"] = "nosniff";
  // Rule 3 is only half kept if the response arrives as an attachment: some browsers stop
  // range-requesting a download. Inline, named nothing — the sid is already in the URL.
  headers["content-disposition"] = "inline";

  return { kind: "stream", status, headers };
}
