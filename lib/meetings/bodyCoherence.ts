/**
 * Q89 inc.9 — does the summary on this page describe the meeting the transcript recorded?
 *
 * Found by reading, not by theory. The archive row titled `will Devito 2025-12-20`
 * (Notion `2cf1de57-0199-8003-9e6d-fd921fbb8a59`, 49 blocks / 77,465 chars) carries an
 * AI summary of an **STG sales call with BBX Moving Company** — "Attendees (planned):
 * Chai (BBX), Rob (STG), Ryan (STG)" — sitting directly above **74,271 characters of a
 * completely different conversation**, an automation walkthrough that never once says
 * BBX, Chai, moving or Vancouver. Two meetings welded onto one row.
 *
 * Why that is dangerous rather than merely untidy: every previous Q89 publish took the
 * summary bullets as action items, talking points and the commercial read, and took the
 * transcript paragraphs as the verbatim pain. On this row that recipe would have created
 * an org for BBX Moving Company and attached to it a body it was never mentioned in —
 * a fabricated company record assembled entirely out of real, individually-correct
 * fragments. Nothing in the pipeline would have objected: the summary is well-formed,
 * the transcript is long, both are genuine, and the four "no record" fields are empty
 * here exactly as they are on every other row.
 *
 * So the check is a cheap, mechanical one that a human read makes obvious and no
 * existing gate could see: NAME THE COUNTERPARTY THE SUMMARY CLAIMS, THEN LOOK FOR IT
 * IN THE BODY. If the summary says this was a call with BBX and 74k characters of
 * transcript never say BBX, the row does not get published from — it gets read by a
 * person.
 *
 * Three deliberate limits, because a guard that overreaches gets switched off:
 *
 * 1. IT NEVER EXTRACTS THE TERMS ITSELF. The caller supplies the identity the summary
 *    asserts (org name, principal, market). An extractor guessing at "which words are
 *    the company" is the same guessing this module exists to catch, one level up.
 *
 * 2. SILENCE IS `unverifiable`, NEVER `coherent`. A row with no asserted identity, or
 *    no transcript, gets its own verdict. Reporting "no disagreement found" for a row
 *    nobody could check would turn an absence of evidence into a clean bill of health —
 *    the precise inversion (`field empty` ⇒ `no record`) that Q84 exists to kill.
 *
 * 3. A PARTIAL HIT IS NOT A PASS. If some asserted terms appear and others do not, the
 *    verdict is `partial` and it needs a human. A transcript that names the company but
 *    never the principal may be a nickname, a mis-scribe, or a second meeting spliced on
 *    — this module cannot tell those apart and does not pretend to.
 *
 * Pure per CR-3: no clock, no network, no Supabase, no filesystem.
 */

/** What the summary asserts this meeting was WITH. Supplied by the caller, never inferred here. */
export type AssertedIdentity = {
  /** e.g. "BBX Moving Company". Free text exactly as the summary wrote it. */
  term: string;
  /** Where in the summary it was asserted — printed back so a verdict is checkable. */
  sourceRef: string;
};

export type BodyCoherenceVerdict =
  /** Every asserted term is present in the body. Safe to publish from, as far as THIS check goes. */
  | "coherent"
  /** Terms were asserted and NOT ONE of them appears in the body. Two meetings on one row. */
  | "mismatch"
  /** Some asserted terms appear, some do not. A human decides; code will not. */
  | "partial"
  /** Nothing to check against — no asserted identity, or no body. Never a pass. */
  | "unverifiable";

export type BodyCoherenceResult = {
  verdict: BodyCoherenceVerdict;
  /** Asserted terms found in the body, with the ref they came from. */
  found: AssertedIdentity[];
  /** Asserted terms absent from the body. */
  missing: AssertedIdentity[];
  /** Plain English, printable beside the row. Always populated. */
  reason: string;
  /**
   * True only for `coherent`. Every other verdict — including `unverifiable` — blocks an
   * automated publish, because this surface may not create a record it cannot check.
   */
  safeToPublish: boolean;
};

/**
 * Normalize for comparison only. Case, curly quotes and runs of whitespace are noise;
 * nothing else is touched, so a term never matches a word it does not actually contain.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `term` present in `body`? Substring on the normalized text, with one refinement:
 * a term of a single short token must match on a word boundary, so "Chai" does not
 * match "chain" and hand a mismatched row a false pass. Multi-word terms are matched
 * as substrings — a company name broken across a line break is a formatting artifact,
 * not a different company.
 */
function bodyContains(body: string, term: string): boolean {
  const needle = normalize(term);
  if (!needle) return false;
  const haystack = normalize(body);
  if (needle.includes(" ")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

export function checkBodyCoherence(input: {
  /** What the summary says the meeting was with. */
  asserted: AssertedIdentity[];
  /** The transcript/body text as read. */
  body: string;
}): BodyCoherenceResult {
  const asserted = input.asserted.filter((a) => normalize(a.term).length > 0);
  const body = input.body ?? "";

  if (asserted.length === 0) {
    return {
      verdict: "unverifiable",
      found: [],
      missing: [],
      reason:
        "The summary asserts no counterparty, so there is nothing to look for in the body. " +
        "This is not a pass — an unchecked row may not be published from.",
      safeToPublish: false,
    };
  }

  if (normalize(body).length === 0) {
    return {
      verdict: "unverifiable",
      found: [],
      missing: asserted,
      reason:
        `The summary asserts ${asserted.length} identity term(s) but the body is empty, so none ` +
        "could be checked. An empty body is a read that has not happened, never a confirmation.",
      safeToPublish: false,
    };
  }

  const found = asserted.filter((a) => bodyContains(body, a.term));
  const missing = asserted.filter((a) => !bodyContains(body, a.term));

  if (missing.length === 0) {
    return {
      verdict: "coherent",
      found,
      missing,
      reason:
        `All ${found.length} asserted identity term(s) appear in the body ` +
        `(${found.map((f) => f.term).join(", ")}).`,
      safeToPublish: true,
    };
  }

  if (found.length === 0) {
    return {
      verdict: "mismatch",
      found,
      missing,
      reason:
        `The summary says this meeting was with ${missing.map((m) => m.term).join(", ")}, and ` +
        `NONE of those appear anywhere in ${body.length.toLocaleString()} characters of body. ` +
        "The summary and the transcript describe different meetings; publishing from this row " +
        "would create a record out of two unrelated conversations. A human must read it.",
      safeToPublish: false,
    };
  }

  return {
    verdict: "partial",
    found,
    missing,
    reason:
      `${found.length} asserted term(s) appear in the body (${found.map((f) => f.term).join(", ")}) ` +
      `but ${missing.length} do not (${missing.map((m) => m.term).join(", ")}). ` +
      "Code cannot tell a nickname from a spliced-in second meeting; a human decides.",
    safeToPublish: false,
  };
}
