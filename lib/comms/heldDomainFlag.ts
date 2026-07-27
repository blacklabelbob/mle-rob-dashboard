// Q69 inc.30 — the decision path out of a sweep finding.
//
// inc.28 built the standing sweep, inc.29 gave it a face. Both stop at the same
// place: a finding names the company that still holds a blocked domain and then
// says nothing about what to do with it. The panel's marker also vanishes the
// moment the org is judged elsewhere (the sweep re-runs on every mount), so the
// one surface carrying the question disappears without the question ever having
// been answered — which is indistinguishable, a week later, from it never having
// been asked.
//
// The answer is the ledger Rob already reads: `flags` / Things to Address. A row
// there survives a page close, carries a resolution note, and is the surface
// every other finding in this build lands on (`proposalFlag`, inc.3 onwards). A
// second queue for held domains would be a queue nobody looks at.
//
// READ-ONLY, unchanged from inc.27/28/29 (HARD LIMIT): flagging writes ONE row
// to `flags`. It does not delete, merge, rename or unblock anything — the org
// still exists and the domain stays blocked. The payload says that in words,
// because a reviewer who reads "flagged" as "handled" is the exact failure the
// forward-only footnote exists to prevent.
//
// Pure (CR-3): no clock, no fetch, no DOM.

import type { AuditFinding } from "./genericDomainAudit";
import type { PanelTone } from "./genericDomainPanel";

/**
 * The title is the contract — same discipline as `proposalFlag`'s TITLE_PREFIX.
 * It is what a future dedupe (and any human scanning the ledger) matches on, so
 * it is generated in one place and parsed in one place rather than typed twice.
 */
const TITLE_PREFIX = "Blocked domain still held: ";

export function heldDomainFlagTitle(domain: string): string {
  return `${TITLE_PREFIX}${domain.trim().toLowerCase()}`;
}

/**
 * The domain a held-domain flag is about, or null for an ordinary ledger row.
 * Null rather than "" for the reason `proposalDomain` gives: "not one of these"
 * and "one of these with no domain" are different facts.
 */
export function heldFlagDomain(title: string): string | null {
  if (!title.startsWith(TITLE_PREFIX)) return null;
  const domain = title.slice(TITLE_PREFIX.length).trim();
  return domain ? domain : null;
}

export type HeldDomainFlagPayload = {
  entityId: string | null;
  entityName: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

/**
 * Build the flag row for one finding, or null when the finding cannot support
 * one.
 *
 * A malformed finding is REFUSED, never posted thin. `/api/admin/flags` accepts
 * anything with an entityName/title/detail, so a finding with no orgs would
 * cheerfully become a permanent ledger row naming no company and pointing at no
 * record — an item nobody can action and nobody can honestly resolve. The
 * refusal is the same call `auditFrom` makes upstream: a finding we cannot trust
 * is not rendered as a lesser finding.
 *
 * ENTITY_ID IS SET ONLY WHEN EXACTLY ONE COMPANY HOLDS THE DOMAIN. `entity_id`
 * is a single column and it is load-bearing: `GET /api/admin/flags?person=`
 * filters on it, and `overviewReadControl` (inc.20) uses its presence to decide
 * whether the row claims a record page. Picking the first of three companies
 * would file a finding about all of them onto one of them — a quiet mis-filing
 * on a customer record. With several, the subject genuinely is the DOMAIN, so
 * the row lives on the Overview like a proposal does and names every company in
 * its detail.
 *
 * SEVERITY IS MEDIUM, DELIBERATELY. Nothing is broken and no money is at risk:
 * a company created before its domain was blocked may be perfectly real. High
 * severity on a review item is how high severity stops meaning anything.
 */
export function heldDomainFlagPayload(finding: AuditFinding): HeldDomainFlagPayload | null {
  const domain = (finding?.domain ?? "").trim().toLowerCase();
  const orgs = Array.isArray(finding?.orgs) ? finding.orgs.filter((o) => o && o.id && o.name) : [];
  if (!domain || orgs.length === 0) return null;

  const single = orgs.length === 1 ? orgs[0] : null;
  const lines = orgs.map((o) => `- ${o.name} (${o.href})`).join("\n");

  return {
    entityId: single ? single.id : null,
    entityName: single ? single.name : domain,
    title: heldDomainFlagTitle(domain),
    detail:
      `${domain} is on the blocklist, but ${orgs.length === 1 ? "this company" : "these companies"} ` +
      `still ${orgs.length === 1 ? "holds" : "hold"} it:\n${lines}\n\n` +
      // The last line is the point of the whole row: it tells the reviewer what
      // is NOT true, so "flagged" cannot be read as "cleaned up".
      `Blocking a domain only stops NEW companies being created from it. ` +
      `Nothing above was changed — the ${orgs.length === 1 ? "record" : "records"} still ` +
      `${orgs.length === 1 ? "exists" : "exist"} and ${domain} stays blocked. ` +
      `Decide whether ${orgs.length === 1 ? "it is" : "they are"} a real company; resolve this with a note either way.`,
    severity: "medium",
  };
}

// ── Q69 inc.31 — the same domain, a week later ──────────────────────────────
//
// inc.30's title is a stable contract, but nothing read it back. Flagging
// bigmailer.com today and opening this panel tomorrow offered the same live
// button, so a domain nobody has decided about accumulates a row per session —
// and a ledger with four identical rows is a ledger Rob stops reading.
//
// The dedupe reads the ledger Rob already has (`GET /api/admin/flags`) rather
// than keeping a second record of what was flagged; a local memory would drift
// the moment a row is resolved somewhere else.

/**
 * What we know about held-domain rows already on the ledger.
 *
 * `unknown` is a real state, not a stand-in for "none". If the flags read
 * fails we must not draw "already on Things to Address" (that hides the only
 * way to act on a finding, on the strength of a request that failed), and we
 * must not silently behave as though we checked. Unknown keeps the button —
 * the worst case is a duplicate row, resolvable in one click, which is the same
 * trade `flagOutcome` makes on a dropped request.
 */
export type HeldFlagIndex =
  | {
      kind: "read";
      domains: Set<string>;
      /**
       * Q69 inc.33 — domains Rob has ALREADY judged (resolved rows), mapped to
       * the date he judged them (`date`, null when the row carries no readable
       * date) and Q69 inc.35 how many times he has judged them (`times`).
       * Separate from `domains` on purpose: an open row stops the button, a
       * resolved one only informs it.
       */
      judged: Map<string, Judgement>;
    }
  | { kind: "unknown" };

/**
 * Q69 inc.35 — one domain's history of decisions, as the ledger records it.
 *
 * `date` is the LATEST judgement (inc.33). `times` counts how many resolved
 * rows the ledger holds for the domain, i.e. how many times this exact question
 * has been round the raise → judge → re-raise loop. A count is the only thing
 * on this surface that distinguishes "you looked at this once" from "this keeps
 * coming back", and the second one is a fact about the BLOCKLIST, not about the
 * domain — a question asked four times and answered the same way four times is
 * the panel wasting Rob's attention, and he cannot see that from a date.
 */
export type Judgement = { date: string | null; times: number };

/**
 * Index the OPEN held-domain flags out of a `GET /api/admin/flags` response.
 *
 * ONLY ROWS EXPLICITLY `status === "open"` COUNT. A resolved row means Rob has
 * already judged that company — if the sweep finds the domain again later, that
 * is a NEW question and must be flaggable again; treating resolved (or a row
 * whose status we cannot read) as open would silently remove the button and
 * strand the finding. Erring toward "still flaggable" costs a duplicate; erring
 * the other way costs the decision path entirely.
 */
export function heldFlagIndex(status: number | null, body: unknown): HeldFlagIndex {
  if (status !== 200 || !body || typeof body !== "object") return { kind: "unknown" };
  const rows = (body as { flags?: unknown }).flags;
  if (!Array.isArray(rows)) return { kind: "unknown" };

  const domains = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { status?: unknown; title?: unknown };
    if (r.status !== "open" || typeof r.title !== "string") continue;
    const domain = heldFlagDomain(r.title);
    if (domain) domains.add(domain.toLowerCase());
  }
  return { kind: "read", domains, judged: heldPriorJudgements(rows) };
}

/**
 * Q69 inc.38 — the judgement tally, in ONE place, for every surface that shows
 * it.
 *
 * The panel reads it off a `GET /api/admin/flags` BODY (`heldFlagIndex`); the
 * ledger already holds the same rows as an ARRAY (`heldArchivePlaces` takes
 * them that way). Both must answer "how many times has this been decided?"
 * identically — two surfaces disagreeing about the same history is the exact
 * defect inc.36 and inc.37 were spent closing — so they count with the same
 * function rather than with two tallies that happen to agree today.
 *
 * A resolved row is a JUDGEMENT, and only an explicitly resolved one is (inc.33):
 * a row whose status we cannot read is not evidence Rob decided anything.
 */
export function heldPriorJudgements(rows: unknown): Map<string, Judgement> {
  const judged = new Map<string, Judgement>();
  if (!Array.isArray(rows)) return judged;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { status?: unknown; title?: unknown; resolved_at?: unknown };
    if (r.status !== "resolved" || typeof r.title !== "string") continue;
    const domain = heldFlagDomain(r.title);
    if (!domain) continue;
    const d = domain.toLowerCase();
    const seen = judged.get(d);
    judged.set(d, {
      date: mostRecentJudgement(seen?.date, judgementDate(r.resolved_at)),
      // Q69 inc.35 — every resolved row is one trip round the loop, including
      // the ones we cannot date. Counting only dated rows would under-report
      // exactly the history the count exists to expose.
      times: (seen?.times ?? 0) + 1,
    });
  }
  return judged;
}

/**
 * The date on a resolved row, or null — never a guess.
 *
 * `/api/admin/flags` writes `resolved_at` as a bare `YYYY-MM-DD` (PATCH above),
 * so anything else is a row we cannot date. We say "you resolved this" without
 * a date rather than printing a half-parsed string: a wrong date on a review
 * item is worse than no date, because Rob would use it to reason about whether
 * his decision predates whatever changed.
 */
function judgementDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Two resolutions of the same domain: keep the one that tells the truth about
 * the LATEST decision. A dated row beats an undated one (it says strictly more,
 * and both are true); between two dates the later one wins — ISO strings sort
 * chronologically, which is why the date is stored as text and not reformatted.
 *
 * `undefined` (no entry yet) is distinct from `null` (an entry we cannot date).
 */
function mostRecentJudgement(existing: string | null | undefined, incoming: string | null): string | null {
  if (existing === undefined) return incoming;
  if (incoming === null) return existing;
  if (existing === null) return incoming;
  return incoming > existing ? incoming : existing;
}

export type FlagAffordance =
  | {
      kind: "button";
      /**
       * Q69 inc.33 — what Rob already decided about this domain, or null when
       * the ledger holds no resolved row for it. The button STAYS either way.
       */
      judged: string | null;
    }
  | { kind: "already"; text: string };

/**
 * What the finding's row offers: the live button, or the sentence that says the
 * question is already waiting for him.
 *
 * The outcome of a click in THIS session wins over the index, because the index
 * was read before that row existed — re-reading the ledger after every post to
 * learn what we just wrote would be a slower way to be told the same thing.
 */
export function flagAffordance(
  domain: string,
  index: HeldFlagIndex,
  outcome?: FlagOutcome | null
): FlagAffordance {
  const d = (domain ?? "").trim().toLowerCase();
  // Q69 inc.37 — the history is true whichever way the row is already waiting,
  // so it is computed once and appended to BOTH already-branches.
  const history = d && index.kind === "read" ? waitingHistory(index.judged, d) : "";
  if (outcome?.flagged) return { kind: "already", text: outcome.text + history };
  if (d && index.kind === "read" && index.domains.has(d)) {
    return { kind: "already", text: "Already on Things to Address — waiting on your decision." + history };
  }
  return { kind: "button", judged: d && index.kind === "read" ? judgedNote(index.judged, d) : null };
}

/**
 * Q69 inc.37 — the history follows the question onto the OPEN row.
 *
 * inc.33/35 gave the note a memory, but only on the branch that still has a
 * button: the moment a row is open, `judgedNote` is never reached and the panel
 * says one flat sentence — "waiting on your decision" — with no hint that the
 * same decision has already been made three times. That is backwards. A domain
 * with an open row is, by definition, the one that CAME BACK; it is the case
 * where the repeat matters most, and it was the only case where we said nothing.
 * Rob then re-decides it as if it were new, which is how a loop stays a loop.
 *
 * NO ORDINAL ARITHMETIC (inc.36's rule). We know how many times he RESOLVED it;
 * we do not know how many times it was RAISED (an open set collapses duplicates),
 * so we never say "this is the third time it has come up" — that would be a
 * sequence claim derived from a count, which is exactly the guess inc.36 declined.
 *
 * Returns "" — never a null or an undefined that could reach the copy.
 */
function waitingHistory(judged: Map<string, Judgement>, domain: string): string {
  const seen = judged.get(domain);
  if (!seen || seen.times < 1) return "";
  const when = seen.date ? ` on ${seen.date}` : " earlier";
  // Same threshold as `judgedNote`: one judgement is a fact, two is a pattern,
  // and only the pattern earns the sentence that points at the blocklist.
  if (seen.times < 2) return ` You already resolved this once${when}.`;
  return (
    ` You have resolved this ${seen.times} times before, most recently${when} — ` +
    `it keeps coming back, so consider whether the blocklist entry is the thing to change.`
  );
}

/**
 * Q69 inc.39 — the finding arrives PRE-LABELLED as a repeat.
 *
 * inc.33/35/37 put the history at the END of the row, attached to the button or
 * to the "already waiting" sentence. That is where Rob DECIDES — but it is not
 * where he decides *whether to read*. The finding text itself introduces a
 * domain he has resolved three times in exactly the same words as one he has
 * never seen, so a list of findings gives him no way to tell the recurring
 * question from the new one until he has read to the end of every row.
 *
 * This is a LABEL, not a second copy of the sentence. It carries the count and
 * nothing else — no date, no advice — because the trailing sentence already
 * says both, and two full sentences about one history is the drift inc.37/38
 * were spent removing. The number itself comes from the same `Judgement.times`
 * the sentence prints (test-pinned equal), so the label and the sentence cannot
 * disagree.
 *
 * NO ORDINAL ARITHMETIC (inc.36/37/38's standing rule): we know how many times
 * Rob RESOLVED this domain, never how many times it was RAISED, so the label
 * never says "3rd time" — it says how many times it was resolved before.
 *
 * `null` on: an unread index (an unknown history is not "new"), a blank domain,
 * or no resolved row — a first sighting gets no label at all, which is what
 * makes the label mean something when it is there.
 */
export function findingRepeatMark(domain: string, index: HeldFlagIndex): string | null {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d || index.kind !== "read") return null;
  const seen = index.judged.get(d);
  if (!seen || seen.times < 1) return null;
  // Same one-vs-many threshold as `judgedNote` / `waitingHistory`: one is a
  // fact, two is a pattern. The wording differs (a label, not a sentence); the
  // NUMBER never does.
  if (seen.times < 2) return "Resolved before";
  return `Resolved ${seen.times} times before`;
}

/**
 * Q69 inc.40 — the COLLAPSED badge tells a new question from a returning one.
 *
 * The panel is collapsed by default, so `blocklistBadge` is the only thing that
 * speaks before anyone opens it — and it says "3 still held by a company"
 * whether all three are domains Rob has never seen or all three are questions he
 * has already answered four times. Those are opposite calls to action (open it
 * and decide / the blocklist is the thing to change), and inc.39 put the
 * distinction on the finding rows, which is INSIDE the panel: visible only after
 * the decision to open it has already been made.
 *
 * COUNTED IN FINDINGS, NOT IN TRIPS. `Judgement.times` is how many times ONE
 * domain was resolved; this is how many of the findings are repeats. Those two
 * numbers sit on the same screen, so the wording never leaves a bare count that
 * could be read as the other one: "2 of 3 resolved before" and "all 3 resolved
 * before" can only be about findings, and a lone finding gets inc.39's exact
 * singular ("resolved before") with no number at all.
 *
 * NO ORDINAL ARITHMETIC (the inc.36–39 standing rule): resolved counts are
 * known, raised counts are not.
 *
 * `null` on: an unread index (an unknown history is not "all new"), no findings,
 * or no finding with a prior judgement — a marker on every sweep would tell Rob
 * nothing, which is the same reason `blocklistBadge` itself stays silent on a
 * clean sweep.
 *
 * Domains are trimmed, case-folded and DEDUPED: one domain listed twice is one
 * question, and counting it twice would put "2 of 2" on a single repeat.
 */
export function badgeRepeatMark(
  domains: readonly string[] | null | undefined,
  index: HeldFlagIndex
): string | null {
  if (!Array.isArray(domains) || index.kind !== "read") return null;
  const { returning, total } = repeatTally(domains, index.judged);
  if (returning < 1) return null;
  if (total === 1) return "resolved before";
  if (returning === total) return `all ${total} resolved before`;
  return `${returning} of ${total} resolved before`;
}

/**
 * How many of a list of domains Rob has judged before, and how many distinct
 * domains the list actually held.
 *
 * Q69 inc.41 — shared by `badgeRepeatMark` (panel header) and
 * `ledgerRepeatMark` (Things to Address header) rather than counted twice: these
 * two markers can be on screen together, and "one history, not two that agree
 * today" is the whole point of `heldPriorJudgements` existing.
 *
 * DEDUPED, trimmed and case-folded: one domain is one question however many
 * times it is listed, and counting it twice is how a marker out-counts its own
 * total. Junk entries are skipped, never counted as a domain.
 */
function repeatTally(
  domains: readonly unknown[],
  judged: Map<string, Judgement>
): { returning: number; total: number } {
  const seen = new Set<string>();
  let returning = 0;
  for (const raw of domains) {
    if (typeof raw !== "string") continue;
    const d = raw.trim().toLowerCase();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    const j = judged.get(d);
    if (j && j.times >= 1) returning += 1;
  }
  return { returning, total: seen.size };
}

/**
 * Q69 inc.41 — the LEDGER's header tells a returning question from a new one.
 *
 * inc.40 gave the blocklist panel's collapsed badge a repeat marker, so a
 * passer-by can tell "3 domains to decide" from "3 questions you already
 * answered". Things to Address — the surface that carries the Resolve control,
 * and the one Rob opens first — still says only `{open.length}`. Its rows say it
 * (inc.38's `waitingHistory` inside the hint), but the row text is read AFTER
 * the decision to work the list; the header is what is read before.
 *
 * COUNTED IN ROWS, AND THE TOTAL IS NEVER PRINTED. This is the one place the
 * panel's wording could not be reused: the panel's findings are ALL held-domain
 * findings, so "2 of 3" is unambiguous there. This ledger is a mixed list —
 * proposals, ordinary findings, held-domain rows — and only held-domain rows can
 * have a prior judgement at all. So "all 3" or "2 of 3" beside a badge counting
 * every open row of every kind would be two different populations wearing one
 * fraction. The marker states the returning count and nothing else, and unlike
 * inc.39/40 it ALWAYS carries its number: the number beside it (the open badge)
 * is a different population, so a bare "resolved before" would attach itself to
 * that count instead.
 *
 * NO ORDINAL ARITHMETIC (the inc.36–40 standing rule): resolved counts are
 * known, raised counts are not.
 *
 * `null` on: no titles, no prior-judgement map (an unknown history is not "all
 * new" — same silence as `badgeRepeatMark` on an unread index), or no returning
 * row. A marker on every scan would tell Rob nothing.
 */
export function ledgerRepeatMark(
  titles: readonly unknown[] | null | undefined,
  prior: Map<string, Judgement> | null | undefined
): string | null {
  if (!Array.isArray(titles) || !prior || prior.size === 0) return null;
  // Non-held rows drop out here: `heldFlagDomain` is null for a proposal and for
  // every ordinary finding, which is exactly the population that can never carry
  // a judgement history.
  const domains = titles.map((t) => (typeof t === "string" ? heldFlagDomain(t) : null));
  const { returning } = repeatTally(domains, prior);
  if (returning < 1) return null;
  return `${returning} resolved before`;
}

/**
 * Q69 inc.33 — the sweep is the only thing here that re-asks.
 *
 * A held-domain flag resolved as "real company, leave it" is re-raised on the
 * next mount, with the panel showing exactly what it showed before Rob decided.
 * That is the design (inc.31/32: a re-found domain is a new question) but it is
 * only honest if the panel SAYS he already judged it — otherwise the same
 * question, in the same words, is put to him every week, and the way a person
 * copes with that is by ignoring the panel.
 *
 * THE BUTTON SURVIVES. Removing it on a resolved row would mean a domain judged
 * once can never be raised again, which is the opposite of inc.31's call and
 * strands a finding that may have changed since. The note informs the decision;
 * it does not make it.
 */
function judgedNote(judged: Map<string, Judgement>, domain: string): string | null {
  const seen = judged.get(domain);
  if (!seen) return null;
  const when = seen.date ? ` on ${seen.date}` : " earlier";
  // Q69 inc.35 — the count only appears once it says something. "You already
  // resolved this once" is the same sentence with a wasted word in it; from the
  // second trip the number IS the news, and the date becomes the most recent of
  // several rather than the whole story.
  if (seen.times < 2) {
    return `You already resolved this${when} — flag it again only if something has changed.`;
  }
  return (
    `You have resolved this ${seen.times} times, most recently${when} — ` +
    `it keeps coming back, so consider whether the blocklist entry is the thing to change.`
  );
}

// ── Q69 inc.32 — the row Rob actually resolves, read from the ledger side ────
//
// inc.30/31 made the panel honest about a held domain. The ledger did not
// follow: Things to Address renders a held-domain row like any other finding —
// a title, prose, Resolve. Two facts the reviewer needs are missing at exactly
// the moment they decide:
//
//   1. THE DOMAIN IS STILL BLOCKED. The detail says so in its last paragraph,
//      but the detail is three lines of prose on a row Rob is scanning; the
//      state belongs on the row as state, not buried as narration. A reviewer
//      who reads a flag as "someone already unblocked this" resolves it and the
//      company keeps its blocked domain with nobody watching.
//   2. WHERE THE QUESTION CAME FROM. The blocklist panel is the only surface
//      that can act on the domain itself, and nothing on the ledger points at
//      it — so the row is a dead end for every decision except "resolve".
//
// The href is ABSOLUTE (`/#…`), not a bare fragment: a single-company finding
// files onto that company's record (inc.30), so this row is rendered on
// `/companies/[id]` as often as on the Overview, and `#generic-domains` there
// would scroll to nothing.

const BLOCKLIST_ANCHOR = "/#generic-domains";

export type HeldRowCopy = {
  domain: string;
  /** Row-level state, not prose: the domain did not get unblocked by any of this. */
  badge: string;
  /** What resolving this row does — and, more importantly, what it does not. */
  hint: string;
  href: string;
  linkText: string;
};

/**
 * The ledger-side reading of a held-domain flag, or null for every other row.
 *
 * Null for ordinary findings AND for company proposals: 99% of the ledger is
 * neither, and a "still blocked" badge on a row where nothing is blocked is the
 * noise that teaches Rob to skip the badge on the row that means it — the same
 * call `resolveControlCopy` makes about permanence warnings.
 *
 * Q69 inc.38 — `prior` (optional) is the domain→judgement map from
 * `heldPriorJudgements`, and it is what makes this row stop reading like a first
 * ask. The ledger was the LAST surface that could not say the question came
 * back: inc.33/35 gave the panel's button a memory, inc.36 the archive row,
 * inc.37 the panel's waiting row — while the OPEN row on Things to Address, the
 * one Rob actually decides on, still said only "the sweep will raise it again",
 * as if it never had. So the surface with the Resolve control was the surface
 * with the least history, and re-resolving a fourth time looked like progress.
 *
 * OMITTING `prior` KEEPS THE OLD COPY EXACTLY. The Overview digest calls this
 * for the badge alone (inc.32) and must not grow a paragraph on a scan surface.
 *
 * THE HINT DOES NOT PROMISE SILENCE. inc.31's dedupe counts only `open` rows,
 * so resolving this makes the domain flaggable again — deliberately: a re-found
 * domain is a new question. The reviewer is told that here, because "resolve"
 * elsewhere on this ledger means "this stops coming back", and a row that
 * quietly returns next week looks like a bug rather than the design.
 */
export function heldRowCopy(title: string, prior?: Map<string, Judgement> | null): HeldRowCopy | null {
  const domain = heldFlagDomain(title);
  if (!domain) return null;
  const d = domain.toLowerCase();
  return {
    domain: d,
    badge: `${d} · still blocked`,
    hint:
      `Resolving files your decision — it does not unblock ${d} and does not delete anything. ` +
      `If the company still holds it, the blocklist sweep will raise it again.` +
      // Q69 inc.38 — the SAME sentence the panel shows (`waitingHistory`), not a
      // second wording of the same count: the row and the panel are read minutes
      // apart about one question, and prose that differs reads as two histories.
      (prior ? waitingHistory(prior, d) : ""),
    href: BLOCKLIST_ANCHOR,
    linkText: "review the blocklist",
  };
}

// ── Q69 inc.34 — the resolved row, from the side Rob closed it on ───────────
//
// inc.33 taught the SWEEP to remember a judgement: the panel now says "you
// already resolved this on <date>" beside the button. The ledger never learned
// the other half. A held-domain row Rob resolved drops into the archive looking
// like every other closed item — and on this ledger "resolved" means "this stops
// coming back", which for a held domain is not true: inc.31's dedupe counts only
// `open` rows, so the next sweep raises it again by design.
//
// So the archive row is the one surface that quietly contradicts the build. Rob
// closes it believing it is finished, sees it again next week, and reads the
// return as a bug — which costs more than the row ever saved, because the fix he
// would reach for is to stop trusting the panel.
//
// The note is the counterpart of `judgedNote`, worded from the closing side: it
// dates the decision (so the two surfaces agree on WHEN), and says plainly what
// the closure did and did not do.

/**
 * What a RESOLVED held-domain row is still doing, or null for every other
 * archive row.
 *
 * Null for ordinary findings and for proposals — `archiveConsequence` already
 * owns the proposal case, and a "this can come back" line on rows that cannot is
 * the noise that teaches Rob to skip the line on the rows that mean it.
 *
 * THE DATE IS PARSED OR ABSENT, NEVER HALF-PRINTED — same rule and same parser
 * as inc.33's judgement date, deliberately: these two sentences are read a week
 * apart about the same decision, and a date that renders one way in the panel
 * and another way here is worse than no date at all.
 */
export function heldArchiveNote(title: string, resolvedAt: unknown, place?: ArchivePlace | null): string | null {
  const domain = heldFlagDomain(title);
  if (!domain) return null;
  const d = domain.toLowerCase();
  const date = judgementDate(resolvedAt);
  const when = date ? `on ${date}` : "earlier";
  return (
    `You judged ${d} ${when}. It stays blocked and nothing was deleted — ` +
    `if a company still holds it, the blocklist sweep will raise a new row.` +
    placeNote(place)
  );
}

// ── Q69 inc.36 — WHICH trip round the loop this closure was ─────────────────
//
// inc.35 taught the panel to count: "you have resolved this 3 times". The
// archive row still speaks as if its own closure were the only one, so the two
// surfaces describe the same history differently — the panel says three, the
// row Rob is reading says "you judged it". He cannot tell whether the row in
// front of him is the decision the panel is counting from, or one of the two
// before it, and that is exactly the question a repeat raises.
//
// The count is the SAME count (`times`), derived from the same resolved rows,
// so the numbers agree by construction rather than by two functions happening
// to tally alike.

/**
 * Where one resolved row sits in a domain's history: the `nth` of `of`
 * decisions on record.
 *
 * `nth` is NULL WHEN THE ROWS CANNOT BE ORDERED — an undated row, or two rows
 * sharing a date. An ordinal is a claim about sequence, and the row's whole job
 * here is to let Rob line this decision up against the panel's count; a guessed
 * position would be worse than none, because it reads as fact. `of` still holds
 * (a count needs no order), so the row says how many there are and declines to
 * say which.
 */
export type ArchivePlace = { nth: number | null; of: number };

function placeNote(place: ArchivePlace | null | undefined): string {
  // One decision on record is the row itself — "the 1st of 1" is inc.35's
  // wasted word in ordinal clothing.
  if (!place || place.of < 2) return "";
  if (place.nth === null) return ` The ledger holds ${place.of} decisions on this domain; this is one of them.`;
  return ` This was decision ${place.nth} of ${place.of} on this domain.`;
}

/**
 * Place every RESOLVED held-domain row in its domain's history, keyed by flag
 * id, for the archive to read off.
 *
 * Ordering is by `resolved_at` date ascending, and only when every row in the
 * group carries a distinct parseable date — see `ArchivePlace`. Open rows are
 * not decisions and are not counted, which keeps `of` equal to inc.35's
 * `times` for the same domain.
 */
export function heldArchivePlaces(rows: unknown): Map<number, ArchivePlace> {
  const byDomain = new Map<string, { id: number; date: string | null }[]>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as { id?: unknown; status?: unknown; title?: unknown; resolved_at?: unknown };
      if (typeof r.id !== "number" || r.status !== "resolved" || typeof r.title !== "string") continue;
      const domain = heldFlagDomain(r.title);
      if (!domain) continue;
      const d = domain.toLowerCase();
      const group = byDomain.get(d) ?? [];
      group.push({ id: r.id, date: judgementDate(r.resolved_at) });
      byDomain.set(d, group);
    }
  }

  const places = new Map<number, ArchivePlace>();
  for (const group of byDomain.values()) {
    const dates = group.map((g) => g.date);
    const orderable = dates.every((x) => x !== null) && new Set(dates).size === dates.length;
    const of = group.length;
    if (!orderable) {
      for (const g of group) places.set(g.id, { nth: null, of });
      continue;
    }
    const sorted = [...group].sort((a, b) => (a.date! < b.date! ? -1 : 1));
    sorted.forEach((g, i) => places.set(g.id, { nth: i + 1, of }));
  }
  return places;
}

export type FlagOutcome = { text: string; tone: PanelTone; flagged: boolean };

/**
 * What the reviewer is told after the click.
 *
 * A 200 THAT DOES NOT SAY `ok` IS NOT A SUCCESS. The route answers `{ ok: true }`
 * and nothing else with a 200, so a 200 carrying anything else means the shape
 * drifted or something else answered — and `flagged: true` here disables the
 * button and tells Rob the item is on the ledger. Claiming a write we cannot see
 * is the cheerful-200 failure this build keeps refusing (inc.16, inc.19, inc.26).
 *
 * A DROPPED REQUEST ASKS FOR A LOOK, NOT A RE-CLICK — but it is deliberately
 * calmer than inc.19's dismiss warning: the worst case here is a duplicate
 * review row, which is resolvable in one click, not a domain shut out forever.
 * Overstating it would train Rob to discount the warning on the click that is
 * genuinely permanent.
 */
export function flagOutcome(status: number | null, body: Record<string, unknown> | null | undefined): FlagOutcome {
  if (status === null) {
    return {
      text: "The request never came back — check Things to Address before flagging this again.",
      tone: "error",
      flagged: false,
    };
  }
  if (status === 200 && body?.ok === true) {
    return { text: "Added to Things to Address — it will still be there after you close this.", tone: "ok", flagged: true };
  }
  const detail = typeof body?.error === "string" ? body.error : "";
  return {
    text: detail || `Nothing was flagged (server said ${status}).`,
    tone: "error",
    flagged: false,
  };
}
