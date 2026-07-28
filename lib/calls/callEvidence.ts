// BUILD-QUEUE Q68 inc.45 — THE OTHER HALF OF THE ARMING REPORT: has a call EVER run?
//
// inc.21–22 and inc.43 answer *how far would the NEXT call get* — env presence, nothing
// else, and `proven` typed as the literal `false` so no arrangement of keys could ever
// masquerade as evidence. That was right, and it left the DoD's actual question with no
// owner: "a real recorded call appears on the contact timeline with a summary" is a claim
// about calls that HAVE happened, and forty-four increments have answered it from memory —
// every one of them writing "no call has run" into the queue by copying the last one.
//
// inc.44 caught exactly that pattern on the env side (the ask had been wrong for two days
// because it was hand-copied rather than read). This is the same fix aimed at the other
// half: the counts come from the store, and the verdict is derived from them.
//
// NO CLOCK, NO NETWORK, NO STORE (CR-3). Counts in, verdict out.
//
// It never diagnoses. `filed: 0` is reported as "no call has ever been filed" and nothing
// more — a webhook answering 503 and a dashboard nobody has dialled yet produce the same
// zero, and only the env report can tell them apart. Guessing between them here is how an
// operator goes hunting for a broken key on a system that was simply never used.

import type { Activity } from "@/lib/types";

export interface CallEvidenceCounts {
  /** `dialer` call activities on the timeline. */
  filed: number;
  /** Of those, the ones a transcript exists for. */
  transcribed: number;
  /** Of those, the ones carrying a non-empty summary. */
  summarised: number;
}

/**
 * The furthest ANY real call has actually got. Same four rungs as `ChainReach`
 * (callReadiness) deliberately — one vocabulary for "would reach" and "has reached", so
 * the two halves of the report can be read side by side without translation.
 */
export type EvidenceReach = "none" | "timeline" | "words" | "summary";

export interface CallEvidence {
  reach: EvidenceReach;
  counts: CallEvidenceCounts;
  /**
   * The ONLY place in this feature allowed to be `true`. It is the DoD's shape and
   * nothing weaker: a filed call is not proof, a transcript is not proof — a summary on a
   * real call is. Contradicted counts (below) can never produce it.
   */
  proven: boolean;
  /**
   * Impossible orderings, REPORTED AND NEVER REPAIRED. Summaries are written from words
   * (summaryPass) and words from filed calls, so `summarised > transcribed` means something
   * put a summary on a call with no transcript behind it — which is the fabricated-summary
   * shape this whole feature refuses. Quietly clamping it to a legal number would hide the
   * one signal that says so.
   */
  contradictions: string[];
  headline: string;
}

const HEADLINES: Record<EvidenceReach, string> = {
  none: "No recorded call has ever been filed. This says nothing about why — the arming report does.",
  timeline: "Calls are on the timeline. None has ever been transcribed.",
  words: "Calls have been transcribed. None has ever been summarised.",
  summary: "A real call has reached a summary.",
};

/**
 * Counts from what the store actually holds.
 *
 * `transcribedActivityIds` is passed in rather than read off the activity: `transcriptUrl`
 * is a legacy field (lib/types) and a call whose transcript lives in 0021 carries none, so
 * trusting it would report every real transcript as missing.
 *
 * A summary of whitespace is NOT a summary. An empty-string guard alone would let a single
 * space — the shape a half-written patch leaves behind — count as the DoD being met.
 */
export function evidenceCountsFromActivities(
  activities: readonly Activity[],
  transcribedActivityIds: ReadonlySet<string>,
): CallEvidenceCounts {
  const calls = activities.filter((a) => a.source === "dialer" && a.type === "call");
  return {
    filed: calls.length,
    transcribed: calls.filter((a) => transcribedActivityIds.has(a.id)).length,
    summarised: calls.filter((a) => (a.summary ?? "").trim().length > 0).length,
  };
}

export function callEvidence(counts: CallEvidenceCounts): CallEvidence {
  const contradictions: string[] = [];
  for (const [key, value] of Object.entries(counts)) {
    // A negative or fractional count is a broken read, not a small number. Left to flow
    // through, `filed: -1` would compare as "fewer than transcribed" and produce a
    // contradiction sentence about the wrong pair.
    if (!Number.isInteger(value) || value < 0) {
      contradictions.push(`${key} is not a count (${value}).`);
    }
  }
  if (counts.transcribed > counts.filed) {
    contradictions.push(
      `transcribed (${counts.transcribed}) exceeds filed (${counts.filed}): a transcript exists for a call that is not on the timeline.`,
    );
  }
  if (counts.summarised > counts.transcribed) {
    contradictions.push(
      `summarised (${counts.summarised}) exceeds transcribed (${counts.transcribed}): a summary exists for a call with no words behind it.`,
    );
  }

  // THE FURTHEST, NEVER THE AVERAGE. One summarised call proves the chain end to end even
  // if fifty older ones are wordless; a majority or a ratio would report a proven chain as
  // broken because most of its history predates the key that fixed it.
  const reach: EvidenceReach =
    counts.summarised > 0
      ? "summary"
      : counts.transcribed > 0
        ? "words"
        : counts.filed > 0
          ? "timeline"
          : "none";

  return {
    reach,
    counts,
    // Proof does not survive evidence that disagrees with itself. Counts alone cannot say
    // WHICH summary is the fabricated one, so a contradicted read yields no claim at all.
    proven: counts.summarised > 0 && contradictions.length === 0,
    contradictions,
    headline: HEADLINES[reach],
  };
}

/**
 * Counts and states only — no summary prose, no transcript text, no contact names. Same
 * discipline as `callReadinessLog`, for the same reason: whatever this returns lands in a
 * log line nobody access-controls.
 */
export function callEvidenceLog(evidence: CallEvidence) {
  return {
    evt: "calls.evidence",
    reach: evidence.reach,
    proven: evidence.proven,
    filed: evidence.counts.filed,
    transcribed: evidence.counts.transcribed,
    summarised: evidence.counts.summarised,
    contradictions: evidence.contradictions.length,
  };
}
