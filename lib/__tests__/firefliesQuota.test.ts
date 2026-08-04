import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs helper, shared with scripts/fireflies-ingest.mjs
import {
  EXIT_QUOTA,
  EXIT_OFFLINE,
  parseRateLimit,
  cooldownState,
  cooldownNotice,
  transportFailure,
  unreachableNotice,
  silenceState,
  silenceNotice,
  silenceFlag,
  mergeSilenceQueue,
  SILENCE_THRESHOLD_MS,
} from "../../scripts/fireflies-quota.mjs";

// The exact payload Fireflies returned at 2026-07-31 12:33:37 and again at 13:03:37, both of
// which reached Rob's ping inbox as "🔴 recorded calls are NOT reaching the CRM".
const LIVE_429 = [
  {
    friendly: true,
    message: "Too many requests. Please retry after Sat, 01 Aug 2026 00:00:00 GMT (UTC)",
    path: ["transcripts"],
    code: "too_many_requests",
    extensions: {
      code: "too_many_requests",
      status: 429,
      metadata: { retryAfter: 1785542400794 },
    },
  },
];

describe("parseRateLimit", () => {
  it("recognises the payload that fired both 2026-07-31 alarms, and takes the epoch not the prose", () => {
    expect(parseRateLimit(LIVE_429)).toEqual({ limited: true, retryAfterMs: 1785542400794 });
  });

  it("still reports a rate limit when the retry instant is missing — back off blind, not never", () => {
    expect(parseRateLimit([{ extensions: { code: "too_many_requests" } }])).toEqual({
      limited: true,
      retryAfterMs: null,
    });
  });

  it("does not read a rate limit into an ordinary GraphQL error", () => {
    // This is the case that MUST stay loud: a real break has to keep exiting 1.
    expect(parseRateLimit([{ message: "Cannot query field 'sentances'" }])).toEqual({
      limited: false,
      retryAfterMs: null,
    });
    expect(parseRateLimit(null)).toEqual({ limited: false, retryAfterMs: null });
    expect(parseRateLimit(undefined)).toEqual({ limited: false, retryAfterMs: null });
  });

  it("catches a 429 that arrives with no code string", () => {
    expect(parseRateLimit([{ extensions: { status: 429 } }]).limited).toBe(true);
  });
});

describe("cooldownState", () => {
  const until = 1785542400794; // Sat 01 Aug 2026 00:00:00 UTC

  it("skips the API while the quota is still spent, and rounds minutes UP", () => {
    // 90 seconds before the lift: two minutes, not one — never report the wait as shorter
    // than it is, or the next firing arrives to be refused again.
    expect(cooldownState({ stamp: String(until), now: until - 90_000 })).toEqual({
      waiting: true,
      untilMs: until,
      minutesLeft: 2,
    });
  });

  it("lets the run proceed the instant the quota lifts", () => {
    expect(cooldownState({ stamp: String(until), now: until })).toEqual({
      waiting: false,
      untilMs: until,
      minutesLeft: 0,
    });
  });

  it("never switches intake off on a missing, empty or corrupt stamp", () => {
    // The catastrophic failure here is a bad file silently stopping meeting intake forever.
    // When the stamp cannot be trusted, Fireflies is the authority on its own quota.
    for (const stamp of [null, undefined, "", "   ", "not-a-number", "0", "-5", "NaN"]) {
      expect(cooldownState({ stamp, now: until }).waiting).toBe(false);
    }
  });

  it("tolerates the trailing newline the script writes", () => {
    expect(cooldownState({ stamp: `${until}\n`, now: until - 60_000 }).waiting).toBe(true);
  });
});

describe("cooldownNotice", () => {
  it("says nothing was lost AND says what is not in the CRM yet — both, in that order", () => {
    const msg = cooldownNotice({ untilMs: 1785542400794, minutesLeft: 42, onDisk: 40 });
    expect(msg).toContain("it is not broken");
    expect(msg).toContain("2026-08-01T00:00:00");
    expect(msg).toContain("~42 min");
    expect(msg).toContain("40 transcript(s) remain in the repo");
    // The half that must never be dropped for being inconvenient: during a cooldown a meeting
    // recorded in the last half hour genuinely is not in the CRM, and the notice says so.
    expect(msg).toContain("NOT in the CRM yet");
  });

  it("does not invent an expiry Fireflies never gave", () => {
    const msg = cooldownNotice({ untilMs: null, minutesLeft: null, onDisk: 0 });
    expect(msg).toContain("an unstated time");
    expect(msg).not.toContain("min)");
  });
});

describe("EXIT_QUOTA", () => {
  it("is EX_TEMPFAIL — distinct from 0 (nothing was fetched) and from 1 (nothing is broken)", () => {
    expect(EXIT_QUOTA).toBe(75);
  });
});

// The error `fetch` actually threw at 2026-08-03 22:10:04 and 22:40:04, both of which reached
// Rob's ping inbox as "🔴 recorded calls are NOT reaching the CRM" while his laptop had no DNS.
// Reproduced with the real shape: the reason is one level down in `cause`, not in the message.
const LIVE_OFFLINE = Object.assign(new TypeError("fetch failed"), {
  cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.fireflies.ai"), {
    errno: -3008,
    code: "ENOTFOUND",
    syscall: "getaddrinfo",
    hostname: "api.fireflies.ai",
  }),
});

describe("transportFailure", () => {
  it("recognises the error that fired both 2026-08-03 alarms, reading the cause not the message", () => {
    expect(transportFailure(LIVE_OFFLINE)).toEqual({ unreachable: true, code: "ENOTFOUND" });
  });

  it("reads a code buried deeper than one level", () => {
    const wrapped = Object.assign(new Error("outer"), { cause: LIVE_OFFLINE });
    expect(transportFailure(wrapped)).toEqual({ unreachable: true, code: "ENOTFOUND" });
  });

  it("covers the rest of the off-the-network family", () => {
    for (const code of ["EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ENETDOWN", "ENETUNREACH", "EHOSTUNREACH"]) {
      expect(transportFailure(Object.assign(new Error(code), { code }))).toEqual({
        unreachable: true,
        code,
      });
    }
  });

  it("leaves a real break LOUD — this is the case that must never be downgraded", () => {
    // A GraphQL/schema break, an auth failure, and a `fetch failed` with no cause at all: none of
    // these are classifiable as "the network was absent", so all three keep exiting 1.
    expect(transportFailure(new Error("Fireflies GraphQL: Cannot query field 'sentances'"))).toEqual({
      unreachable: false,
      code: null,
    });
    expect(transportFailure(new Error("Fireflies HTTP 401: unauthorized"))).toEqual({
      unreachable: false,
      code: null,
    });
    expect(transportFailure(new TypeError("fetch failed"))).toEqual({ unreachable: false, code: null });
    // A connection that opened and was then reset REACHED the host — deliberately not our family.
    expect(transportFailure(Object.assign(new Error("reset"), { code: "ECONNRESET" }))).toEqual({
      unreachable: false,
      code: null,
    });
  });

  it("survives a self-referential cause chain instead of hanging the intake job", () => {
    const loop: Error & { cause?: unknown } = new Error("a");
    loop.cause = loop;
    expect(transportFailure(loop)).toEqual({ unreachable: false, code: null });
    expect(transportFailure(null)).toEqual({ unreachable: false, code: null });
    expect(transportFailure(undefined)).toEqual({ unreachable: false, code: null });
  });
});

describe("unreachableNotice", () => {
  it("says nothing was asked, nothing was banked, and what is still missing", () => {
    const msg = unreachableNotice({ code: "ENOTFOUND", onDisk: 17 });
    expect(msg).toContain("ENOTFOUND");
    expect(msg).toContain("nothing was asked");
    expect(msg).toContain("No cooldown was banked");
    expect(msg).toContain("17 transcript(s) remain in the repo");
    // Same half that cooldownNotice() must never drop: the gap is stated, not papered over.
    expect(msg).toContain("NOT in the CRM yet");
  });
});

describe("EXIT_OFFLINE", () => {
  it("is EX_UNAVAILABLE and NOT EXIT_QUOTA — the two demand opposite next moves", () => {
    expect(EXIT_OFFLINE).toBe(69);
    expect(EXIT_OFFLINE).not.toBe(EXIT_QUOTA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Elapsed silence. Everything above makes the alarm quieter; these pin the converse — that the
// quiet cannot go on forever without somebody being told.

const HOUR = 3_600_000;
const T0 = Date.parse("2026-08-03T17:40:00Z"); // the last good pull in the live 08-03 sequence

describe("silenceState", () => {
  it("holds while the gap is shorter than the threshold — one offline hour is not an alarm", () => {
    const v = silenceState({ lastSuccess: T0, lastEscalated: null, firstObserved: null, now: T0 + HOUR });
    expect(v).toMatchObject({ escalate: false, reason: "within-threshold", hoursQuiet: 1 });
  });

  it("escalates once the gap crosses the threshold, even though no single run failed", () => {
    const v = silenceState({ lastSuccess: T0, lastEscalated: null, firstObserved: null, now: T0 + 7 * HOUR });
    expect(v).toMatchObject({ escalate: true, reason: "silent-too-long", hoursQuiet: 7, since: T0 });
  });

  it("does not re-shout every beat — one escalation per threshold window, then again after it", () => {
    const at7 = T0 + 7 * HOUR;
    expect(silenceState({ lastSuccess: T0, lastEscalated: at7, firstObserved: null, now: at7 + HOUR }))
      .toMatchObject({ escalate: false, reason: "already-escalated" });
    // ...but a pipeline that is still dead six hours later is told about again.
    expect(silenceState({ lastSuccess: T0, lastEscalated: at7, firstObserved: null, now: at7 + 7 * HOUR }))
      .toMatchObject({ escalate: true, reason: "silent-too-long" });
  });

  it("measures from a first-observation mark when no pull has ever succeeded, and never invents one", () => {
    const cold = silenceState({ lastSuccess: null, lastEscalated: null, firstObserved: null, now: T0 });
    expect(cold).toMatchObject({ escalate: false, reason: "clock-started", elapsedMs: null, since: null });
    // Once the mark exists it is the anchor, and it ages like any other.
    expect(silenceState({ lastSuccess: null, lastEscalated: null, firstObserved: T0, now: T0 + 7 * HOUR }))
      .toMatchObject({ escalate: true, since: T0 });
  });

  it("prefers a real success over the observation mark — the mark is only a fallback", () => {
    const v = silenceState({ lastSuccess: T0 + 6 * HOUR, lastEscalated: null, firstObserved: T0, now: T0 + 7 * HOUR });
    expect(v).toMatchObject({ escalate: false, since: T0 + 6 * HOUR, hoursQuiet: 1 });
  });

  it("treats a stamp from the future as zero elapsed, not as infinite silence", () => {
    const v = silenceState({ lastSuccess: T0 + 99 * HOUR, lastEscalated: null, firstObserved: null, now: T0 });
    expect(v).toMatchObject({ escalate: false, elapsedMs: 0, hoursQuiet: 0 });
  });

  it("ignores corrupt or non-positive stamps rather than deriving a silence from them", () => {
    for (const junk of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "17:40" as unknown as number]) {
      expect(silenceState({ lastSuccess: junk, lastEscalated: null, firstObserved: null, now: T0 }))
        .toMatchObject({ escalate: false, reason: "clock-started" });
    }
  });

  it("uses a six-hour default — twelve missed 30-minute beats", () => {
    expect(SILENCE_THRESHOLD_MS).toBe(6 * HOUR);
  });
});

describe("silenceNotice", () => {
  it("names the duration and the downgraded word that was hiding it", () => {
    const msg = silenceNotice({ hoursQuiet: 8, since: T0, outcome: "OFFLINE", everSucceeded: true });
    expect(msg).toContain("~8h");
    expect(msg).toContain("2026-08-03T17:40:00Z");
    expect(msg).toContain("OFFLINE");
    expect(msg).toContain("A human must check this one.");
  });

  it("says outright when nothing has ever succeeded, instead of implying a pull once worked", () => {
    const msg = silenceNotice({ hoursQuiet: 9, since: T0, outcome: "QUOTA", everSucceeded: false });
    expect(msg).toContain("no pull has EVER succeeded");
  });
});

// Q84 inc.136 — the escalation as a ledger finding. PING-INBOX is a file Rob reads at session
// start; a six-hour-old silence needs the door that is already open on his page.
describe("silenceFlag", () => {
  const flag = (over = {}) =>
    silenceFlag({ hoursQuiet: 8, since: T0, outcome: "OFFLINE", everSucceeded: true, ...over });

  it("carries the notice verbatim as the detail, so both doors say the same thing", () => {
    expect(flag().detail).toBe(
      silenceNotice({ hoursQuiet: 8, since: T0, outcome: "OFFLINE", everSucceeded: true }),
    );
  });

  it("dedupes on a key that does NOT move with the hour count", () => {
    // 6h → 12h → 18h is one fact getting worse. A key carrying the duration would stack a fresh
    // row on Rob's page every window, which is the alarm fatigue this thread exists to undo.
    expect(flag({ hoursQuiet: 6 }).dedupeKey).toBe(flag({ hoursQuiet: 18 }).dedupeKey);
  });

  it("still names the duration where a human reads it", () => {
    expect(flag({ hoursQuiet: 18 }).title).toContain("~18h");
  });

  it("is filed on the pipeline and at high severity, never on a company", () => {
    expect(flag().entityName).toBe("Meeting intake");
    expect(flag().severity).toBe("high");
  });

  // Q84 inc.137 — the corrected row is the ONLY row, so anything the detail omits is gone.
  it("says nothing about a count on a first escalation", () => {
    expect(flag().detail).not.toContain("escalation");
  });

  it("names the repeat count, which the single corrected row cannot otherwise carry", () => {
    expect(silenceFlag(
      { hoursQuiet: 18, since: T0, outcome: "OFFLINE", everSucceeded: true },
      { escalations: 3 },
    ).detail).toContain("escalation 3");
  });

  it("names undelivered earlier windows as SEPARATE outages, not as this one worsening", () => {
    const detail = silenceFlag(
      { hoursQuiet: 7, since: T0, outcome: "OFFLINE", everSucceeded: true },
      { priorWindows: [{ hoursQuiet: 9, since: T0 - 86_400_000 }] },
    ).detail;
    expect(detail).toContain("NEVER DELIVERED");
    expect(detail).toContain("~9h");
    expect(detail).toContain("separate outages");
  });

  // Q84 inc.138 — the cap discards DESCRIPTIONS; discarding the count as well would under-report
  // how many outages went undelivered, in the one row that is allowed to say so.
  it("counts the windows the cap dropped instead of reporting only what still fits", () => {
    const detail = silenceFlag(
      { hoursQuiet: 7, since: T0, outcome: "OFFLINE", everSucceeded: true },
      {
        priorWindows: [{ hoursQuiet: 9, since: T0 - 86_400_000 }],
        priorWindowsDropped: 3,
      },
    ).detail;
    expect(detail).toContain("4 earlier silent window(s)");
    expect(detail).toContain("3 older window(s) are counted here but no longer described");
  });

  it("says nothing about truncation when nothing was truncated", () => {
    const detail = silenceFlag(
      { hoursQuiet: 7, since: T0, outcome: "OFFLINE", everSucceeded: true },
      { priorWindows: [{ hoursQuiet: 9, since: T0 - 86_400_000 }] },
    ).detail;
    expect(detail).toContain("1 earlier silent window(s)");
    expect(detail).not.toContain("no longer described");
  });
});

describe("mergeSilenceQueue", () => {
  const args = (over = {}) => ({ hoursQuiet: 6, since: T0, outcome: "OFFLINE", everSucceeded: true, ...over });

  it("starts at one escalation and no history when the queue is empty", () => {
    expect(mergeSilenceQueue(null, args())).toEqual({
      v: 2,
      args: args(),
      escalations: 1,
      priorWindows: [],
      priorWindowsDropped: 0,
    });
  });

  it("counts up and keeps the NEWEST notice when the window is the same fact getting worse", () => {
    const first = mergeSilenceQueue(null, args());
    const second = mergeSilenceQueue(first, args({ hoursQuiet: 12 }));
    expect(second.escalations).toBe(2);
    expect(second.args.hoursQuiet).toBe(12);
    expect(second.priorWindows).toEqual([]);
  });

  it("preserves an undelivered escalation from a DIFFERENT window instead of dropping it", () => {
    // The queued one described an outage that ended (a success reset the clock) and never reached
    // the ledger. Overwriting it would delete the only record that stretch ever existed.
    const stale = mergeSilenceQueue(null, args({ hoursQuiet: 9, since: T0 - 86_400_000 }));
    const merged = mergeSilenceQueue(stale, args());
    expect(merged.escalations).toBe(1);
    expect(merged.priorWindows).toEqual([{ hoursQuiet: 9, since: T0 - 86_400_000 }]);
  });

  it("never asserts two unknown windows are the same window", () => {
    const stale = mergeSilenceQueue(null, args({ since: null, everSucceeded: false }));
    const merged = mergeSilenceQueue(stale, args({ since: null, everSucceeded: false }));
    expect(merged.escalations).toBe(1);
    expect(merged.priorWindows).toHaveLength(1);
  });

  it("caps carried windows so an unreachable ledger cannot grow the detail without bound", () => {
    let state = null;
    for (let i = 0; i < 9; i += 1) state = mergeSilenceQueue(state, args({ since: T0 + i * 1000 }));
    expect(state.priorWindows).toHaveLength(5);
    // The cap keeps the NEWEST losers, so the sentence describes the recent past, not the ancient.
    expect(state.priorWindows.at(-1).since).toBe(T0 + 7 * 1000);
    // Q84 inc.138: 8 windows lost their slot, 5 are still described — the other 3 are still COUNTED.
    expect(state.priorWindowsDropped).toBe(3);
    expect(silenceFlag(state.args, state).detail).toContain("8 earlier silent window(s)");
  });

  it("carries the dropped count across a same-window escalation, which only bumps the counter", () => {
    let state = null;
    for (let i = 0; i < 9; i += 1) state = mergeSilenceQueue(state, args({ since: T0 + i * 1000 }));
    const again = mergeSilenceQueue(state, args({ since: T0 + 8 * 1000, hoursQuiet: 20 }));
    expect(again.escalations).toBe(2);
    expect(again.priorWindowsDropped).toBe(3);
  });
});
