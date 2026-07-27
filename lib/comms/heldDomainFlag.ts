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
