// Q63 leg (5) inc.8: the intake seam — an untrusted HTTP body becomes a submission,
// or is refused before it reaches the door. Pure. Decides NOTHING about whether a
// measurement may be stored; that is `planPhase2ReturnsWrite`'s job and it stays
// there (CR-3). This module answers exactly one narrower question: is there a
// submission-shaped thing here at all, and are its numbers numbers.
//
// WHY THIS EXISTS AT ALL. inc.1-inc.7 built the whole read path and the whole write
// path, and every one of them takes a `Phase2ReturnsSubmission` — an object whose
// numeric fields are already `number`. Nothing has ever handed it one from outside
// the process. The entry surface is a form, and **an HTML form posts strings**:
// `laborHoursSaved: "12"` is what a browser sends. `planPhase2ReturnsWrite`'s
// `usableNumber` is a `typeof v === "number"` check, so every field of every real
// submission would come back `bad_labor_hours_saved` — the door refusing correct
// measurements for being correctly typed by the browser. That is the gap, and it is
// a typing gap, not a judgement one, which is why the fix is a separate seam rather
// than a loosened predicate. Loosening `usableNumber` instead would let a string
// reach `phase2Guarantee`, where `hours * rate` on `"12"` silently produces a number
// and prints it under a money guarantee.
//
//   • AN EMPTY STRING IS NOT ZERO. This is the single line the module was shaped
//     around. `Number("")` is `0`, so the obvious coercion turns a field a human
//     LEFT BLANK into the claim *"we saved 0 hours"* — a measurement, stored,
//     attributed, dated, and indistinguishable on the page from one somebody took.
//     inc.1's rule is "zero is a measurement; absent is not", and a naive `Number()`
//     collapses exactly those two. Blank stays blank and the door refuses it as
//     missing, which is what it is. Same for whitespace-only.
//
//   • BOOLEANS NEVER COERCE. `Number(true)` is `1`. A `true` in a revenue field is a
//     malformed payload, not one dollar.
//
//   • A STRING THAT IS NOT A NUMBER IS PASSED THROUGH UNCHANGED, NOT REFUSED HERE.
//     `"twelve"` is handed to the door as-is so the door refuses it with its own
//     `bad_labor_hours_saved`. Refusing it here would be a second copy of the same
//     ruleset, and the copy is the one that drifts — a caller would then get two
//     different refusal vocabularies for the same bad field depending on which layer
//     caught it first.
//
//   • NUMBERS AND NULLS ARE UNTOUCHED. A caller that already sends JSON numbers (an
//     import, a test, a server-side call) passes through this seam unchanged, so
//     adding it cannot alter any behaviour inc.1-inc.7 proved.
//
//   • ONLY THE FOUR NUMERIC FIELDS ARE COERCED. `customerId`, `measuredBy`,
//     `measuredAt`, `revenueBasis`, `source` and `note` are strings on both sides and
//     are copied verbatim — the door already trims and validates them, and a second
//     trim here would just be somewhere else for the rules to disagree.
//
// A body that is not an object at all (`null`, an array, a string, a number) yields
// NO submission and a single typed refusal, because there is nothing to hand over —
// as distinct from an object whose fields are wrong, which the door must judge so
// the human gets the whole field-by-field list in one round trip.

import type { Phase2ReturnsSubmission } from "./phase2ReturnsWrite";

/** The one thing this seam can refuse on its own: there is no object here. */
export type Phase2ReturnsIntakeRefusal = "not_an_object";

export interface Phase2ReturnsIntakeResult {
  /** Ready for `planPhase2ReturnsWrite`. Absent only when `refusal` is set. */
  submission?: Phase2ReturnsSubmission;
  /** Set only when the body was not an object; field errors are the door's to name. */
  refusal?: Phase2ReturnsIntakeRefusal;
}

/**
 * A form/JSON scalar → a number, but ONLY when it unambiguously is one.
 *
 * Anything this returns unchanged is deliberately left for the door to judge, so
 * there is exactly one place in the codebase that decides what a usable measurement
 * component is.
 */
function coerceNumeric(v: unknown): unknown {
  if (typeof v !== "string") return v; // numbers, null, undefined, booleans, objects
  const trimmed = v.trim();
  if (trimmed === "") return v; // blank is absent, NEVER zero — see the header
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : v; // "twelve" goes to the door as "twelve"
}

/** The fields whose values arrive as strings from a form and must be numbers. */
const NUMERIC_FIELDS = [
  "laborHoursSaved",
  "laborCostPerHour",
  "revenueSincePhase2Start",
] as const;

/**
 * An untrusted request body → a submission the write door can judge.
 *
 * Note what this does NOT do: it does not validate, default, trim, or reject any
 * field. A submission it returns may still be refused entirely by
 * `planPhase2ReturnsWrite` — and that is the intended division. This seam only
 * removes the browser's string typing from between a real measurement and the door
 * that decides whether to store it.
 */
export function intakePhase2Returns(body: unknown): Phase2ReturnsIntakeResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { refusal: "not_an_object" };
  }

  const raw = body as Record<string, unknown>;
  const submission = { ...raw } as Record<string, unknown>;

  for (const field of NUMERIC_FIELDS) {
    if (field in raw) submission[field] = coerceNumeric(raw[field]);
  }

  return { submission: submission as unknown as Phase2ReturnsSubmission };
}
