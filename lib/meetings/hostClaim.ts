// Q84 inc.69 — inc.68 asked where the confirm click belongs: the ledger, or the org's own
// page. THE ANSWER IS THE ORG PAGE, and this module is what had to be true first.
//
// The reasoning, not a preference: the ledger row is a NOTICE about a company; the Domain
// field is that company's RECORD. An undo belongs in front of the person who made the edit,
// and on `/companies/C-2017` the field he just changed is on screen with its old value one
// click away — on the ledger the write would happen to a record that is not even rendered.
// The org page already has the box (inc.21) and the ledger already links straight to it
// (inc.19), so the route from "confirm" to "done" is two clicks with a visible before/after.
//
// WHAT WAS MISSING. inc.68 checked whether the DESTINATION slot was free — `domain` empty on
// this org. That is only half of "safe". The other half is whether the HOST is free, and
// nothing checked it: `orgs.domain` accepts any string, so the same host can be typed onto
// two different orgs, or onto an org that already resolves by it through `website`.
//
// Why a duplicate host is worse than a wrong one. `indexOrgsByHost` (activityPlan.ts) keys
// every org by BOTH of its hosts and returns a BUCKET. Two orgs in one bucket is not an
// error anywhere — `resolveCompanyFromAttendance` reports `ambiguous-orgs` and attaches
// nothing, deliberately. So a duplicated host does not break loudly: every meeting named by
// that host silently stops attaching, which is the exact symptom Q85 exists to fix. A guest
// host typed to make three meetings attach could instead detach the ones already working.
//
// Pure per CR-3: no clock, no network, no Supabase. Same `extractHost` as every other host
// comparison in this tree — a fourth parser is how two ladders drift apart (inc.4/inc.5).
//
// NOT a format validator. A value that names no host at all comes back `clear`: this guard
// answers "is this host already spoken for", and rejecting typos is a different question
// that would silently widen a collision check into an input mask.

import { extractHost, type CrmOrg } from "./activityPlan";

/**
 * Whether a host may be claimed for an org's second slot.
 *
 *   - `clear`       — no other record resolves by this host. The only state a write may take.
 *   - `own-website` — this org's OWN `website` is already this host. Writing it spends the
 *                     org's only remaining slot on a match it already has, and leaves the
 *                     second host it actually uses with nowhere to go.
 *   - `other-org`   — a DIFFERENT org stores this host. Writing it puts two orgs in one
 *                     `indexOrgsByHost` bucket, and every meeting named by that host stops
 *                     resolving — including the ones that resolve today.
 *
 * A subdomain is a different host, as it is everywhere else in this tree: `mail.acme.com`
 * against a stored `acme.com` is `clear`. Treating them as the same would block a legitimate
 * second host, and this guard refusing a real edit is the failure Rob would actually hit.
 */
export type HostClaim =
  | { kind: "clear" }
  | { kind: "own-website" }
  | { kind: "other-org"; org: CrmOrg; field: "website" | "domain" };

/**
 * Is `host` free to be stored as `org`'s second host?
 *
 * @param orgs every CRM org, including `org` itself — it is skipped by id, so a caller
 *   never has to pre-filter and cannot accidentally compare the org against a stale copy
 *   of itself.
 */
export function hostClaimConflict(host: string, org: CrmOrg, orgs: CrmOrg[]): HostClaim {
  const wanted = extractHost(host);
  if (!wanted) return { kind: "clear" };

  if (extractHost(org.website || "") === wanted) return { kind: "own-website" };

  for (const other of orgs) {
    if (other.id === org.id) continue;
    // `website` first: it is the host every org that has any host carries, so naming it in
    // the message points at the field a human would actually go look at.
    if (extractHost(other.website || "") === wanted) return { kind: "other-org", org: other, field: "website" };
    if (extractHost(other.domain || "") === wanted) return { kind: "other-org", org: other, field: "domain" };
  }
  return { kind: "clear" };
}

/**
 * What the person who just typed it reads. States what is already true and where, never a
 * bare "invalid" — a refusal that does not name the other record sends him hunting for it,
 * which is the same MS-DOS failure as a ledger row that ends in a terminal command (inc.13).
 */
export function hostClaimMessage(claim: HostClaim, host: string): string {
  const clean = extractHost(host) || host;
  switch (claim.kind) {
    case "clear":
      return "";
    case "own-website":
      return (
        `${clean} is already this company's Website, so it resolves by it today — a second ` +
        "slot spent here would leave its actual second host with nowhere to go"
      );
    case "other-org":
      return (
        `${clean} is already ${claim.org.name}'s ${claim.field === "website" ? "Website" : "Domain"} ` +
        `[${claim.org.id}] — one host on two companies makes every meeting named by it stop ` +
        "attaching to either, so this needs a human decision, not a second copy"
      );
  }
}
