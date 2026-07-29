// Q63 leg (5) inc.13: THE OFFSET THE BROWSER IS THE ONLY ONE WHO KNOWS.
//
// THE DEFECT THIS EXISTS TO CLOSE. `<input type="datetime-local">` yields a wall-clock
// string with NO zone — `"2026-07-28T21:30"`. Per ES2020, a date-time form without a
// zone designator is interpreted in the RUNTIME's zone, and the runtime that parses it
// is a Vercel function running in UTC. So a measurer in Eastern typing 9:30pm has that
// instant recorded as `21:30Z` — 5:30pm their own time, on 7/28 — when the moment they
// meant was `2026-07-29T01:30Z`, the NEXT DAY. Verified, not assumed:
//   TZ=UTC        Date.parse("2026-07-28T21:30") -> 2026-07-28T21:30:00.000Z
//   TZ=America/NY Date.parse("2026-07-28T21:30") -> 2026-07-29T01:30:00.000Z
//
// WHY THAT IS A CORRECTNESS BUG AND NOT A COSMETIC ONE, twice over:
//   1. The guarantee PRO-RATES BY DAYS ELAPSED (`(investment ÷ 91) × daysElapsed`) and
//      says "day N of 91" on screen. Every evening entry east of UTC lands on the wrong
//      calendar day, so the target it is measured against is the wrong target.
//   2. `phase2_returns_identity` is (customer, measured_at). Correcting a measurement is
//      an UPSERT on that instant — which only works if the same moment produces the same
//      key. Two people in two zones recording the same moment write TWO ROWS, and the
//      correction that was supposed to replace a number silently sits beside it.
//
// WHY IT IS FIXED HERE AND NOT AT THE DOOR. `planPhase2ReturnsWrite` owns every rule
// about what a usable measurement is, and this file adds none — it does not validate,
// refuse, or default anything. It supplies a FACT the door cannot obtain: the UTC offset
// in effect at the measurer's location, for that particular date. A server has no access
// to it at all; by the time the body arrives, the information is already gone. This is
// inc.8's seam one layer further out — inc.8 removed the browser's string TYPING from
// between a measurement and the door, this removes the browser's missing ZONE.
//
// PURE, AND THE OFFSET IS A PARAMETER (CR-3). No clock, no ambient `TZ`, no
// `getTimezoneOffset()` read inside. The caller passes the offset for the specific
// datetime being converted — which is what makes DST correct: a value in January and a
// value in July are different offsets in the same browser, and only a per-value read
// gets that right. Injected also means the test suite proves the arithmetic in every
// zone without running in one.

/** Wall-clock with no zone: `YYYY-MM-DDTHH:MM` and the optional `:SS` browsers may add. */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Already carries a zone — `…Z` or `…+05:30` / `…-0800`. Nothing to supply. */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A zone-less wall-clock string + the UTC offset in force for it → a true ISO instant.
 *
 * @param value          the raw field value, exactly as the input produced it
 * @param offsetMinutes  `Date#getTimezoneOffset()` semantics — minutes to ADD to local
 *                       time to reach UTC (Eastern Daylight = 240, IST = -330)
 *
 * Returns `null` for anything that is not a zone-less wall-clock this can complete —
 * empty, free text, a half-typed date. That is NOT a refusal and carries no message: the
 * caller sends the value onward untouched and the DOOR says what is wrong with it, so no
 * vocabulary about bad dates is ever born in the browser. A value that already carries a
 * zone is returned as given for the same reason — it needs nothing from here.
 */
export function localDateTimeToIsoInstant(
  value: string,
  offsetMinutes: number,
): string | null {
  const raw = value.trim();
  if (raw === "") return null;
  if (HAS_ZONE.test(raw)) return raw;

  const m = LOCAL_DATETIME.exec(raw);
  if (!m) return null;
  if (!Number.isFinite(offsetMinutes)) return null;

  const [, y, mo, d, hh, mi, ss] = m;
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mi),
    ss === undefined ? 0 : Number(ss),
  );
  // The offset moves local -> UTC, which is the direction getTimezoneOffset() reports.
  const ms = utcMs + offsetMinutes * 60_000;
  if (!Number.isFinite(ms)) return null;

  // `Date.UTC` rolls overflow (month 13, day 32) rather than rejecting it, so a
  // structurally-valid-but-impossible date is caught by comparing what came back.
  const back = new Date(utcMs);
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(mo) - 1 ||
    back.getUTCDate() !== Number(d) ||
    back.getUTCHours() !== Number(hh) ||
    back.getUTCMinutes() !== Number(mi)
  ) {
    return null;
  }

  return new Date(ms).toISOString();
}
