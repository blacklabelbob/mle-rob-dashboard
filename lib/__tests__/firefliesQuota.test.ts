import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs helper, shared with scripts/fireflies-ingest.mjs
import { EXIT_QUOTA, parseRateLimit, cooldownState, cooldownNotice } from "../../scripts/fireflies-quota.mjs";

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
