// Q69 (Email → company graph), increment 1: the matching ladder, pure.
//
// Today `lib/n8nEmail.ts:matchContact` implements exactly rung 1 of this ladder
// — an exact hit on `people.email` — and a new person at a company we already
// know falls off the timeline entirely. This module is the whole ladder, with
// no store, no clock and no network in it (CR-3): it takes the counterpart
// address, the direction, and an index of what the CRM already knows, and
// returns what SHOULD happen. Nothing here writes; the caller does.
//
// Ported from the Macro teardown (docs/research/macro-teardown-2026-07-25/
// 07-comms.md §A.3, D4), whose one load-bearing rule is rung 7.

export type EmailDirection = "inbound" | "outbound";

export type GraphPlan =
  // Rung 1/2 — we know this human. Thread onto their record.
  | { kind: "person"; personId: string; address: string; domain: string }
  // Rung 3 — we know the company, not the human. Anchor the org, propose the person.
  | { kind: "org"; orgId: string; address: string; domain: string }
  // Rung 6 — outbound to a domain we have never dealt with. PROPOSE, never create.
  | { kind: "propose-org"; address: string; domain: string }
  // Rungs 4, 5, 7 — associate nothing, and say which rung refused.
  | { kind: "none"; reason: GraphSkipReason; address: string; domain: string };

export type GraphSkipReason =
  | "unparseable-address"
  | "generic-domain"
  | "role-account"
  | "inbound-unknown-domain"
  | "contested-domain";

// The index the ladder reads. Built by the caller from the store; keyed lowercase
// so the ladder never re-normalises (two normalisers is how a lookup misses).
export interface GraphIndex {
  personIdByEmail: Map<string, string>;
  orgIdByDomain: Map<string, string>;
  genericDomains: Set<string>;
  /**
   * Domains claimed by MORE THAN ONE company row. `orgIdByDomain` keeps the
   * first claimant so the map stays total, but a contested domain must never
   * anchor mail — see the rung-3 note in `planEmailGraph`.
   */
  contestedDomains: Set<string>;
}

// RFC-reserved suffixes. These ARE a suffix rule — but only on a label boundary,
// so `mytest.com` is never mistaken for `.test`.
const RESERVED_TLDS = [".test", ".local", ".localhost", ".internal", ".invalid", ".example"];

// Role accounts, matched against the WHOLE local part, never a substring:
// `infosec@roofco.com` is a person, `info@roofco.com` is a front desk.
const ROLE_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "support",
  "help",
  "helpdesk",
  "info",
  "billing",
  "invoices",
  "accounts",
  "accounting",
  "admin",
  "administrator",
  "hello",
  "hi",
  "contact",
  "sales",
  "marketing",
  "news",
  "newsletter",
  "bounce",
  "bounces",
  "mailer-daemon",
  "postmaster",
  "abuse",
  "webmaster",
  "unsubscribe",
]);

// The domain is what follows the LAST `@`. `indexOf` would read a quoted local
// part (`"a@b"@roofco.com`) as domain `b"@roofco.com` — a domain that matches
// nothing, so a real company silently becomes rung 6 forever.
export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return "";
  return address.slice(at + 1).trim().toLowerCase();
}

export function localPartOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "";
  // `billing+acct-2026@` is still billing: the tag is stripped before comparing,
  // or every plus-addressed role account reads as a named human.
  const raw = address.slice(0, at).trim().toLowerCase();
  const plus = raw.indexOf("+");
  return plus > 0 ? raw.slice(0, plus) : raw;
}

// Exact membership, NEVER `endsWith`. `"notgmail.com".endsWith("gmail.com")` is
// true, and a roofing company at notgmail.com would be dropped by a filter whose
// entire stated purpose is to drop consumer mail.
export function isGenericDomain(domain: string, generic: Set<string>): boolean {
  if (!domain) return false;
  if (generic.has(domain)) return true;
  return RESERVED_TLDS.some((tld) => domain.endsWith(tld));
}

export function isRoleAccount(address: string): boolean {
  return ROLE_LOCAL_PARTS.has(localPartOf(address));
}

/**
 * The ladder. Order is the design:
 *
 *   1/2. known person            → anchor them
 *   3.   known org domain        → anchor the org
 *   4.   generic domain          → nothing
 *   5.   role local part         → nothing
 *   6.   unknown domain, sent    → PROPOSE an org
 *   7.   unknown domain, received→ nothing            ← the rule that makes it a CRM
 *
 * Rungs 1–3 sit ABOVE the noise filters on purpose. The blocklist decides what
 * we CREATE, not what we RECOGNISE: a customer whose address is @gmail.com is
 * already a person row, and letting rung 4 fire first would drop their mail off
 * the timeline of a record that visibly exists.
 */
export function planEmailGraph(
  address: string,
  direction: EmailDirection,
  index: GraphIndex
): GraphPlan {
  const normalized = address.trim().toLowerCase();
  const domain = domainOf(normalized);
  if (!domain) {
    return { kind: "none", reason: "unparseable-address", address: normalized, domain: "" };
  }

  const personId = index.personIdByEmail.get(normalized);
  if (personId) return { kind: "person", personId, address: normalized, domain };

  // Rung 3, with the ambiguity rule that already governs rung 1's twin: if two
  // company rows both claim this domain, there is no fact here to file on. The
  // first claimant is an artefact of row order, and a call/email on the wrong
  // company is a lie the rep cannot see, where an unfiled one is a visible
  // absence. Refusing also keeps rung 6 from "fixing" it by proposing a THIRD
  // row for a domain we already hold twice.
  if (index.contestedDomains.has(domain)) {
    return { kind: "none", reason: "contested-domain", address: normalized, domain };
  }
  const orgId = index.orgIdByDomain.get(domain);
  if (orgId) return { kind: "org", orgId, address: normalized, domain };

  // Rungs 4 and 5 compose orthogonally (Macro's own note): `support@gmail.com`
  // is caught by the local part, `jane@gmail.com` by the domain.
  if (isGenericDomain(domain, index.genericDomains)) {
    return { kind: "none", reason: "generic-domain", address: normalized, domain };
  }
  if (isRoleAccount(normalized)) {
    return { kind: "none", reason: "role-account", address: normalized, domain };
  }

  if (direction === "outbound") {
    return { kind: "propose-org", address: normalized, domain };
  }
  return { kind: "none", reason: "inbound-unknown-domain", address: normalized, domain };
}
