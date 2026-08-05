/**
 * The seam between the `meeting-next-steps` scorer and the four-block surface (Q89).
 *
 * WHY THIS FILE EXISTS. `meetingIntel.ts` has honoured an external `rank` since inc.1 and has
 * said, in a comment, that the ranking "is being built in parallel" — a sentence that was true
 * when written and had gone stale by inc.11, which re-asserted the dependency as absent. It is
 * not absent: `~/.claude/skills/meeting-next-steps/scripts/score_next_steps.py` and the
 * `meeting-strategist` agent both exist on disk. Nothing consumed them, so every block on
 * every company still shipped in source order. This module is the missing conversion, and
 * only that.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — the same line meetingIntel draws, held one layer out:
 *   - It does not rank. It carries `rank` across from the scorer's `ranked[]` position.
 *     If the scorer did not rank an item, it arrives unranked and the block says so.
 *   - It does not score, re-weight, or break ties. The scorer's order IS the order; ties
 *     already broke on `id` inside the scorer so two runs agree byte for byte.
 *   - It does not validate provenance. `buildMeetingIntel` owns that gate, and routing a
 *     candidate around it here would be a second, weaker gate on the same claim.
 *   - It does not rewrite text. A pain point crosses this boundary as the scorer's `quote`,
 *     unedited — the whole point of the verbatim rule is that nothing between the transcript
 *     and the screen gets to improve the sentence.
 *
 * CONSTRAINTS ARE NOT ACTIONS. The scorer returns `constraints[]` separately and forbids one
 * from taking the #1 slot (its gate G). A travel window is not something to do, so constraints
 * are not mapped into the action-items block at all rather than mapped and sorted downward.
 *
 * Contract: ~/.claude/skills/meeting-next-steps/references/output-contract.md §5.
 */

import type { IntelCandidate } from "./meetingIntel";

/** The scorer's `ranked[]` / `constraints[]` row, narrowed to the fields this seam reads. */
export type ScoredItem = {
  id: string;
  kind: "action" | "constraint";
  title: string;
  source_line: string;
  owner?: string;
  owner_side?: string;
  /** 1..n within `ranked[]`; null on constraints, which the scorer never ranks. */
  rank?: number | null;
};

export type ScoredPainPoint = {
  quote: string;
  speaker: string;
  speaker_side: string;
};

export type ScoredTalkingPoint = { point: string; why?: string; source_line: string };
export type ScoredBenefit = { benefit: string; type?: string; source_line: string };

/** The scorer result object (§5), narrowed to what the four blocks render. */
export type NextStepsResult = {
  meeting?: { source?: string };
  ranked?: ScoredItem[];
  constraints?: ScoredItem[];
  pain_points?: ScoredPainPoint[];
  talking_points?: ScoredTalkingPoint[];
  benefits_to_us?: ScoredBenefit[];
};

export type AdapterOptions = {
  /** The meeting these items belong to. Required — an item with no meeting has no address. */
  meetingId: string;
  /** Stamped onto provenance only on cross-company surfaces (the Overview). See Provenance.context. */
  context?: string;
  /** Deep link to the meeting record, when one exists. Never fabricated. */
  url?: string;
};

/**
 * The address WITHIN the meeting. The scorer guarantees `source_line` is literally present in
 * the transcript it was checked against (its gate A), so the line itself is the most precise
 * address this seam can honestly produce — it is what a human greps for. `id` prefixes it so
 * two items quoting the same line are still separately checkable.
 */
function refFor(item: { id: string }): string {
  return `next-steps:${item.id}`;
}

/**
 * `owner` is rendered only when the scorer resolved it. The literal "UNRESOLVED" is the
 * scorer's way of saying it looked and could not tell (its gate B) — passing that string
 * through as a name would put the word UNRESOLVED on screen as if it were a person.
 */
function ownerOf(item: ScoredItem): string | undefined {
  const owner = item.owner?.trim();
  if (!owner || owner.toUpperCase().startsWith("UNRESOLVED")) return undefined;
  return owner;
}

/**
 * Actions → the Action Items block, carrying the scorer's rank.
 *
 * A row the scorer left unranked stays unranked here. `buildMeetingIntel` renders a block as
 * "ranked" only when EVERY item carried one, so a partial ranking correctly degrades the whole
 * block to source order rather than showing Rob a 1,2,4 that looks complete.
 */
export function actionCandidates(result: NextStepsResult, opts: AdapterOptions): IntelCandidate[] {
  return (result.ranked ?? [])
    .filter((item) => item.kind === "action")
    .map((item) => ({
      kind: "action-items" as const,
      text: item.title,
      owner: ownerOf(item),
      rank: typeof item.rank === "number" ? item.rank : undefined,
      provenance: {
        meetingId: opts.meetingId,
        sourceRef: refFor(item),
        excerpt: item.source_line,
        url: opts.url,
        context: opts.context,
      },
    }));
}

/**
 * Pain points → their own block, quote untouched.
 *
 * The scorer already refuses a pain whose `speaker_side` is not "them" (its gate E). This seam
 * re-applies that filter rather than trusting it: the two gates guard the same failure at
 * different distances from the screen, and the one nearer the screen is the one that has to
 * hold when a caller hand-builds a result object instead of running the scorer.
 */
export function painCandidates(result: NextStepsResult, opts: AdapterOptions): IntelCandidate[] {
  return (result.pain_points ?? [])
    .filter((p) => p.speaker_side === "them")
    .map((p) => ({
      kind: "pain-points" as const,
      text: p.quote,
      owner: p.speaker,
      provenance: {
        meetingId: opts.meetingId,
        sourceRef: `next-steps:pain:${p.speaker}`,
        // The quote IS the excerpt: meetingIntel checks text against excerpt, and the scorer
        // already checked this quote against the transcript. Passing anything else here would
        // make the two checks disagree about what "verbatim" means.
        excerpt: p.quote,
        url: opts.url,
        context: opts.context,
      },
    }));
}

export function talkingPointCandidates(
  result: NextStepsResult,
  opts: AdapterOptions,
): IntelCandidate[] {
  return (result.talking_points ?? []).map((t, i) => ({
    kind: "talking-points" as const,
    text: t.point,
    provenance: {
      meetingId: opts.meetingId,
      sourceRef: `next-steps:talking:${i + 1}`,
      excerpt: t.source_line,
      url: opts.url,
      context: opts.context,
    },
  }));
}

export function benefitCandidates(result: NextStepsResult, opts: AdapterOptions): IntelCandidate[] {
  return (result.benefits_to_us ?? []).map((b, i) => ({
    kind: "benefits-us" as const,
    text: b.benefit,
    provenance: {
      meetingId: opts.meetingId,
      sourceRef: `next-steps:benefit:${i + 1}`,
      excerpt: b.source_line,
      url: opts.url,
      context: opts.context,
    },
  }));
}

/**
 * All four blocks' candidates, in the order the contract renders them (§6).
 * Feed straight into `buildMeetingIntel` — this function never calls it, so the gate stays
 * one thing in one place and a caller can inspect what is about to be gated.
 */
export function candidatesFromNextSteps(
  result: NextStepsResult,
  opts: AdapterOptions,
): IntelCandidate[] {
  return [
    ...actionCandidates(result, opts),
    ...talkingPointCandidates(result, opts),
    ...painCandidates(result, opts),
    ...benefitCandidates(result, opts),
  ];
}
