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
