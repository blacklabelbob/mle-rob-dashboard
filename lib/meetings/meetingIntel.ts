/**
 * Q89 — the four blocks a meeting owes the company record and the Overview.
 *
 * Rob, 2026-08-05: *"Whats critical is to make sure all of this stuff is brought front and
 * center when you look at the overview in the CRM and when you look up the associated
 * Companies. You need to be pulling in Action items, Talking Points, pain points, like all of
 * that stuff. Also things that benefit us and how we can land this deal."*
 *
 * The 2026-07-28 Omega meeting has been mined three times and none of it renders where Rob
 * looks — it lives in `description` prose, in flag rows, and in a Notion page. This module is
 * the gate between "a meeting said something" and "a company page claims something", and it
 * exists because that gap is where the invented sentence gets in.
 *
 * THREE RULES, ENFORCED HERE IN CODE RATHER THAN ASKED FOR IN PROSE (CR-3):
 *
 * 1. NO PROVENANCE, NO RENDER. Every item carries the meeting it came from AND the line/block
 *    that produced it. An item that cannot be opened and checked is rejected, not shown. This
 *    is the whole Q84 discipline in one predicate: a field is a claim, never a finding.
 *
 * 2. PAIN POINTS ARE VERBATIM OR THEY ARE NOTHING. Rob's hard rule, and it is not a style
 *    note: the moment a pain is rewritten as "opportunity to streamline their workflow" it
 *    stops being the customer's words and becomes our pitch, and Rob loses the one sentence
 *    that sells. So a pain point must actually occur in the source excerpt it cites — a
 *    paraphrase is REJECTED and reported as a paraphrase. The benefit block does the selling;
 *    the pain block quotes.
 *
 * 3. AN EMPTY BLOCK RENDERS EMPTY, WITH THE REASON. Never a plausible sentence. And "empty
 *    because nothing was said" is a different fact from "empty because 3 candidates failed
 *    the provenance check" — the reason distinguishes them, so a silent drop is impossible.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: rank. The ranked next-step scoring lives in the
 * `meeting-next-steps` skill + `meeting-strategist` agent, both of which now EXIST (built
 * 2026-08-05; this comment said "being built in parallel" until Q89 inc.12, and that sentence
 * had gone stale — a blocker written in prose is stale the moment the tooling changes).
 * `nextStepsAdapter.ts` is the seam that carries their ranks in. This surface RENDERS their
 * output; growing a second ranking here would give Rob two orders that disagree. If a rank is
 * supplied it is honoured; if it is absent the block ships in SOURCE ORDER and says so. A rank
 * is never invented from length, recency, or keyword.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no filesystem.
 */

/** The four blocks, in the order Rob named them. */
export type IntelBlockKind =
  /** What was committed to, by whom, still open or done. */
  | "action-items"
  /** What to say next time — including what this counterparty already told us they care about. */
  | "talking-points"
  /** The counterparty's own words about what hurts. VERBATIM. Never our reading of it. */
  | "pain-points"
  /** The commercial read: why this is worth the work, and the concrete path to signature. */
  | "benefits-us";

export const INTEL_BLOCK_KINDS: readonly IntelBlockKind[] = [
  "action-items",
  "talking-points",
  "pain-points",
  "benefits-us",
] as const;

export const BLOCK_TITLES: Record<IntelBlockKind, string> = {
  "action-items": "Action Items",
  "talking-points": "Talking Points",
  "pain-points": "Pain Points — their words",
  "benefits-us": "What Benefits Us / How We Land This Deal",
};

/**
 * Where an item came from, precisely enough that a reader can open it and check.
 * `sourceRef` is the line/block inside the meeting — not just the meeting — because
 * "it's in the transcript somewhere" is not traceability.
 */
export type Provenance = {
  meetingId: string;
  /** Block id, line number, or timestamp. The address WITHIN the meeting. */
  sourceRef: string;
  /** The source text at that address. Required for pain points; it is what verbatim is checked against. */
  excerpt?: string;
  /** Deep link a human can click. Optional — its absence never fabricates one. */
  url?: string;
  /**
   * Q89 inc.4 — WHOSE record this came from, set only where one surface shows more than
   * one company (the Overview). It is part of the ADDRESS, never part of the claim: it
   * is stamped onto provenance rather than prefixed onto `text`, because the moment a
   * company name is glued into a pain point the sentence stops being the customer's
   * words. Absent on a single-company surface, where it would be noise.
   */
  context?: string;
};

export type IntelCandidate = {
  kind: IntelBlockKind;
  text: string;
  provenance?: Partial<Provenance>;
  /** Who committed to it (action items). Rendered only when known; never guessed from context. */
  owner?: string;
  status?: "open" | "done";
  /**
   * Rank supplied by `meeting-next-steps` / `meeting-strategist`. This module NEVER computes
   * one — an absent rank means "not ranked yet", which is a fact worth showing, not a gap to fill.
   */
  rank?: number;
};

export type IntelItem = Omit<IntelCandidate, "provenance"> & { provenance: Provenance };

export type RejectedCandidate = {
  candidate: IntelCandidate;
  /** Machine-readable so a caller can count classes; the message says it in English. */
  reason: "no-provenance" | "no-source-ref" | "paraphrased-pain" | "no-excerpt-to-check" | "empty-text";
  message: string;
};

export type IntelBlock = {
  kind: IntelBlockKind;
  title: string;
  items: IntelItem[];
  /** True when nothing survived. The UI renders the reason, never a placeholder sentence. */
  isEmpty: boolean;
  /** Why it is empty, or "" when it is not. Distinguishes "nothing said" from "nothing provable". */
  emptyReason: string;
  /** "ranked" only when every rendered item carried an external rank. Otherwise source order, stated. */
  ordering: "ranked" | "source-order";
  rejected: RejectedCandidate[];
};

export type MeetingIntel = {
  blocks: IntelBlock[];
  /** Every rejection across all four blocks. Nothing is dropped silently. */
  rejected: RejectedCandidate[];
  /** True when not one item survived anywhere — the surface still renders, with reasons. */
  isEmpty: boolean;
};

/** Whitespace and case are formatting, not words. Everything else must match. */
function normalizeForVerbatim(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Is this pain point the counterparty's own words, or ours?
 *
 * Verbatim means the claimed pain actually occurs in the source text it cites. A summary that
 * merely shares vocabulary with the excerpt is a paraphrase and fails — which is the point:
 * the failure mode Rob named is a pain quietly rewritten into a benefit, and that rewrite
 * always breaks the substring.
 */
export function isVerbatim(text: string, excerpt: string): boolean {
  const needle = normalizeForVerbatim(text);
  if (!needle) return false;
  return normalizeForVerbatim(excerpt).includes(needle);
}

/**
 * The address of an item, written the way a human checks it: the meeting, then the line
 * within it. Never a bare meeting id — "somewhere in that call" is what rule 1 rejects.
 * Returned as text so a caller with no deep link still shows something checkable.
 */
export function sourceLabel(p: Provenance): string {
  const address = `${p.meetingId} · ${p.sourceRef}`;
  // One label function, so a cross-company surface cannot grow a second way of writing
  // an address that drifts from this one. Context leads because that is the order a
  // human checks in: whose call, then which call, then which line.
  return p.context ? `${p.context} · ${address}` : address;
}

function validate(candidate: IntelCandidate): RejectedCandidate | IntelItem {
  const text = candidate.text?.trim() ?? "";
  if (!text) {
    return {
      candidate,
      reason: "empty-text",
      message: "Candidate had no text. An empty item is not a finding.",
    };
  }

  const p = candidate.provenance;
  if (!p?.meetingId) {
    return {
      candidate,
      reason: "no-provenance",
      message: `"${text.slice(0, 60)}…" cites no meeting. A claim on a company page must be openable.`,
    };
  }
  if (!p.sourceRef) {
    return {
      candidate,
      reason: "no-source-ref",
      message: `"${text.slice(0, 60)}…" names meeting ${p.meetingId} but no line within it. "Somewhere in the transcript" is not traceability.`,
    };
  }

  if (candidate.kind === "pain-points") {
    if (!p.excerpt) {
      return {
        candidate,
        reason: "no-excerpt-to-check",
        message: `Pain point at ${p.meetingId}#${p.sourceRef} carries no source excerpt, so "verbatim" cannot be checked. Unchecked is not shown.`,
      };
    }
    if (!isVerbatim(text, p.excerpt)) {
      return {
        candidate,
        reason: "paraphrased-pain",
        message: `Pain point at ${p.meetingId}#${p.sourceRef} does not occur in its own source excerpt — it is our wording, not theirs. Quote what was said and let the benefits block do the selling.`,
      };
    }
  }

  return {
    ...candidate,
    text,
    provenance: {
      meetingId: p.meetingId,
      sourceRef: p.sourceRef,
      // `context` (whose call this was) is carried through, not rebuilt away. It is
      // stamped upstream by `networkIntelFromActivities` and printed by `sourceLabel`,
      // and dropping it here left the cross-company Overview showing 22 action items
      // from three companies in one flat list addressed only by meeting id — on the
      // surface whose entire justification is provenance. Found by critic-rob 2026-08-05.
      ...(p.context ? { context: p.context } : {}),
      ...(p.excerpt ? { excerpt: p.excerpt } : {}),
      ...(p.url ? { url: p.url } : {}),
    },
  };
}

function isRejection(x: RejectedCandidate | IntelItem): x is RejectedCandidate {
  return "reason" in x && "candidate" in x;
}

function emptyReasonFor(kind: IntelBlockKind, rejected: RejectedCandidate[], sawAny: boolean): string {
  if (!sawAny) {
    return `Nothing in this meeting produced ${BLOCK_TITLES[kind]}. Not "none exist" — none were captured.`;
  }
  const counts = new Map<RejectedCandidate["reason"], number>();
  for (const r of rejected) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  const parts = [...counts.entries()].map(([reason, n]) => `${n} ${reason}`);
  return `${rejected.length} candidate${rejected.length === 1 ? "" : "s"} did not survive the check (${parts.join(", ")}). Shown empty on purpose rather than filled with an unprovable sentence.`;
}

/**
 * Assemble the four blocks from candidates.
 *
 * Order is the caller's order unless EVERY surviving item in a block carries an external
 * rank — a partly-ranked block stays in source order, because half a ranking read as a
 * ranking is worse than none.
 *
 * The ranks must also be DISTINCT. Two items sharing a rank is machine-proof that two
 * independent rankings were merged (one per meeting), and the block would then print one
 * "ranked" header over two #1s — every number right on its own meeting, the single label
 * wrong about the list. Duplicates fall back to source order, which is honest, rather than
 * to a renumbering, which would invent a cross-meeting priority nobody scored.
 */
export function buildMeetingIntel(candidates: IntelCandidate[]): MeetingIntel {
  const allRejected: RejectedCandidate[] = [];

  const blocks = INTEL_BLOCK_KINDS.map<IntelBlock>((kind) => {
    const mine = candidates.filter((c) => c.kind === kind);
    const items: IntelItem[] = [];
    const rejected: RejectedCandidate[] = [];

    for (const c of mine) {
      const verdict = validate(c);
      if (isRejection(verdict)) rejected.push(verdict);
      else items.push(verdict);
    }
    allRejected.push(...rejected);

    const ranks = items.map((i) => i.rank).filter((r): r is number => typeof r === "number");
    const everyRanked =
      items.length > 0 && ranks.length === items.length && new Set(ranks).size === ranks.length;
    const ordered = everyRanked
      ? [...items].sort((a, b) => (a.rank as number) - (b.rank as number))
      : items;

    return {
      kind,
      title: BLOCK_TITLES[kind],
      items: ordered,
      isEmpty: ordered.length === 0,
      emptyReason: ordered.length === 0 ? emptyReasonFor(kind, rejected, mine.length > 0) : "",
      ordering: everyRanked ? "ranked" : "source-order",
      rejected,
    };
  });

  return {
    blocks,
    rejected: allRejected,
    isEmpty: blocks.every((b) => b.isEmpty),
  };
}
