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

import type { DriftReport, StatusDrift } from "./networkStatus";

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

export interface DriftMark {
  tone: BadgeTone;
  /** Fits beside a status chip in a table row. Two words, no punctuation. */
  label: string;
  /** Hover text — the same sentence the record page prints, never a shorter claim. */
  title: string;
}

/**
 * The row-level form of the same finding (Q91(a), ledger tables).
 *
 * A table row has no space for the evidence list, so the mark carries the verdict and
 * defers the proof to the record page. What it may NOT do is upgrade the claim to fit
 * the space: the label is derived from the same `tone`, and the hover text is the
 * badge's own `detail` verbatim. An overstated row says "worth a look" here exactly as
 * it does there — a table full of red dots would read as a list of errors, and the
 * overstated ones are not errors.
 */
export function driftMark(drift: StatusDrift): DriftMark {
  const badge = driftBadge(drift);
  return {
    tone: badge.tone,
    label: badge.tone === "correctable" ? `should be ${drift.justified}` : "worth a look",
    title: badge.detail,
  };
}

export interface DriftSummary {
  /** Records the ladder can prove wrong. Same gate as the `correctable` badge tone. */
  correctable: number;
  /** Records that merely disagree. Never called wrong, here or anywhere else. */
  review: number;
  /** Orgs whose drift was WITHHELD because the book records no membership (Q91(c)). */
  withheld: number;
  /** The Overview line. Null when the book has nothing to report — then print nothing. */
  line: string | null;
}

/**
 * The book-level count for the Overview (Q91(a), the last line of its DoD).
 *
 * Two rules it exists to keep:
 *
 *  1. **It counts by asking `driftBadge`, not by reading `assertable`.** The tables and
 *     the record pages decide "is this an error or a look?" through that function; a
 *     second copy of the test here would be free to drift from them, and the Overview
 *     would then total something no page prints. One arbiter, consumed twice.
 *
 *  2. **Withheld rows are counted, never folded in.** `driftReport` suppresses
 *     overstated org drift when the book has no membership to judge it by, and a
 *     summary that only added `items.length` would report those as *agreement*. The
 *     book cannot answer for them — which is a different thing from "they are fine",
 *     and the one the Overview must not blur.
 */
export function driftSummary(report: DriftReport): DriftSummary {
  let correctable = 0;
  let review = 0;
  for (const item of report.items) {
    if (driftBadge(item.drift).tone === "correctable") correctable++;
    else review++;
  }
  const withheld = report.withheldForMissingMembership.length;

  const parts: string[] = [];
  if (correctable > 0) {
    // Indicative, matching the record page: these are contradicted by fields they hold.
    parts.push(correctable === 1 ? "1 record contradicts its own fields" : `${correctable} records contradict their own fields`);
  }
  if (review > 0) {
    parts.push(`${review} worth a look`);
  }
  if (withheld > 0) {
    parts.push(withheld === 1 ? "1 org this book cannot judge" : `${withheld} orgs this book cannot judge`);
  }

  return { correctable, review, withheld, line: parts.length > 0 ? parts.join(" · ") : null };
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

  // Not assertable. TWO different situations land here and they read as opposites, so
  // one sentence cannot serve both — found on PROD, on C-2019 Omega Title, the exact
  // record Rob asked about in dev_chat #58. Since inc.32 added the referral rung,
  // `assertable` requires `understated && provable`, which means an UNDERSTATED record
  // can fall through to this branch. The overstated copy then printed backwards about
  // it: "the fields here only justify lit … unlit also covers a relationship the
  // columns do not hold" — about a record stored BELOW what its fields show.
  if (drift.kind === "understated") {
    return {
      tone: "review",
      headline: "Worth a look",
      // Says what the record shows and stops. The referral rung may defend a status,
      // never accuse one, so this must not slide into "should be" (networkStatus.ts).
      detail: `Stored as ${drift.stored}; the record also shows ${drift.reason}, which can justify ${drift.justified}. Not proof on its own, so nothing here is called wrong.`,
      evidenceLabel,
    };
  }

  // Overstated. The stored value may be right for a reason no column holds — warmth
  // with no artifact at all, "personally close", which nothing in the schema records.
  return {
    tone: "review",
    headline: "Worth a look",
    detail: `Stored as ${drift.stored}; the fields here only justify ${drift.justified} (${drift.reason}). Not necessarily wrong — ${drift.stored} also covers a relationship the columns do not hold.`,
    evidenceLabel,
  };
}
