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
