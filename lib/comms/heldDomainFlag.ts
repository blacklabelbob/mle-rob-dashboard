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
       * the date he judged them, or null when the row carries no readable date.
       * Separate from `domains` on purpose: an open row stops the button, a
       * resolved one only informs it.
       */
      judged: Map<string, string | null>;
    }
  | { kind: "unknown" };

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
  const judged = new Map<string, string | null>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { status?: unknown; title?: unknown; resolved_at?: unknown };
    if (typeof r.title !== "string") continue;
    const domain = heldFlagDomain(r.title);
    if (!domain) continue;
    const d = domain.toLowerCase();
    if (r.status === "open") {
      domains.add(d);
      continue;
    }
    // Q69 inc.33 — a resolved row is a JUDGEMENT, and only an explicitly
    // resolved one is. A row whose status we cannot read is not evidence Rob
    // decided anything (same call inc.31 made about counting it as open).
    if (r.status !== "resolved") continue;
    judged.set(d, mostRecentJudgement(judged.get(d), judgementDate(r.resolved_at)));
  }
  return { kind: "read", domains, judged };
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
  if (outcome?.flagged) return { kind: "already", text: outcome.text };
  const d = (domain ?? "").trim().toLowerCase();
  if (d && index.kind === "read" && index.domains.has(d)) {
    return { kind: "already", text: "Already on Things to Address — waiting on your decision." };
  }
  return { kind: "button", judged: d && index.kind === "read" ? judgedNote(index.judged, d) : null };
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
function judgedNote(judged: Map<string, string | null>, domain: string): string | null {
  if (!judged.has(domain)) return null;
  const date = judged.get(domain) ?? null;
  const when = date ? ` on ${date}` : " earlier";
  return `You already resolved this${when} — flag it again only if something has changed.`;
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
 * THE HINT DOES NOT PROMISE SILENCE. inc.31's dedupe counts only `open` rows,
 * so resolving this makes the domain flaggable again — deliberately: a re-found
 * domain is a new question. The reviewer is told that here, because "resolve"
 * elsewhere on this ledger means "this stops coming back", and a row that
 * quietly returns next week looks like a bug rather than the design.
 */
export function heldRowCopy(title: string): HeldRowCopy | null {
  const domain = heldFlagDomain(title);
  if (!domain) return null;
  const d = domain.toLowerCase();
  return {
    domain: d,
    badge: `${d} · still blocked`,
    hint:
      `Resolving files your decision — it does not unblock ${d} and does not delete anything. ` +
      `If the company still holds it, the blocklist sweep will raise it again.`,
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
export function heldArchiveNote(title: string, resolvedAt: unknown): string | null {
  const domain = heldFlagDomain(title);
  if (!domain) return null;
  const d = domain.toLowerCase();
  const date = judgementDate(resolvedAt);
  const when = date ? `on ${date}` : "earlier";
  return (
    `You judged ${d} ${when}. It stays blocked and nothing was deleted — ` +
    `if a company still holds it, the blocklist sweep will raise a new row.`
  );
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
