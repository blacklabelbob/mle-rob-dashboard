// Q91(a) — the wording of the badge, kept out of the component.
//
// `lib/networkStatus.ts` decides WHETHER a record disagrees with itself and in which
// direction. This module decides what that disagreement is allowed to SAY on screen,
// and it is pure so the sentence Rob reads can be pinned by a test rather than
// re-read off a rendered page (CR-3).
//
// The asymmetry from networkStatus.ts survives all the way to the pixel, because it
// is the whole point: an understated record is provably wrong against the definitions
// in lib/types.ts:4-7, an overstated one is only unproven. So understated speaks in
// the indicative ("should be warm") and overstated may only invite a look ("worth a
// look") — never "wrong", never an error tone. A badge that called Gulf Coast an
// error for being lit while referring work would be the module lying with confidence.

import type { StatusDrift } from "./networkStatus";

export type BadgeTone = "correctable" | "review";

export interface DriftBadge {
  tone: BadgeTone;
  /** The line beside the status chip. Short enough to sit on one row. */
  headline: string;
  /** The sentence under it, naming the field that decided it. */
  detail: string;
  /** Label on the disclosure that opens the raw evidence. */
  evidenceLabel: string;
}

export function driftBadge(drift: StatusDrift): DriftBadge {
  const n = drift.evidence.length;
  const evidenceLabel = n === 1 ? "1 fact on the record" : `${n} facts on the record`;

  if (drift.assertable) {
    return {
      tone: "correctable",
      headline: `Should be ${drift.justified}`,
      // Em dash, not "but this record is …": `reason` comes in two grammatical shapes
      // — a bare fact ("quoted $7,000") and a clause ("a person here was met 2026-07-28")
      // — and the first template only read correctly for one of them. Caught on prod:
      // "Stored as unlit, but this record is a person here was met 2026-07-28."
      detail: `Stored as ${drift.stored} — ${drift.reason}.`,
      evidenceLabel,
    };
  }

  // Overstated. The stored value may be right for a reason no column holds — `lit`
  // also means "actively referring", and nothing on the record records a referral.
  return {
    tone: "review",
    headline: "Worth a look",
    detail: `Stored as ${drift.stored}; the fields here only justify ${drift.justified} (${drift.reason}). Not necessarily wrong — ${drift.stored} also covers a relationship the columns do not hold.`,
    evidenceLabel,
  };
}
