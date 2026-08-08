// Q86 inc.43 — DoD (b). The call date, bounded by evidence instead of guessed.
//
// WHY THIS MODULE EXISTS. `planTranscriptActivity` refusal 3 says: no day → no draft, because the
// transcript header carries the day it was TRANSCRIBED (2026-07-28 for all three local transcripts),
// which is not the day the call happened. Three increments have now ended on that refusal. The
// temptation is to reach for the nearest date-shaped string and move on; that would write a wrong
// `occurredAt` into the one field a wrong value is unrecoverable in.
//
// So this module does the opposite of guessing: it computes the WINDOW the evidence actually
// supports, and it resolves to a single day ONLY when the window holds exactly one. Everything else
// comes back unresolved with the window printed, so the next reader starts from the constraint
// rather than from scratch.
//
// THE TWO EVIDENCE SOURCES, and what each is worth:
//
//   1. THE UPLOAD DAY IS A HARD UPPER BOUND. A recording cannot reach Drive before the call it
//      records. `drive-drain-2026-08-08.json` carries Drive's own `createdTime` per file, and for
//      `Call with John Burns.m4a` that is 2026-07-10T03:20:03Z = **2026-07-09 23:20 America/New_York**.
//      This is proof, not inference: the call is on or before 2026-07-09.
//   2. THE WEEKDAYS THE SPEAKERS PLACE IN THE FUTURE ARE A LOWER BOUND WITHIN THE WEEK. When both
//      parties are negotiating "Thursday or Friday" as days still to come, the call is before
//      Thursday. This is strong but NOT proof, because it rests on one assumption — that the week
//      they are talking about is the week the file was uploaded. That assumption is named in the
//      output rather than hidden in the arithmetic (see `assumptions`).
//
// PURE per CR-3 — no clock, no fs, no network. Every input is an argument, `uploadedOn` included.
// A module that called `new Date()` here would produce a different answer next week for the same
// call, which is the whole failure mode.

/** Monday-first, because a working week is what the speakers are negotiating inside. */
const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Deterministic day arithmetic on `YYYY-MM-DD` — UTC only, so no local zone can shift a day. */
function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const MS_PER_DAY = 86_400_000;

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7;
}

export function weekdayName(day: string): Weekday {
  return WEEKDAYS[weekdayIndex(day)];
}

export type CallWindowInput = {
  /** The transcript this window is about, so an unresolved answer is still addressable. */
  ref: string;
  /**
   * The LOCAL calendar day the recording was uploaded, `YYYY-MM-DD`. The caller converts the
   * upload instant to Rob's zone — this module will not, because guessing a zone here would move
   * a late-night upload a day and silently widen the window.
   */
  uploadedOn: string;
  /**
   * Weekdays the speakers place in the FUTURE ("Friday looks pretty good", "Thursday or Friday").
   * Unrecognised names are ignored rather than throwing: a mishearing in a transcript must not be
   * able to crash the reader that is trying to date it.
   */
  futureWeekdays?: readonly string[];
};

export type CallWindow = {
  ref: string;
  /** Proof-backed: the call cannot be after this day. */
  latestPossible: string;
  /** The Monday of `uploadedOn`'s week — where the assumption below starts. */
  weekStart: string;
  /** Every day the evidence leaves standing, ascending. */
  candidates: string[];
  /** True only when `candidates` holds exactly one day. */
  resolved: boolean;
  /** The day, when and only when it is resolved. Never a "best guess". */
  day: string | null;
  /** Stated in the result so a caller cannot inherit them silently. */
  assumptions: string[];
  why: string;
};

/**
 * Bound the day a recorded call happened.
 *
 * Returns the window, never a guess. `resolved` is true only when one day survives; a caller that
 * wants an `occurredAt` must check it, and `planTranscriptActivity` refuses without one.
 */
export function boundCallDate(input: CallWindowInput): CallWindow {
  const ref = input.ref.trim();
  const uploadedOn = input.uploadedOn.trim();
  if (!DAY.test(uploadedOn)) {
    throw new Error(`boundCallDate: uploadedOn must be YYYY-MM-DD, got ${JSON.stringify(uploadedOn)}`);
  }

  const uploadMs = toUtc(uploadedOn);
  const weekStartMs = uploadMs - weekdayIndex(uploadedOn) * MS_PER_DAY;
  const weekStart = fromUtc(weekStartMs);

  const named = (input.futureWeekdays ?? [])
    .map((w) => WEEKDAYS.indexOf(w.trim().toLowerCase() as Weekday))
    .filter((i) => i >= 0);
  // The EARLIEST future weekday is the binding one: if Thursday is still ahead, so is Friday.
  const earliestFuture = named.length > 0 ? Math.min(...named) : null;

  const candidates: string[] = [];
  for (let i = 0; i <= weekdayIndex(uploadedOn); i += 1) {
    if (earliestFuture !== null && i >= earliestFuture) continue;
    candidates.push(fromUtc(weekStartMs + i * MS_PER_DAY));
  }

  const assumptions: string[] = [];
  if (earliestFuture !== null) {
    assumptions.push(
      `the week the speakers are negotiating ("${WEEKDAYS[earliestFuture]}" still ahead) is the week the recording was uploaded — strong, but not proven`,
    );
  } else {
    assumptions.push(
      "no weekday was placed in the future by either speaker, so nothing narrows the week below the upload day",
    );
  }

  const resolved = candidates.length === 1;
  const why = resolved
    ? `${ref}: one day survives — uploaded ${uploadedOn} (${weekdayName(uploadedOn)}), and the speakers place ${earliestFuture === null ? "nothing" : WEEKDAYS[earliestFuture]} onward in the future`
    : candidates.length === 0
      ? `${ref}: the evidence contradicts itself — every day of the upload week is ruled out, which means the negotiated week is NOT the upload week`
      : `${ref}: ${candidates.length} days survive (${candidates[0]} … ${candidates[candidates.length - 1]}). Upload on ${uploadedOn} is a hard ceiling; the weekday talk narrows it no further. Resolving this needs a source the transcript does not carry — a phone log, or Rob`;

  return { ref, latestPossible: uploadedOn, weekStart, candidates, resolved, day: resolved ? candidates[0] : null, assumptions, why };
}
