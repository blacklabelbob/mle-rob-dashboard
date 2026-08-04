// Fireflies' DAILY quota — and a machine that simply had no network — told apart from the
// pipeline being broken.
//
// THE FAILURE THIS FIXES (2026-07-31 12:33 and 13:03): meeting intake fired two alarms into
// Rob's ping inbox reading "🔴 MEETING INTAKE FAILED — recorded calls are NOT reaching the CRM".
// The actual API response was:
//
//   too_many_requests — "Please retry after Sat, 01 Aug 2026 00:00:00 GMT"
//
// Two separate defects sat inside that one line.
//
//   1. THE ALARM DESCRIBED THE WRONG EVENT. "Recorded calls are NOT reaching the CRM" is the
//      sentence for a broken pull — a bad key, a schema change, a dead endpoint, something a
//      human must go fix. A daily quota that Fireflies told us the exact expiry of is not that:
//      nothing is broken, nothing on disk changed, and it clears by itself at a known instant.
//      Both messages arriving through the same channel with the same wording means the day the
//      pull IS broken, that alarm reads like the other twenty-two.
//
//   2. THE COOLDOWN WAS NEVER OBSERVED. The launchd job runs every 30 minutes. Fireflies handed
//      back a retryAfter of midnight UTC; there were ~22 runs left in that window, and every one
//      of them would have spent a request to be told the same thing and fired the same alarm.
//      A rate limit you keep hitting on purpose is a rate limit you never get out from under.
//
// WHAT THIS MODULE DOES NOT DO: it does not decide the run succeeded. During a cooldown it is
// genuinely true that a meeting recorded in the last half hour is not in the CRM yet, and this
// file never says otherwise — see cooldownNotice(), which states the gap rather than papering
// over it. The change is that the outcome is named QUOTA and carries an expiry, instead of being
// filed under the same word as a pipeline that has stopped working.
//
// THE SAME ALARM FIRED AGAIN ON 2026-08-03 (22:10:04 and 22:40:04) FOR A THIRD CAUSE, and the
// cause was not Fireflies at all:
//
//   TypeError: fetch failed  ←  cause: getaddrinfo ENOTFOUND api.fireflies.ai
//
// The laptop had no DNS. Nothing was queried, so nothing could be rate limited and nothing could
// be broken; the 23:10 run that followed pulled the same 17 transcripts and reported 0 new. Rob
// was told twice, in red, that "recorded calls are NOT reaching the CRM" because his machine was
// off the network for an hour. That is defect (1) above recurring for a different reason, and it
// is worse in one respect: a quota alarm at least described something that happened at Fireflies.
//
// SO REACHABILITY IS ITS OWN OUTCOME, NOT A THIRD SPELLING OF "FAILED":
//   - it exits EXIT_OFFLINE, never EXIT_QUOTA, because the two demand OPPOSITE next moves — a
//     quota must bank an expiry and stop spending requests, while an unreachable host must be
//     retried on the ordinary 30-minute beat with nothing banked. Writing a cooldown stamp for
//     an offline minute would switch intake off for a window nobody chose.
//   - it is classified ONLY from a socket-level cause code, never from message prose. A bare
//     "fetch failed" with no cause stays UNCLASSIFIED and therefore stays loud: the case that
//     must never be quietly downgraded is the real break this whole file exists to keep audible.
//
// CR-3: pure functions over values. `now` is always a parameter — never Date.now() in here — so
// a test pins the same clock twice and gets the same answer.

/** Exit code for "quota exhausted, try later". 75 = EX_TEMPFAIL (sysexits.h): temporary failure,
 *  retry is meaningful. Deliberately not 0 (nothing was fetched) and not 1 (nothing is broken). */
export const EXIT_QUOTA = 75;

/** Exit code for "the host could not be reached from this machine". 69 = EX_UNAVAILABLE
 *  (sysexits.h): a service was unavailable. Kept distinct from EXIT_QUOTA on purpose — same
 *  "nothing is broken" verdict, opposite instruction to the scheduler (retry normally vs. back
 *  off until a known instant). Both codes live in this one file so neither can be reused. */
export const EXIT_OFFLINE = 69;

/** Socket/DNS-level failures that mean "this machine could not get there", not "the API answered
 *  badly". Named exhaustively rather than pattern-matched: an unknown code must fall through to
 *  the loud path. ECONNRESET is deliberately absent — a connection that opened and was then torn
 *  down reached the host, and can equally be a proxy or an upstream fault worth shouting about. */
const UNREACHABLE_CODES = new Set([
  "ENOTFOUND", // DNS gave nothing — the 2026-08-03 case
  "EAI_AGAIN", // DNS timed out
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENETDOWN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

/**
 * Was this failure the network being absent, rather than the API answering?
 *
 * `fetch` buries the real reason one or more levels down in `cause`, so the chain is walked. The
 * message text is never consulted — see the header: prose can be reworded, a code is a contract.
 *
 * @param {unknown} err - the thrown error.
 * @returns {{unreachable: boolean, code: string|null}}
 */
export function transportFailure(err) {
  const seen = new Set();
  for (let e = err; e && typeof e === "object" && !seen.has(e); e = e.cause) {
    seen.add(e);
    const code = typeof e.code === "string" ? e.code : null;
    if (code && UNREACHABLE_CODES.has(code)) return { unreachable: true, code };
  }
  return { unreachable: false, code: null };
}

/**
 * What the log is told when the host was unreachable. Same contract as cooldownNotice(): states
 * what is true and what is NOT yet true, and never claims the archive is current.
 *
 * @param {object} args
 * @param {string|null} args.code - the socket-level code that classified this run.
 * @param {number} args.onDisk    - transcripts already in the repo (untouched by this run).
 * @returns {string}
 */
export function unreachableNotice({ code, onDisk }) {
  return (
    `Fireflies was unreachable from this machine (${code ?? "no code"}) — nothing was asked, so ` +
    `nothing is known about the API's health and nothing is broken on its side. No cooldown was ` +
    `banked: the next scheduled run tries again as normal. Nothing on disk was changed: ${onDisk} ` +
    `transcript(s) remain in the repo. Any meeting recorded since the last good run is NOT in the ` +
    `CRM yet and will be picked up on the first run that reaches the network.`
  );
}

/**
 * Read a Fireflies GraphQL `errors` array for a rate limit and the instant it lifts.
 *
 * Fireflies returns HTTP 200 with the limit inside the errors array, so a status check alone
 * never sees it. The retry instant arrives twice — a human string in `message` and epoch ms in
 * `extensions.metadata.retryAfter` — and the epoch is the one trusted: the message is prose that
 * can be reworded upstream without warning, the number is the contract.
 *
 * @param {Array<object>|null|undefined} errors - the GraphQL errors array.
 * @returns {{limited: boolean, retryAfterMs: number|null}}
 */
export function parseRateLimit(errors) {
  if (!Array.isArray(errors)) return { limited: false, retryAfterMs: null };

  const hit = errors.find(
    (e) => e?.code === "too_many_requests" || e?.extensions?.code === "too_many_requests" || e?.extensions?.status === 429,
  );
  if (!hit) return { limited: false, retryAfterMs: null };

  // A rate limit with no usable retryAfter is still a rate limit. Report it as limited with a
  // null expiry rather than pretending it is an ordinary error — the caller backs off either way.
  const raw = hit.extensions?.metadata?.retryAfter;
  const retryAfterMs = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
  return { limited: true, retryAfterMs };
}

/**
 * Should this run even call the API?
 *
 * @param {object} args
 * @param {string|null|undefined} args.stamp - contents of the cooldown file, or null if absent.
 * @param {number} args.now                  - epoch ms for "now" (passed in, never read here).
 * @returns {{waiting: boolean, untilMs: number|null, minutesLeft: number|null}}
 */
export function cooldownState({ stamp, now }) {
  const untilMs = Number(String(stamp ?? "").trim());
  // An absent, empty or unparseable stamp is NOT a reason to skip the pull. The failure mode
  // that matters here is a corrupt file silently switching intake off for good; when in doubt
  // this module lets the run proceed and lets Fireflies be the authority on its own quota.
  if (!Number.isFinite(untilMs) || untilMs <= 0) return { waiting: false, untilMs: null, minutesLeft: null };
  if (now >= untilMs) return { waiting: false, untilMs, minutesLeft: 0 };
  return { waiting: true, untilMs, minutesLeft: Math.ceil((untilMs - now) / 60_000) };
}

/**
 * What the log and the ping inbox are told during a cooldown. Says what is true and what is not
 * yet true, in that order, and never claims the archive is current.
 *
 * @param {object} args
 * @param {number|null} args.untilMs - when the quota lifts, or null if Fireflies did not say.
 * @param {number|null} args.minutesLeft
 * @param {number} args.onDisk - transcripts already in the repo (untouched by this run).
 * @returns {string}
 */
export function cooldownNotice({ untilMs, minutesLeft, onDisk }) {
  const when = untilMs ? new Date(untilMs).toISOString().replace(".000Z", "Z") : "an unstated time";
  const left = minutesLeft == null ? "" : ` (~${minutesLeft} min)`;
  return (
    `Fireflies daily quota exhausted — the API declined this run, it is not broken. ` +
    `Quota lifts at ${when}${left}. Nothing was fetched and nothing on disk was changed: ` +
    `${onDisk} transcript(s) remain in the repo. Any meeting recorded since the last good run is ` +
    `NOT in the CRM yet and will be picked up on the first run after the quota lifts.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ELAPSED SILENCE — the converse of everything above.
//
// Everything above this line makes the alarm QUIETER: a quota is not a break, an unreachable
// host is not a break, and neither should fire the red sentence. Which opens the failure this
// section closes. Three days of politely-worded OFFLINE lines produce exactly the outcome the
// red sentence exists to prevent — recorded calls not reaching the CRM — while nobody is told,
// because no SINGLE run failed. A downgrade that never expires is just a mute button.
//
// So silence is measured on its own, and it is measured in TIME, not in beats. Counting beats
// is the obvious implementation and it is wrong here: a closed laptop fires no launchd beat at
// all, so a ten-hour lid-closed night reports "0 quiet beats" — the exact stretch during which
// a recorded meeting would sit unfetched. Wall-clock elapsed since the last run that actually
// landed is the only measure that answers the question a human is asking.
//
// Two rules keep this from becoming the noise it is meant to detect:
//
//   1. SILENCE ALONE NEVER ALARMS. This is only ever consulted on a run that is failing right
//      now (QUOTA or OFFLINE). A successful pull rewrites the stamp, so an overnight gap on a
//      sleeping machine resolves itself on the first good beat and Rob is never told about it.
//   2. ONE ESCALATION PER THRESHOLD WINDOW. A genuinely dead pipeline must keep shouting — at
//      6h, 12h, 18h — but must not put a red line in the ping inbox every 30 minutes, which is
//      how the last three increments' alarm fatigue started.

/** How long nothing may land before a downgraded run is escalated anyway. Six hours = twelve
 *  missed 30-minute beats: long enough that an ordinary offline stretch or a single quota
 *  window clears on its own, short enough that a working day never passes unnoticed. */
export const SILENCE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Has intake been quiet long enough that a downgraded outcome should be escalated anyway?
 *
 * @param {object} args
 * @param {number|null} args.lastSuccess   - epoch ms of the last run that actually pulled, or null.
 * @param {number|null} args.firstObserved - epoch ms this silence was first noticed, or null.
 * @param {number|null} args.lastEscalated - epoch ms of the last escalation, or null.
 * @param {number} args.now
 * @param {number} [args.thresholdMs]
 * @returns {{escalate: boolean, elapsedMs: number|null, hoursQuiet: number|null, since: number|null, reason: string}}
 */
export function silenceState({ lastSuccess, lastEscalated, firstObserved, now, thresholdMs = SILENCE_THRESHOLD_MS }) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const success = num(lastSuccess);
  const observed = num(firstObserved);
  const escalated = num(lastEscalated);

  // No success has EVER been recorded (fresh clone, or a machine that has never reached the API).
  // The clock is started from when this was first noticed rather than from an invented success —
  // claiming a pull that never happened is the one thing this whole file is against — and until
  // that mark is itself old enough, the honest verdict is "not known yet".
  const since = success ?? observed;
  if (since == null) return { escalate: false, elapsedMs: null, hoursQuiet: null, since: null, reason: "clock-started" };

  // A stamp from the future (clock change, restored backup) must not read as infinite silence.
  const elapsedMs = Math.max(0, now - since);
  const hoursQuiet = Math.floor(elapsedMs / 3_600_000);
  if (elapsedMs < thresholdMs) return { escalate: false, elapsedMs, hoursQuiet, since, reason: "within-threshold" };

  // Still silent, but already shouted about recently: hold until another full window has passed.
  if (escalated != null && now - escalated < thresholdMs) {
    return { escalate: false, elapsedMs, hoursQuiet, since, reason: "already-escalated" };
  }
  return { escalate: true, elapsedMs, hoursQuiet, since, reason: "silent-too-long" };
}

/**
 * The red line for a silence escalation. It names the DURATION and the downgraded outcome that
 * was hiding it, because "intake failed" was never the useful part — "nothing has landed since
 * 17:40 and the runs are calling it OFFLINE" is what tells a human what to go look at.
 *
 * @param {object} args
 * @param {number} args.hoursQuiet
 * @param {number|null} args.since - epoch ms nothing has landed since.
 * @param {string} args.outcome    - the per-run word being escalated past ("OFFLINE" | "QUOTA").
 * @param {boolean} args.everSucceeded
 * @returns {string}
 */
export function silenceNotice({ hoursQuiet, since, outcome, everSucceeded }) {
  const when = since ? new Date(since).toISOString().replace(".000Z", "Z") : "an unknown time";
  const anchor = everSucceeded ? `the last successful pull at ${when}` : `${when}, and no pull has EVER succeeded on this machine`;
  return (
    `MEETING INTAKE HAS BEEN SILENT FOR ~${hoursQuiet}h — no recorded call has reached the CRM since ` +
    `${anchor}. Every run in that window ended ${outcome}, which is individually harmless and ` +
    `collectively the exact failure the intake alarm exists to catch. A human must check this one.`
  );
}

/**
 * The same escalation, shaped as a Things-to-Address finding (Q84 inc.136).
 *
 * WHY THIS EXISTS: inc.135 put the silence alarm in PING-INBOX — the same channel the two FALSE
 * alarms of 22:10 and 22:40 on 08-03 used, and a file Rob reads at session start. A six-hour-old
 * silence that waits for the next session to be noticed has already cost the thing it was
 * measuring. Rob's standing findings rule (2026-07-22) says a discovery needing his attention
 * belongs on the ledger, never only in the ping inbox. Both doors now, not one.
 *
 * The `dedupeKey` is STABLE and carries no duration: a pipeline that has been quiet for 6h and
 * then 12h and then 18h is ONE fact getting worse, and the route CORRECTS its own row from a
 * repeat post. A key that included the hour count would stack a new row on Rob's page every
 * window — which is the alarm fatigue this whole thread has been unwinding, rebuilt on his ledger.
 *
 * `entityName` is the pipeline rather than a company: no org is at fault, and filing this on one
 * would put a machine's failure on a customer's record page.
 *
 * @param {object} args - as silenceNotice, plus nothing: the notice IS the detail.
 * @returns {{entityName: string, title: string, detail: string, severity: string, dedupeKey: string}}
 */
export function silenceFlag({ hoursQuiet, since, outcome, everSucceeded }) {
  return {
    entityName: "Meeting intake",
    title: `Meeting intake silent ~${hoursQuiet}h — no recorded call has reached the CRM`,
    detail: silenceNotice({ hoursQuiet, since, outcome, everSucceeded }),
    // high: the CRM is missing calls that happened. Rob's own words for this pipeline's failure
    // are "recorded calls are NOT reaching the CRM" — that is not a medium.
    severity: "high",
    dedupeKey: "meeting-intake-silence",
  };
}
