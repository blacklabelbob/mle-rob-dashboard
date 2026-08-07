// Q85 inc.3 — the same shape of defect inc.63 fixed for the DAY, now for the COMPANY: eleven
// rows are told nobody can say who the meeting was with, while their own title says it.
//
// inc.2's first live run is the evidence and it is exact. Of 46 orphaned archive rows, 15 were
// seen by a recorder (the rest are Q84's human-account pile, out of Q85's scope). ALL 15 fail
// at the company step: 11 carry an EMPTY "Company Meeting with" and 4 name a company the CRM
// does not hold. The planner reads `row.company` and nothing else, so a row like
//
//     "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery"
//
// is bucketed `no-company` with the sentence *"only someone who was there can say"*. That
// sentence is false on this row. The title states a host, the CRM's CG Roofing Group [C-2017]
// carries `cgroofinggroup.com`, and the two are equal after normalization — no edit distance,
// no guess.
//
// WHY THIS RETURNS A QUESTION AND NOT A MATCH, and the counter-example is in the same 15 rows:
//
//     "Robert Acheson, Austin Wilkins | Cloudflare / SEO optimization — 2026-08-03"
//
// Cloudflare is the TOPIC of that call, not the counterparty. It matches nothing today only
// because the CRM holds no Cloudflare org — and Rob adds vendors. A title names what a meeting
// was ABOUT at least as often as who it was WITH, and `row.company` is the field that claims
// the second. So a title host is reported as a near miss with the org named and its id
// attached, never auto-attached: this module keeps `activityPlan`'s standing rule that a call
// welded onto the wrong company is unrecoverable and an unattached one is a click.
//
// Extraction is strict on purpose. A token must survive `extractHost` — the SAME function the
// company-field path uses, imported and not re-implemented (this repo has twice paid to delete
// a second copy of one name rule) — and must additionally end in an alphabetic TLD, so a
// version number or a decimal in a title can never be read as a company address.

import { extractHost } from "./activityPlan";
import { normalizeName } from "@/lib/dedup/match";

/** Where a token boundary can fall inside a meeting title. `|` separates attendees from subject. */
const TOKEN_SPLIT = /[\s|,;+/(){}[\]<>"']+/;

/** Leading/trailing punctuation a human types around a host: "cgroofinggroup.com," → the host. */
const EDGE_PUNCT = /^[^a-z0-9]+|[^a-z0-9]+$/gi;

/**
 * A host must end in an alphabetic TLD of at least two characters. `extractHost` alone would
 * accept `1.5` or `2026.07` — fine for a Domain field a human filled in, wrong here, where the
 * input is a free-text title full of dates, versions and numbers nobody meant as an address.
 */
const ALPHA_TLD = /\.[a-z]{2,}$/;

/**
 * Every host-shaped token in a meeting title, normalized and de-duplicated, in the order they
 * appear. Returns `[]` when the title states no host — which is the common case and is not a
 * failure: it means this pass has nothing to add to that row.
 */
export function hostsInTitle(title: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (title || "").split(TOKEN_SPLIT)) {
    const trimmed = raw.replace(EDGE_PUNCT, "");
    if (!trimmed || !trimmed.includes(".")) continue;
    const host = extractHost(trimmed);
    if (!host || !ALPHA_TLD.test(host)) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/** One host stated in a title, and every CRM org registered at it. Never fewer than one org. */
export type TitleHostHit<Org> = { host: string; orgs: Org[] };

/**
 * The orgs a title's hosts hit, against an index the CALLER supplies — deliberately the same
 * `indexOrgsByHost` map `activityPlan` already built, so a title host and a company-field host
 * can never resolve to different companies.
 *
 * A title naming two known hosts returns both. Nothing here picks between them: a meeting whose
 * title names two companies is a question, and answering it by taking the first is the guess
 * this module exists to refuse.
 */
export function titleHostHits<Org>(
  title: string | null | undefined,
  hostIndex: Map<string, Org[]>
): TitleHostHit<Org>[] {
  const hits: TitleHostHit<Org>[] = [];
  for (const host of hostsInTitle(title)) {
    const orgs = hostIndex.get(host);
    if (orgs && orgs.length) hits.push({ host, orgs });
  }
  return hits;
}

// ── Q85 inc.4 — the title NAME near miss ─────────────────────────────────────────────────────
//
// inc.3 closed the 3 rows whose titles state a HOST. The remaining 12 in-scope rows state a
// company by NAME, and the pairs are not equal after normalization and never will be:
//
//     "Rob & Austin | MArtin Fierro"                        → Martin Fierro Restaurant [C-2005]
//     "Rob, Alex, Will, Chris | Gulf Coast RE + AI Platform" → Gulf Coast RE Group      [C-2018]
//
// The obvious tool for "close but not equal" is edit distance, and this module refuses to write
// on it. Edit distance cannot tell a typo from a different company: `Omega` and `Omego` are one
// character apart and so are `C-2005` and `C-2006`. Whatever threshold is chosen, the first
// wrong attach is unrecoverable, and this file's whole reason for existing is that a call
// welded onto the wrong company cannot be undone while an unattached one is a click.
//
// So the rule is WHOLE-TOKEN CONTAINMENT, which is exact everywhere it is applied: every
// significant token of the title's candidate must appear, character for character after
// normalization, in the org's own name. `gulf coast re` ⊆ `gulf coast re group`. `martin
// fierro` ⊆ `martin fierro restaurant`. No character is ever assumed to be a slip of a finger.
// The suffix an org carries and a speaker drops — Group, Restaurant, LLC — is exactly the
// difference this survives, and it is the difference actually present in the 12 rows.
//
// Two guards keep containment from degenerating into "matches everything":
//
//   1. At least TWO significant tokens. One token would make `AI Platform Discovery` hit any
//      org with `AI` in its name, and half this CRM has AI in its name.
//   2. Only the SUBJECT side of the title — what follows the last `|` — when the title has one.
//      The left side is the attendee list, and a person's name subset-matching an org name is
//      how "Rob" attaches a call to "Rob's Roofing".
//
// It still returns a QUESTION, for inc.3's reason unchanged: a title names what a call was
// ABOUT at least as often as who it was WITH. `Gulf Coast RE + AI Platform` is one segment of
// each, in one title.

/** A meeting title's subject side, minus the trailing date/source stamps a recorder appends. */
const TRAILING_STAMP = /\s*[—–-]\s*\d{4}-\d{2}-\d{2}\s*$|\s*\((?:fireflies|zoom|fathom)\)\s*$/gi;

/** Where one named thing ends and the next begins inside a subject: "Gulf Coast RE + AI Platform". */
const SEGMENT_SPLIT = /\s*(?:[+/,;]|&|—|–|\||\bvs\b|\band\b)\s*/gi;

/** A token that carries no identity: a date part, a version, a single letter, pure digits. */
function isSignificant(token: string): boolean {
  return token.length > 1 && !/^\d+$/.test(token);
}

/** The significant tokens of a normalized string, in order, de-duplicated. */
function significantTokens(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of value.split(" ")) {
    if (!token || !isSignificant(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/**
 * Every candidate company name a title states, normalized. `[]` when the title states none —
 * the common case, and not a failure: it means this pass has nothing to add to that row.
 */
export function nameCandidatesInTitle(title: string | null | undefined): string[] {
  const raw = (title || "").trim();
  if (!raw) return [];
  // Attendees live left of the last `|`; the subject lives right of it. A title with no `|` is
  // taken whole — the two-token guard is what keeps that safe.
  const bar = raw.lastIndexOf("|");
  const subject = (bar >= 0 ? raw.slice(bar + 1) : raw).replace(TRAILING_STAMP, "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of subject.split(SEGMENT_SPLIT)) {
    const normalized = normalizeName(segment);
    if (!normalized) continue;
    const tokens = significantTokens(normalized);
    // Two-token floor. One word is a topic, not an identification.
    if (tokens.length < 2) continue;
    const key = tokens.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** One name stated in a title, and every CRM org whose own name contains it whole. */
export type TitleNameHit<Org> = { candidate: string; orgs: Org[] };

/**
 * The orgs a title's candidate names contain-match, by whole token. Callers supply the orgs
 * rather than an index because containment cannot be looked up — every org is tested, which is
 * fine at this CRM's size (tens of orgs) and honest about the cost if it ever is not.
 *
 * A candidate hitting two orgs returns both. Nothing here picks between them: taking the first
 * is the guess this module exists to refuse.
 */
export function titleNameHits<Org extends { name: string }>(
  title: string | null | undefined,
  orgs: Org[]
): TitleNameHit<Org>[] {
  const orgTokens = orgs.map((org) => ({ org, tokens: new Set(significantTokens(normalizeName(org.name))) }));
  const hits: TitleNameHit<Org>[] = [];
  for (const candidate of nameCandidatesInTitle(title)) {
    const tokens = candidate.split(" ");
    const matched = orgTokens
      .filter(({ tokens: have }) => tokens.every((token) => have.has(token)))
      .map(({ org }) => org);
    if (matched.length) hits.push({ candidate, orgs: matched });
  }
  return hits;
}
