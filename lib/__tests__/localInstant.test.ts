import { describe, expect, it } from "vitest";
import { localDateTimeToIsoInstant } from "../phases/localInstant";

// Q63 leg (5) inc.13. The offset is injected, so every case below is proven without the
// suite running in the zone it describes — which is the point of taking it as a param.

describe("localDateTimeToIsoInstant", () => {
  // THE DEFECT, PINNED. This exact value parsed on a UTC server yields 21:30Z; the
  // moment the measurer meant is the next calendar day. If this ever goes back to
  // 2026-07-28, the guarantee's "day N of 91" is counting the wrong day again.
  it("carries an evening Eastern entry across the UTC date boundary", () => {
    expect(localDateTimeToIsoInstant("2026-07-28T21:30", 240)).toBe(
      "2026-07-29T01:30:00.000Z",
    );
  });

  it("converts a western offset (Pacific Daylight, +7h to UTC)", () => {
    expect(localDateTimeToIsoInstant("2026-07-28T09:00", 420)).toBe(
      "2026-07-28T16:00:00.000Z",
    );
  });

  // Negative offset — east of UTC, where the instant moves BACKWARD. India is the
  // half-hour case that a whole-hour implementation would silently round away.
  it("converts a negative half-hour offset (IST)", () => {
    expect(localDateTimeToIsoInstant("2026-07-29T05:00", -330)).toBe(
      "2026-07-28T23:30:00.000Z",
    );
  });

  // DST is the caller's job precisely BECAUSE it is per-value: the same browser reports
  // a different offset for January than for July. Both are honoured here.
  it("honours the offset it is given rather than a zone's annual default", () => {
    expect(localDateTimeToIsoInstant("2026-01-15T21:30", 300)).toBe(
      "2026-01-16T02:30:00.000Z",
    );
    expect(localDateTimeToIsoInstant("2026-07-15T21:30", 240)).toBe(
      "2026-07-16T01:30:00.000Z",
    );
  });

  it("accepts the optional seconds some browsers append", () => {
    expect(localDateTimeToIsoInstant("2026-07-28T21:30:45", 240)).toBe(
      "2026-07-29T01:30:45.000Z",
    );
  });

  it("passes through a value that already carries a zone, untouched", () => {
    expect(localDateTimeToIsoInstant("2026-07-29T01:30:00.000Z", 240)).toBe(
      "2026-07-29T01:30:00.000Z",
    );
    expect(localDateTimeToIsoInstant("2026-07-28T21:30-04:00", 999)).toBe(
      "2026-07-28T21:30-04:00",
    );
  });

  // UTC itself must be a no-op, or the fix would move instants that were already right.
  it("is identity at offset zero", () => {
    expect(localDateTimeToIsoInstant("2026-07-28T21:30", 0)).toBe(
      "2026-07-28T21:30:00.000Z",
    );
  });

  // NULL IS NOT A REFUSAL. Every case here means "nothing to supply" — the caller sends
  // the raw value on and the door is what says it is unusable. No message is produced
  // in the browser, so there is no second vocabulary to drift from the door's.
  it("returns null for anything it cannot complete, without judging it", () => {
    expect(localDateTimeToIsoInstant("", 240)).toBeNull();
    expect(localDateTimeToIsoInstant("   ", 240)).toBeNull();
    expect(localDateTimeToIsoInstant("last tuesday", 240)).toBeNull();
    expect(localDateTimeToIsoInstant("2026-07-28", 240)).toBeNull(); // date, no time
    expect(localDateTimeToIsoInstant("2026-07-28T21", 240)).toBeNull(); // half typed
    expect(localDateTimeToIsoInstant("2026-07-28T21:30", Number.NaN)).toBeNull();
  });

  // Date.UTC ROLLS overflow instead of rejecting it, so month 13 would become January
  // of the next year — a real-looking instant nobody typed. Caught by round-tripping.
  it("refuses an impossible date rather than rolling it", () => {
    expect(localDateTimeToIsoInstant("2026-13-01T10:00", 0)).toBeNull();
    expect(localDateTimeToIsoInstant("2026-02-30T10:00", 0)).toBeNull();
    expect(localDateTimeToIsoInstant("2026-07-28T25:00", 0)).toBeNull();
  });

  it("keeps a real leap day", () => {
    expect(localDateTimeToIsoInstant("2028-02-29T12:00", 0)).toBe(
      "2028-02-29T12:00:00.000Z",
    );
  });
});
