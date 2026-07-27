// Q69 increment 2: the index the ladder reads, built from what the CRM already
// has. `planEmailGraph` (emailGraph.ts) is deliberately store-free — it takes an
// index and returns a plan. This is the one place that knows our row shape, so
// the ladder never learns about `Person`, `entityKind` or `website`.
//
// Pure (CR-3): no clock, no network, no writes.

import type { NetworkData, Person } from "../types";
import { type GraphIndex, isGenericDomain } from "./emailGraph";
import { genericDomainSet } from "./genericDomains";

// "https://www.ProplogiX.com/about?x=1" → "proplogix.com". A website field is
// typed by hand, so it arrives as a bare host as often as a URL — parse both
// without `new URL()`, which throws on the bare-host form.
export function domainFromWebsite(raw: string | undefined): string {
  if (!raw) return "";
  let host = raw.trim().toLowerCase();
  if (!host) return "";
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  host = host.replace(/^[^/@]*@/, ""); // userinfo, if someone pasted one
  host = host.split(/[/?#]/)[0]; // path, query, fragment
  host = host.split(":")[0]; // port
  host = host.replace(/\.+$/, ""); // trailing root dot
  if (host.startsWith("www.")) host = host.slice(4);
  // A host with no dot is not a domain we can match mail against.
  return host.includes(".") ? host : "";
}

function emailDomain(raw: string | undefined): string {
  if (!raw) return "";
  const at = raw.trim().toLowerCase().lastIndexOf("@");
  const value = at > 0 ? raw.trim().toLowerCase().slice(at + 1) : "";
  return value.includes(".") ? value : "";
}

const isCompany = (p: Person) => p.entityKind === "company";

/**
 * Build the ladder's index from the network.
 *
 * Two rules earn their keep here:
 *
 *  • ONLY company rows contribute a domain. A person's own address must never
 *    claim their employer's domain — rung 3 would then anchor a colleague's
 *    mail onto one individual's record instead of the org.
 *
 *  • A COMPANY AT A GENERIC DOMAIN CLAIMS NOTHING. A one-person roofing shop
 *    whose only address is `@gmail.com` is a real row, but letting it own
 *    `gmail.com` would anchor every consumer address on earth to that company.
 *    Its own address still matches exactly, on rung 1, where it belongs.
 *
 * First writer wins, so the index is a deterministic function of row order and
 * a later duplicate can never silently steal an established domain. But "first
 * wins" is only a tie-break, not an answer: Q69 inc.8 records the tie itself in
 * `contestedDomains`, so the ladder can refuse a domain two companies claim
 * instead of anchoring mail on whichever row the store happened to return
 * first. 0022's unique index stops NEW collisions on the `domain` column; this
 * catches the pair that index structurally cannot — one org's `website` and
 * another's `email` resolving to the same host.
 *
 * A row claiming the same domain TWICE (website and email agree, the normal
 * case) is not a contest — the claimant is compared by id, not by count.
 */
export function buildGraphIndex(
  data: NetworkData,
  extraGenericDomains: Iterable<string> = []
): GraphIndex {
  const genericDomains = genericDomainSet(extraGenericDomains);
  const personIdByEmail = new Map<string, string>();
  const orgIdByDomain = new Map<string, string>();
  const contestedDomains = new Set<string>();

  for (const p of data.people) {
    const email = p.email?.trim().toLowerCase();
    if (email && email.includes("@") && !personIdByEmail.has(email)) {
      personIdByEmail.set(email, p.id);
    }
    if (!isCompany(p)) continue;
    for (const domain of [domainFromWebsite(p.website), emailDomain(p.email)]) {
      if (!domain) continue;
      if (isGenericDomain(domain, genericDomains)) continue;
      const claimant = orgIdByDomain.get(domain);
      if (claimant === undefined) orgIdByDomain.set(domain, p.id);
      else if (claimant !== p.id) contestedDomains.add(domain);
    }
  }

  return { personIdByEmail, orgIdByDomain, genericDomains, contestedDomains };
}
