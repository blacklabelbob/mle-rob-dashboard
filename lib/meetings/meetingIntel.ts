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
 * 1. NO PROVENANCE, NO RENDER. Every item carries the meeting it came from, the line/block that
 *    produced it, AND the text at that line (Q89 inc.22 — previously only pain points owed the
 *    text, which left three of the four blocks exempt from this module's own first rule). An
 *    item that cannot be opened and checked is rejected, not shown. This is the whole Q84
 *    discipline in one predicate: a field is a claim, never a finding.
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
  /**
   * The source text at that address. REQUIRED for all four kinds (Q89 inc.22): for pain points
   * it is what verbatim is checked against, for the other three it is the line the claim stands
   * on. Optional in the TYPE because this shape also describes an unvalidated candidate's
   * provenance — `validate` is what makes it mandatory, and a rejected candidate must still be
   * representable or it could not be reported by name.
   */
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
 * The source line an item was taken from, returned ONLY when reading it tells the reader
 * something the claim does not already say.
 *
 * Q89 inc.16 — critic-rob punch #4: nothing on the surface is clickable, because
 * `provenance.url` is undefined on every published item and no in-CRM anchor exists to
 * point at yet (the activity timeline is client-fetched and its rows carry no DOM id, so
 * stamping `/companies/C-xxxx#A-MTG-…` today would be a link to nothing — a fabricated
 * link is the failure this whole surface exists to prevent). The DoD's clause is that a
 * claim "can always be opened and checked". Bringing the checked-against text ONTO the
 * page satisfies that without any navigation at all, and without inventing a target.
 *
 * Suppressed when the excerpt adds nothing: a verbatim pain point whose excerpt is the
 * same sentence would otherwise print twice, and a duplicated line reads as two sources
 * when there is one. Comparison is on the verbatim normal form, so punctuation and
 * whitespace differences alone never resurrect it.
 */
export function contextExcerpt(item: IntelItem): string | null {
  const excerpt = item.provenance.excerpt?.trim();
  if (!excerpt) return null;
  if (!sameLine(item.text, excerpt)) return excerpt;
  return null;
}

/**
 * Deliberately LOOSER than `normalizeForVerbatim`, and the difference is the point.
 *
 * The verbatim gate treats punctuation as a word ("everything else must match") because a
 * changed comma can be a changed meaning, and that strictness is what makes a stored pain
 * point trustworthy. This function answers a different and much smaller question — "would
 * printing this line twice tell the reader anything?" — where a trailing full stop is
 * plainly not a second source. Loosening the gate to share one normalizer would trade a
 * truth rule for a layout rule; keeping them apart costs four lines.
 */
function sameLine(a: string, b: string): boolean {
  const flatten = (s: string) => normalizeForVerbatim(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const left = flatten(a);
  return left.length > 0 && left === flatten(b);
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

/**
 * Q92(b) — the same address, written for a surface that has ALREADY said part of it.
 *
 * critic-rob (RESCORE 2026-08-06, punch #3): on the grouped Overview the label reads
 * `Ravensmoor Merchant Services · A-MTG-… · body bullet «Restaurant Background & Challenges»`
 * directly under an `<h4>` that already says *Ravensmoor Merchant Services*. The company name
 * is printed twice within an inch of itself, and the block title inside « » is long enough to
 * wrap the line — so the part a reader actually needs (which meeting, which kind of line) is
 * the part that gets pushed off the edge.
 *
 * Two compactions, both reversible by the reader, neither one a different address:
 *
 *  1. **Drop the context prefix** — only ever when the caller has printed that exact context
 *     as the group heading. `sourceLabel` stays the single writer of the FULL address; this
 *     is that string minus a segment the reader is already looking at, not a second format.
 *  2. **Elide a long quoted block title**, and only the text inside « ». The kind prefix
 *     (`body bullet`, `body to_do 7`) and the meeting id are never touched, because those
 *     are what make the address followable; a truncated *id* would be a broken address, while
 *     a truncated *title* is still an unambiguous pointer to the same block.
 *
 * The full string is never destroyed — `MeetingIntelSection` hangs `sourceLabel` on the
 * element's `title`, so the elision costs a hover and no information.
 *
 * The COMPANY RECORD deliberately does not use this: there is no group heading there (a
 * single-company surface leaves `context` unset), so nothing is redundant and the bare
 * `meetingId · sourceRef` that `companyRecordRender.test.ts` pins stands unchanged. The two
 * surfaces are different on purpose.
 */
export const COMPACT_REF_TITLE_MAX = 28;

export function compactSourceLabel(p: Provenance, opts?: { omitContext?: boolean }): string {
  const ref = elideQuotedTitles(p.sourceRef ?? "");
  const address = `${p.meetingId} · ${ref}`;
  if (opts?.omitContext) return address;
  return p.context ? `${p.context} · ${address}` : address;
}

/**
 * Shorten the text inside every «…» in a source ref, leaving everything outside it alone.
 * A title at or under the max is returned byte-identical — this never "tidies" a short one.
 */
function elideQuotedTitles(ref: string): string {
  return ref.replace(/«([^»]*)»/g, (whole, title: string) => {
    const t = title.trim();
    if (t.length <= COMPACT_REF_TITLE_MAX) return whole;
    // Cut on a word boundary where one is near, so the elision reads as a shortened phrase
    // rather than as a corrupted string. Falls back to a hard cut when no space is close.
    const cut = t.slice(0, COMPACT_REF_TITLE_MAX);
    const space = cut.lastIndexOf(" ");
    const kept = (space > COMPACT_REF_TITLE_MAX - 10 ? cut.slice(0, space) : cut).trimEnd();
    return `«${kept}…»`;
  });
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

  // Q89 inc.22 — punch #9. The excerpt is required for ALL FOUR kinds, not just pain points.
  //
  // Until now only a pain point had to carry the line it stands on, because only a pain point
  // is checked word-for-word. But `sourceRef` alone is an ADDRESS, not evidence: "block-412"
  // tells a reader where to go, and tells them nothing at all if that block is gone, renamed,
  // or was never what the writer thought it was. A talking point or a benefit with no excerpt
  // is therefore a claim standing on a pointer — and rule 1 of this module is that an item
  // which cannot be opened and CHECKED is rejected, not shown. Three of the four blocks were
  // exempt from the module's own first rule.
  //
  // The excerpt requirement and the verbatim requirement are deliberately still separate, and
  // conflating them would be a real mistake: a talking point SHOULD be our wording (it is what
  // we plan to say next time), a benefit is by definition our commercial read, and an action
  // item is a commitment written as an instruction. Forcing those to occur verbatim in the
  // transcript would either delete them all or push writers to paste a sentence that never
  // supported the point. So: every kind must name the line it stands on; only pain points must
  // BE that line.
  //
  // Measured before shipping rather than hoped: all 73 published items across the four meetings
  // already carry an excerpt, so this rejects nothing today. It closes the door ahead of the
  // next writer, which is the only time a gate is cheap to close.
  //
  // `.trim()` and not truthiness, and that is not pedantry — it is a hole this increment's own
  // test found. `"   "` is a truthy string, so the old check waved it through: on a pain point
  // it then failed the verbatim test and got reported as a PARAPHRASE (blaming the writer's
  // wording for missing evidence), and on the other three kinds it would have been KEPT — a
  // rendered claim whose source line is three spaces. Empty is absence wearing a costume, and
  // `intelSource.str()` already refuses it one layer up; the gate must not depend on that.
  if (!p.excerpt?.trim()) {
    return {
      candidate,
      reason: "no-excerpt-to-check",
      message:
        candidate.kind === "pain-points"
          ? `Pain point at ${p.meetingId}#${p.sourceRef} carries no source excerpt, so "verbatim" cannot be checked. Unchecked is not shown.`
          : `${BLOCK_TITLES[candidate.kind]} item at ${p.meetingId}#${p.sourceRef} carries no source excerpt, so the line it stands on cannot be read. An address is not evidence.`,
    };
  }

  if (candidate.kind === "pain-points") {
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
