// Q41 increment 1 — the equity registry's pure seam (Rob dev-chat #53, 2026-07-27:
// "At the Master Level we need to see if we have any equity Split").
//
// WHY THIS EXISTS: the HomeCloneVault split was recorded as 40/60 on 7/22 and was
// actually 35/65. It stayed wrong for five days because it lived in a sentence
// inside one org's `description`, where nobody could scan it and nothing could
// check it. A number buried in prose is a number nobody owns.
//
// WHAT THIS DOES NOT DO YET: there is no `equity` jsonb column on the orgs table,
// so this module cannot pretend every split is a first-class field. It reads the
// field when one exists and falls back to parsing the prose — and it REPORTS WHICH,
// per row. A prose-derived split renders as prose-derived on screen. Increment 2
// adds the column + the click-to-fix edit; this seam is what that migrates INTO,
// which is why the parse result is already shaped like the future field.
//
// Pure: no I/O, no clock, no randomness. Every threshold below is explicit.

/** How we came to know this split. The screen shows this — it is not decoration. */
export type EquityProvenance = "field" | "prose";

/** Agreed-verbally is NOT the same fact as signed. Rob's own correction turned on this. */
export type EquityState = "signed" | "verbal" | "draft" | "unknown";

export interface EquitySplit {
  entityId: string;
  entityName: string;
  /** Counterparty's share, 0-100. Null when the prose names a split with no numbers. */
  counterpartyPct: number | null;
  /** Our share. Derived as 100 - counterparty when only one side is stated. */
  ourPct: number | null;
  state: EquityState;
  provenance: EquityProvenance;
  /** Verbatim slice the numbers came from, so a wrong one is traceable to its source. */
  evidence: string;
  /** Where the record actually lives. A stake can be a deal, not just an entity. */
  href?: string;
}

/**
 * Q41 inc.6 — the deal→candidate mapping, here rather than in a page.
 *
 * THE DEFECT THIS CLOSES: `app/page.tsx` built its deal candidates inline as
 * `{ id, name, notes, href }` and DROPPED `equity`. Every layer beneath it carried
 * the column correctly — 0024 stores it, `toDeal` reads it, the PATCH door writes it
 * — and the one hand-written object literal at the top threw it away. So a split Rob
 * corrected on the Gulf Coast 30% (a DEAL, the one stake he named by name) saved to
 * the database, returned 200, and then rendered on the master registry as the OLD
 * prose number labelled "read out of the description". A correction that appears not
 * to have happened is worse than no correction door at all: the second time, he does
 * not trust the number OR the fix.
 *
 * It is a function, exported and tested, precisely because it was a literal that
 * looked complete. Two screens now build the candidate the same way by construction.
 */
export interface DealLike {
  id: string;
  name: string;
  notes?: string;
  equity?: EquityCandidate["equity"];
}

export function dealCandidate(d: DealLike): EquityCandidate {
  return { id: d.id, name: d.name, notes: d.notes, equity: d.equity, href: `/deals/${d.id}` };
}

/** An equity-bearing record whose split we could NOT read. Shown, never hidden. */
export interface UnreadableEquity {
  entityId: string;
  entityName: string;
  reason: string;
  evidence: string;
  href?: string;
}

export interface EquityRegistry {
  splits: EquitySplit[];
  unreadable: UnreadableEquity[];
}

/** Minimal shape this module needs — deliberately not `Person`, to stay dependency-free. */
export interface EquityCandidate {
  id: string;
  name: string;
  description?: string;
  notes?: string;
  /** The future column. When present it WINS over the prose, always. */
  equity?: {
    counterpartyPct: number | null;
    ourPct?: number | null;
    state?: EquityState;
  };
  /**
   * Record's own route. Supplied by the caller because a stake is not always an
   * entity — the Gulf Coast 30% is a DEAL, and linking it to /people would 404.
   */
  href?: string;
}

/**
 * Records that are about an ownership stake. Phase-4 spinoffs and explicit equity deals.
 *
 * A BARE `split` IS NOT AN EQUITY SIGNAL. It was, for one build, and it put a
 * chiropractic clinic on Rob's equity screen — Naples Spine & Joint's enrichment
 * note reads "EN vs Spanish-language review split not verified". A panel that
 * answers "do we own a piece of anything" must never pad itself with records that
 * merely used the word; the padding is indistinguishable from a real stake at a
 * glance, which is the whole failure this panel exists to end. So `split` counts
 * only when the thing being split is named: revenue, profit, ownership, equity.
 */
const EQUITY_MARKER =
  /\bequity\b|\bspinoff\b|\bownership stake\b|\b(?:revenue|profit|ownership|equity)\s+splits?\b/i;

/** "35/65 split", "35 / 65 split" — a two-sided split. */
const TWO_SIDED = /(\d{1,3})\s*\/\s*(\d{1,3})\s*(?:%|percent)?\s*(?:equity\s+)?split/i;
/** "30% Gulf Coast RE", "a 35% split" — one side stated, ours is the remainder. */
const ONE_SIDED = /(\d{1,3})\s*(?:%|percent)/i;

export function isEquityRecord(c: EquityCandidate): boolean {
  if (c.equity) return true;
  return EQUITY_MARKER.test(`${c.description ?? ""} ${c.notes ?? ""}`);
}

/**
 * Reads the split state from prose. Order matters: an explicit negation of signing
 * ("NOT YET SIGNED") must never be read as "signed" by a bare /signed/ match — that
 * is precisely the misread that would turn a handshake into a contract on screen.
 */
export function readEquityState(text: string): EquityState {
  // "NOTHING SIGNED" is how Rob actually writes it on the live Gulf Coast record,
  // and `/not\s+signed/` does NOT match it — "not" is followed by "hing". Until
  // this line existed that record only read as unsigned by ACCIDENT, off the word
  // "unsigned" in a trailing sentence about a different deal; delete that sentence
  // and a handshake becomes a contract on Rob's screen. Both phrasings are pinned.
  if (/not\s+(yet\s+)?signed|nothing\s+(?:is\s+|has\s+been\s+)?signed|unsigned|not\s+executed|verbal/i.test(text))
    return "verbal";
  if (/\bin draft\b|\bdrafts?\b|\bat counsel\b/i.test(text)) return "draft";
  if (/\bsigned\b|\bexecuted\b/i.test(text)) return "signed";
  return "unknown";
}

function clampPct(n: number): number | null {
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/);
}

/** Pulls the sentence the numbers sit in, so the screen can cite rather than assert. */
function evidenceFor(text: string, match: string): string {
  return (sentences(text).find((s) => s.includes(match)) ?? text).trim().slice(0, 240);
}

/**
 * A LONE percentage only counts as a stake when it sits in the same sentence as an
 * equity word.
 *
 * WHY: `ONE_SIDED` on the whole blob takes the FIRST percentage anywhere in it, and
 * these descriptions are long and carry unrelated numbers — a close rate, a churn
 * figure, "97% of visitors leave". A record can be genuinely about equity in one
 * sentence and quote a marketing stat three sentences later, and the panel would
 * print that stat as an ownership split. That is strictly worse than printing
 * nothing: an unreadable record is already SHOWN, with its reason, so the honest
 * path is open. Two-sided splits are exempt — `TWO_SIDED` requires the literal word
 * "split" beside the numbers, so it anchors itself.
 */
function equitySentenceWithPercent(text: string): string | null {
  return sentences(text).find((s) => EQUITY_MARKER.test(s) && ONE_SIDED.test(s)) ?? null;
}

export function readEquitySplit(c: EquityCandidate): EquitySplit | UnreadableEquity | null {
  if (!isEquityRecord(c)) return null;
  const text = `${c.description ?? ""} ${c.notes ?? ""}`.trim();

  // The field, when it exists, is the truth. Prose does not get a vote.
  if (c.equity) {
    const cp = c.equity.counterpartyPct === null ? null : clampPct(c.equity.counterpartyPct);
    return {
      entityId: c.id,
      entityName: c.name,
      counterpartyPct: cp,
      ourPct: c.equity.ourPct ?? (cp === null ? null : 100 - cp),
      state: c.equity.state ?? readEquityState(text),
      provenance: "field",
      evidence: "structured field",
      href: c.href,
    };
  }

  const two = TWO_SIDED.exec(text);
  if (two) {
    const a = clampPct(Number(two[1]));
    const b = clampPct(Number(two[2]));
    if (a !== null && b !== null && a + b === 100) {
      return {
        entityId: c.id,
        entityName: c.name,
        counterpartyPct: a,
        ourPct: b,
        state: readEquityState(text),
        provenance: "prose",
        evidence: evidenceFor(text, two[0]),
        href: c.href,
      };
    }
    // A split that does not total 100 is a typo or a three-way deal. Either way it
    // is not something to render as fact — it is something to ask Rob about.
    return {
      entityId: c.id,
      entityName: c.name,
      reason: `the two sides read as ${two[1]}/${two[2]}, which does not total 100`,
      evidence: evidenceFor(text, two[0]),
      href: c.href,
    };
  }

  const anchored = equitySentenceWithPercent(text);
  const one = anchored ? ONE_SIDED.exec(anchored) : null;
  if (one) {
    const pct = clampPct(Number(one[1]));
    if (pct !== null) {
      return {
        entityId: c.id,
        entityName: c.name,
        counterpartyPct: pct,
        ourPct: 100 - pct,
        // Record-scope, NOT the anchored sentence: "35/65 split." and "Nothing
        // signed yet." are routinely two sentences. The PERCENTAGE has to be
        // anchored because a stray number is a lie; the STATE does not, because
        // it is a fact about the whole record.
        state: readEquityState(text),
        provenance: "prose",
        evidence: evidenceFor(text, one[0]),
        href: c.href,
      };
    }
  }

  // Q41 inc.4 — THE PRECEDENCE FIX, and the defect this increment found.
  //
  // Until now every record that merely used the word "equity" and stated no
  // percentage fell through to here and was rendered as a stake we HOLD but cannot
  // read. So "he floated giving us equity if we run their intake" — a sentence about
  // something that has not happened — appeared on Rob's owners-only registry as an
  // owned position. That is the inverse of the failure Q41 exists to end: the 40/60
  // was a real stake carrying a wrong number, and this is a wrong stake entirely.
  //
  // A record whose only equity language is PROSPECTIVE is not a stake at all. It
  // returns null here and is picked up by `phase4Opportunities` below, where a maybe
  // is labelled a maybe. Note what this does NOT touch: a parsed percentage or a
  // structured field already returned above, so a signed 35/65 that also muses about
  // more equity later is still a split, never demoted to a lead.
  if (isProspectiveStake(text)) return null;

  return {
    entityId: c.id,
    entityName: c.name,
    reason: "this record is about equity but states no percentage we can read",
    evidence: text.slice(0, 240),
    href: c.href,
  };
}

function isUnreadable(r: EquitySplit | UnreadableEquity): r is UnreadableEquity {
  return "reason" in r;
}

/**
 * The registry Rob scans. Unsigned splits sort first — an unsigned stake is the one
 * that can still evaporate, so it is the one that belongs at the top of the screen.
 */
export function equityRegistry(candidates: EquityCandidate[]): EquityRegistry {
  const splits: EquitySplit[] = [];
  const unreadable: UnreadableEquity[] = [];
  for (const c of candidates) {
    const r = readEquitySplit(c);
    if (!r) continue;
    if (isUnreadable(r)) unreadable.push(r);
    else splits.push(r);
  }
  const rank = (s: EquityState) => (s === "signed" ? 2 : s === "unknown" ? 1 : 0);
  splits.sort((a, b) => rank(a.state) - rank(b.state) || a.entityName.localeCompare(b.entityName));
  return { splits, unreadable };
}

/** The four states the screen knows how to colour. Mirrors 0024's check constraint. */
export const EQUITY_STATES: EquityState[] = ["signed", "verbal", "draft", "unknown"];

/** What actually lands in the `equity` jsonb column. */
export interface EquityFieldValue {
  counterpartyPct: number | null;
  ourPct: number | null;
  /** Absent means "keep reading signed-vs-verbal from the prose". */
  state?: EquityState;
  setBy: string;
  /** ISO date. Passed IN, never read off a clock here — this module stays pure. */
  setAt: string;
}

export type EquityCorrection =
  | { ok: true; value: EquityFieldValue }
  | { ok: false; error: string };

/**
 * Q41 inc.2 — the pure half of "Rob can correct a wrong split in the UI himself"
 * (his dev-chat #53). Validation lives here, not in the route, so vitest covers
 * every refusal without a network.
 *
 * REFUSALS ARE THE POINT. This door writes the number that overrides the prose
 * forever after — once `equity` exists, `readEquitySplit` stops consulting the
 * description entirely. A door that accepts "3 5" or 130 or a split totalling 95
 * does not save Rob a correction, it costs him the next one.
 */
export function parseEquityCorrection(input: {
  counterpartyPct?: unknown;
  ourPct?: unknown;
  state?: unknown;
  setBy?: unknown;
  setAt: string;
}): EquityCorrection {
  const { counterpartyPct: raw, ourPct: rawOur, state } = input;

  // Explicit null is a real answer: "we hold a stake, the number isn't agreed".
  // `undefined` is not — that is a missing field, and silently storing it as
  // "unknown percentage" would erase a number rather than correct one.
  if (raw === undefined) return { ok: false, error: "counterpartyPct is required (send null if the number is not agreed yet)" };

  let cp: number | null = null;
  if (raw !== null) {
    // Strings arrive from every HTML number input on earth. Accept the digits,
    // refuse the rest — Number("") is 0, which would silently write a 0/100.
    const n = typeof raw === "string" ? (raw.trim() === "" ? NaN : Number(raw)) : raw;
    if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, error: "counterpartyPct must be a number 0-100" };
    if (n < 0 || n > 100) return { ok: false, error: `counterpartyPct must be 0-100, got ${n}` };
    cp = n;
  }

  let our: number | null = cp === null ? null : 100 - cp;
  if (rawOur !== undefined && rawOur !== null && rawOur !== "") {
    const n = typeof rawOur === "string" ? Number(rawOur) : rawOur;
    if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, error: "ourPct must be a number 0-100" };
    if (cp === null) return { ok: false, error: "cannot state our side while the counterparty side is unknown" };
    // A split that does not total 100 is a typo or a three-way deal. The registry
    // already REFUSES to render one of those as fact; the door refuses to store it.
    if (cp + n !== 100) return { ok: false, error: `${cp} / ${n} totals ${cp + n}, not 100` };
    our = n;
  }

  if (state !== undefined && state !== null && !EQUITY_STATES.includes(state as EquityState)) {
    return { ok: false, error: `state must be one of ${EQUITY_STATES.join(", ")}` };
  }

  const setBy = typeof input.setBy === "string" && input.setBy.trim() ? input.setBy.trim() : "rob";
  const value: EquityFieldValue = { counterpartyPct: cp, ourPct: our, setBy, setAt: input.setAt };
  if (state) value.state = state as EquityState;
  return { ok: true, value };
}

export type EquitySaveOutcome = { tone: "ok" | "error"; message: string; saved?: EquityFieldValue };

/**
 * Q41 inc.3 — what the SCREEN is allowed to say after a save, decided here so
 * vitest covers it without a browser.
 *
 * THE RULE: the panel may only claim what the route reported. A 200 whose body
 * has no `equity` is not a save — it is a response we do not understand, and
 * showing "saved" for it would leave Rob believing a wrong split is corrected.
 * That is the same class of failure as the 40/60: a number nobody checked.
 */
export function equitySaveOutcome(status: number, body: unknown): EquitySaveOutcome {
  const b = (body ?? {}) as { ok?: unknown; equity?: EquityFieldValue; error?: unknown };
  if (status === 200 && b.ok === true && b.equity && typeof b.equity === "object") {
    const { counterpartyPct: cp, ourPct } = b.equity;
    return {
      tone: "ok",
      saved: b.equity,
      message: cp === null ? "Saved — stake recorded with no agreed number." : `Saved — ${cp} / ${ourPct}.`,
    };
  }
  if (typeof b.error === "string" && b.error) return { tone: "error", message: b.error };
  // Never a bare status code: "404" tells Rob nothing he can act on.
  return {
    tone: "error",
    message:
      status === 200
        ? "The server answered OK but did not report the saved split — nothing has been confirmed."
        : `Not saved (server returned ${status}).`,
  };
}

/**
 * THE DRIFT GUARD — the thing that would have caught the 40/60.
 *
 * Once a record has a structured field, its prose becomes a second copy of the same
 * number, and two copies can disagree. This reports that disagreement instead of
 * silently preferring one. Returns null when there is nothing to compare.
 */
export function prosePercentConflict(c: EquityCandidate): string | null {
  if (!c.equity || c.equity.counterpartyPct === null) return null;
  const text = `${c.description ?? ""} ${c.notes ?? ""}`;
  const field = c.equity.counterpartyPct;
  const two = TWO_SIDED.exec(text);
  if (two) {
    const a = Number(two[1]);
    if (a !== field) {
      return `field says ${field}% but the description still reads "${two[0]}"`;
    }
    return null;
  }
  const one = ONE_SIDED.exec(text);
  if (one && Number(one[1]) !== field) {
    return `field says ${field}% but the description still reads "${one[0]}"`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q41 increment 4 — the half of Rob's item that was never built: "surface FUTURE
// Phase-4 opportunities highlighted out of notes/meetings/emails".
//
// WHY IT IS A SEPARATE LIST AND NOT MORE ROWS ON THE REGISTRY: the registry answers
// "what do we own". This answers "what did somebody once say we could own". Those
// are different questions with different consequences — a stake is a fact to protect,
// a mention is a conversation to restart — and merging them would let a maybe inherit
// the credibility of a signed 35/65. The panel keeps them visually apart for the same
// reason the registry keeps signed apart from verbal.

/** A CONVERSATION about a stake we do not hold. Never a stake. */
export interface Phase4Opportunity {
  entityId: string;
  entityName: string;
  /** The sentence somebody actually wrote. Cited, never paraphrased. */
  evidence: string;
  href?: string;
}

/**
 * Nouns that name a piece of a business. Deliberately WIDER than `EQUITY_MARKER`:
 * a stake in the registry has to be provable, but a lead only has to be worth
 * re-reading — the cost of a false row here is ten seconds, and the cost of a
 * missed one is a Phase-4 deal nobody remembered to chase.
 */
const STAKE_NOUN =
  /\bequity\b|\bspin[-\s]?off\b|\bownership\b|\bshares?\b|\bstake\b|\b(?:profit|revenue)\s+share\b|\bjoint\s+venture\b|\bJV\b|\bphase\s*4\b/i;

/**
 * ...but the width is paid for by requiring a PROSPECTIVE cue in the same sentence.
 * Without this, every record that merely uses the word "ownership" — every enrichment
 * note describing who owns the roofing company — lands on Rob's Phase-4 list, and a
 * list padded with the whole CRM is a list nobody opens.
 */
const INTENT_CUE =
  /\b(?:could|would|might|wants?|wanted|interested|discussed?|discussing|talked about|floated|proposed?|proposing|explor(?:e|ing)|potential|possible|opportunit(?:y|ies)|open to|asked about|offer(?:ed|ing)?|considering|down the road|eventually|someday)\b/i;

/** The sentence that makes a record a LEAD rather than a holding. Null when none does. */
function prospectiveSentence(text: string): string | null {
  return sentences(text).find((s) => STAKE_NOUN.test(s) && INTENT_CUE.test(s)) ?? null;
}

/**
 * Exported because `readEquitySplit` consults it to decide what a record IS — the
 * two answers have to come from one rule, or the registry and this list will
 * disagree about the same sentence and Rob will see a row in both.
 */
export function isProspectiveStake(text: string): boolean {
  return prospectiveSentence(text) !== null;
}

/**
 * Records that TALK about a future stake, excluding every record already on the
 * registry above.
 *
 * THE EXCLUSION IS ENFORCED HERE, NOT BY THE CALLER — the registry is recomputed
 * inside rather than passed in, so no future screen can render this list beside a
 * registry built from a different candidate set and show one relationship twice.
 * Two rows for one company reads as two stakes.
 *
 * UNREADABLE ROWS ARE EXCLUDED TOO, AND THAT IS THE SHARPER RULE: an unreadable row
 * is a stake we HOLD whose number nothing could parse. Re-listing it here would
 * demote an owned stake to "somebody mentioned it" — the exact inversion this panel
 * exists to prevent.
 */
export function phase4Opportunities(candidates: EquityCandidate[]): Phase4Opportunity[] {
  const { splits, unreadable } = equityRegistry(candidates);
  const claimed = new Set([...splits.map((s) => s.entityId), ...unreadable.map((u) => u.entityId)]);

  const out: Phase4Opportunity[] = [];
  for (const c of candidates) {
    if (claimed.has(c.id)) continue;
    const text = `${c.description ?? ""} ${c.notes ?? ""}`.trim();
    if (!text) continue;
    // First matching sentence only: a record that muses about equity three times is
    // one lead, and three rows would rank a chatty note above a real opportunity.
    const hit = prospectiveSentence(text);
    if (!hit) continue;
    out.push({ entityId: c.id, entityName: c.name, evidence: hit.trim().slice(0, 240), href: c.href });
  }
  // Alphabetical, and that is an honest admission: nothing in a mention tells us
  // which lead is hottest, so any other order would invent an urgency claim.
  return out.sort((a, b) => a.entityName.localeCompare(b.entityName));
}

/**
 * Q41 inc.5 — what ONE record says about equity, for that record's own page.
 *
 * WHY A FUNCTION AND NOT A SECOND READING: the 40/60 survived five days because the
 * only place the number lived was a sentence on the org record — and the record page
 * is still the page Rob opens from the registry. Rendering it there off a second,
 * page-local reading of the prose would recreate the original defect with an extra
 * copy: two screens, two parsers, two numbers. This returns the registry's OWN verdict
 * for a single candidate, so the record page cannot disagree with the master panel —
 * it is literally the same computation over a one-element list.
 *
 * EXACTLY ONE OF THE THREE IS EVER SET (pinned). A record is a stake we hold, or a
 * stake whose number is unreadable, or a conversation about a future one — those are
 * three different claims and a page showing two of them at once would state two.
 * Everything null means the record has nothing to do with equity, and the page then
 * renders NOTHING rather than an empty "Equity" heading that implies a missing stake.
 */
export interface RecordEquityView {
  split: EquitySplit | null;
  unreadable: UnreadableEquity | null;
  lead: Phase4Opportunity | null;
}

export function recordEquityView(c: EquityCandidate): RecordEquityView {
  const { splits, unreadable } = equityRegistry([c]);
  // phase4Opportunities re-derives the registry internally and drops anything already
  // claimed by it, so the mutual exclusion is inherited rather than re-implemented.
  const leads = phase4Opportunities([c]);
  return {
    split: splits[0] ?? null,
    unreadable: unreadable[0] ?? null,
    lead: leads[0] ?? null,
  };
}
