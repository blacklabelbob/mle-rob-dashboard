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
  | "unverifiable"
  /**
   * A human read the row and ruled that this meeting HAS no counterparty — an internal
   * training session, a webinar, a team stand-up. Distinct from `unverifiable`, and the
   * distinction is the point: see `CounterpartyReview`.
   */
  | "internal-no-counterparty";

/**
 * Q89 inc.10 — the third state, on the inc.29 (Q73) precedent.
 *
 * Found by reading the archive row `GHL AI Agent Knowledge Base Webinar 2025-12-18`
 * (Notion `2cd1de57-0199-8029-8c87-ea7fdf6c9c53`, 300 blocks / 65,104 chars). It is a
 * real, single, internally-consistent meeting — a coaching call Rob himself facilitated
 * on knowledge bases for AI agents in HighLevel, its own to-do reading
 * "@Robert Acheson to create feedback survey for coaching calls". The participants are
 * unnamed ("Participant asked about…"). There is no company on the other side of it,
 * because there is no other side.
 *
 * Before this type, that row returned `unverifiable` — the same verdict as a row nobody
 * has examined yet. Two states read as opposites when they are not:
 *
 *   · nobody has ruled on whether this row has a counterparty  → owed a read
 *   · somebody read it and there is no counterparty to find    → owed nothing, ever
 *
 * Collapsing them costs in the direction this queue keeps paying: an internal webinar
 * sits in the re-read worklist forever, indistinguishable from genuinely unread work, so
 * the outstanding-reads count never converges and nobody can tell which rows are real
 * work. That is the same shape as Q73 inc.29's classifier, where "reviewed and cleared"
 * and "nobody ever looked" produced identical silence and every count read them as safe.
 *
 * The module still never infers this (rule 1 stands). A caller supplies the ruling with
 * the reason and the line it came from, and both are printed back so the verdict is
 * checkable. `safeToPublish` stays FALSE either way — this is a reason a row is finished,
 * never a licence to publish a company record for a meeting that had no company in it.
 */
export type CounterpartyReview =
  /** Default. Nobody has ruled. Silence about a counterparty means nothing has been checked. */
  | { examined: false }
  /** A human read the row and found no counterparty. Must say why, and where they read it. */
  | { examined: true; counterparty: "none"; reason: string; sourceRef: string };

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
  /**
   * Optional human ruling on whether this meeting has a counterparty at all. Omitted
   * means unexamined — never "none". Only consulted when no terms are asserted; a row
   * that names a counterparty is checked against the body regardless of any ruling,
   * because the body is the harder evidence.
   */
  counterpartyReview?: CounterpartyReview;
  /**
   * Q89 inc.25 — org names the CRM already holds, supplied by the caller (never read
   * here; this module has no store). Used ONLY to put evidence beside an internal
   * ruling. See `knownOrgNames` note on the internal branch below.
   */
  knownOrgNames?: string[];
}): BodyCoherenceResult {
  const asserted = input.asserted.filter((a) => normalize(a.term).length > 0);
  const body = input.body ?? "";
  const review = input.counterpartyReview ?? { examined: false };

  if (asserted.length === 0) {
    if (review.examined) {
      /**
       * Q89 inc.25 — the internal ruling used to be accepted WITHOUT THE BODY BEING READ
       * AT ALL, and that is how a real counterparty meeting disappears.
       *
       * Evidence — every figure below is computed from the file by
       * `__tests__/citedEvidenceExists.test.ts`, not asserted here (inc.26 cited a path
       * that was never written, and inc.26's own replacement then quoted three counts
       * that did not hold; both are on the incident ledger):
       * `MLE Internal Meetings/transcripts/01KZ4ZNFE9ZKDJ6T9H4508PC9E.json`
       * (`snf-vmxj-dpo`, 2026-08-03T23:34Z = 19:34 EDT, 446 sentences, 23,883 chars).
       * Its manifest row asserts no company at all — which is exactly why `asserted` is
       * empty: the properties assert nothing, so there was nothing to check. On the old
       * path a ruling of "internal" then returned immediately, `found: []`, having looked
       * at zero characters. That body names **Omega twice and Gulf coast once** — two
       * orgs already in this CRM — plus a third the matcher deliberately does not catch
       * (see the spelling note in the test file).
       *
       * The ruling here happens to be right (it is Rob's pre-call with a collaborator; the
       * orgs are the SUBJECT, not the other side of the table). But it was right by luck,
       * not by check: the identical code path would have swallowed a genuine customer call
       * whose properties were blank, which is the archive's normal state and the whole
       * premise of Q84.
       *
       * So: the ruling still STANDS — a human ruled, and rule 1 says this module never
       * infers a counterparty. It simply may no longer be silent. Any known org name
       * present in the body comes back in `found` and is named in `reason`, so the ruling
       * is printed next to the evidence that argues against it and a reviewer sees both.
       * `safeToPublish` is unchanged and still false; nothing here publishes anything.
       */
      const namesInBody = (input.knownOrgNames ?? [])
        .filter((name) => normalize(name).length > 0)
        .filter((name) => bodyContains(body, name))
        .map<AssertedIdentity>((name) => ({ term: name, sourceRef: "body" }));

      const evidence = namesInBody.length
        ? ` The body nevertheless names ${namesInBody.length} org(s) this CRM already holds — ` +
          `${namesInBody.map((n) => n.term).join(", ")} — so read the ruling against that: ` +
          "they are the subject of an internal conversation, or this row is not internal."
        : "";

      return {
        verdict: "internal-no-counterparty",
        found: namesInBody,
        missing: [],
        reason:
          "A human read this row and ruled it has no counterparty: " +
          `${review.reason} (${review.sourceRef}). ` +
          "It is an internal meeting, so it is not owed another read and it may not be " +
          "published onto a company record — there is no company it belongs to." +
          evidence,
        safeToPublish: false,
      };
    }
    return {
      verdict: "unverifiable",
      found: [],
      missing: [],
      reason:
        "The summary asserts no counterparty, so there is nothing to look for in the body. " +
        "Nobody has ruled on whether that is because this row is internal or because it has " +
        "not been read — this is not a pass, and the row is still owed a read.",
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
