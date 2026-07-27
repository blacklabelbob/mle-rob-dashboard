// Q69 inc.27 — "I blocked bigmailer.com. Is the company it already made still
// in my CRM?"
//
// inc.26 made the blocklist editable from the Overview. It left one honest
// question with no answer on any surface: blocking a domain TODAY does not undo
// the org it created YESTERDAY. The block is forward-only by design — it stops
// the NEXT email from claiming a company — and silence about the row that
// already exists reads as "handled", which it is not.
//
// This is the READ-ONLY half: at add time, say what already holds the domain.
// Nothing here deletes, merges, or renames anything (HARD LIMIT: no record is
// touched without a Rob instruction). It reports, and hands the reviewer the
// record so they can decide.
//
// THREE STATES, NOT TWO. A lookup that FAILED is not a lookup that found
// nothing: "no company holds this domain" is a claim about the database, and we
// only get to make it from a successful read. Saying it after a failed query is
// how a reviewer blocks a sender, believes their CRM is clean, and never opens
// the org that is still sitting there. `unknown` exists for exactly that.
//
// Pure (CR-3): no clock, no network, no Supabase client.

export type ClaimingOrg = { id: string; name: string; domain: string | null };

export type DomainClaim =
  /** Read succeeded, nothing holds it. Safe to say so. */
  | { kind: "none"; text: "" }
  /** Read succeeded, these org rows already hold it. Forward-only block stated. */
  | { kind: "claimed"; orgs: ClaimingOrg[]; peopleCount: number; text: string }
  /** Read failed or never ran. Never rendered as "none". */
  | { kind: "unknown"; text: string };

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Mirrors migration 0022's `lower(domain)` unique index, and inc.24's
 * normalizer, so the panel agrees with the constraint the database enforces —
 * a `BigMailer.com` org row must not read as unclaimed just because it was
 * typed in caps.
 */
export function orgHoldsDomain(org: ClaimingOrg, domain: string): boolean {
  const held = (org.domain ?? "").trim().toLowerCase();
  return held !== "" && held === domain.trim().toLowerCase();
}

/**
 * @param domain    the normalized domain being blocked
 * @param orgs      org rows whose `domain` matched, from a SUCCESSFUL read
 * @param peopleCount contacts attached to those orgs, or null when uncounted
 */
export function describeDomainClaim(
  domain: string,
  orgs: ClaimingOrg[],
  peopleCount: number | null
): DomainClaim {
  const held = orgs.filter((o) => orgHoldsDomain(o, domain));
  if (held.length === 0) return { kind: "none", text: "" };

  const names = held.map((o) => o.name).join(", ");
  const count = peopleCount ?? 0;
  // The people line is omitted rather than guessed at when uncounted — "0
  // contacts" would be a number we did not measure, on a record the reviewer is
  // about to judge.
  const who =
    peopleCount === null
      ? ""
      : ` with ${count} ${plural(count, "contact", "contacts")} attached`;

  return {
    kind: "claimed",
    orgs: held,
    peopleCount: count,
    text:
      `Heads up: ${names} already holds ${domain}${who}. Blocking it stops NEW companies ` +
      `being created from ${domain} — it does not remove or change ${plural(held.length, "that record", "those records")}. ` +
      `Open ${plural(held.length, "it", "them")} to decide.`,
  };
}

/** The read did not succeed. Say that, never "nothing holds it". */
export function unknownDomainClaim(domain: string, reason?: string): DomainClaim {
  return {
    kind: "unknown",
    text:
      `Couldn't check whether a company already holds ${domain}${reason ? ` (${reason})` : ""}. ` +
      `The block still applies to new email, but an existing company on this domain would be unaffected either way.`,
  };
}

/** Record links for the claiming orgs — the reviewer's next click. */
export function claimLinks(claim: DomainClaim): { id: string; name: string; href: string }[] {
  if (claim.kind !== "claimed") return [];
  return claim.orgs.map((o) => ({ id: o.id, name: o.name, href: `/companies/${o.id}` }));
}
