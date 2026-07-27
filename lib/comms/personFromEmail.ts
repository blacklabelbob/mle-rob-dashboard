// Q69 (Email → company graph), increment 10: the PEOPLE half, and the merge.
//
// Everything Q69 has built so far anchors mail. Rung 3 — "we know the company,
// not the human" — files the email onto the ORG and the human stays invisible:
// the rep sees a message from someone who does not exist in the CRM. Q69's own
// scope says "auto-create orgs+people"; the orgs half shipped in inc.4–9, this
// is the people half, plus the second thing that scope names by SQL —
// `ON CONFLICT … COALESCE/LEAST/GREATEST`, the upsert-as-MERGE.
//
// The merge rule is the whole point. An email knows one fact (an address) and
// guesses at a second (a display name). A record Rob typed knows a dozen. So a
// merge FILLS BLANKS and never overwrites: an email can give a person their
// email and their org, it cannot rename them, re-phone them, or touch a single
// money or commitment field — those are structurally absent from `fills`.
//
// Pure (CR-3): no store, no clock, no network. `capturedAtISO` is injected and
// the caller executes the returned plan verbatim.

import { domainOf, isGenericDomain, isRoleAccount, type GraphIndex, type GraphPlan } from "./emailGraph";
import type { Person } from "../types";

/** One address as it appeared in the header, display name still attached. */
export interface EmailParty {
  /** Already normalised by `extractAddress` — lowercase, no angle brackets. */
  address: string;
  /** The raw header value ("Dana Reyes <dana@roofco.com>"), if we have it. */
  raw?: string;
}

/**
 * The row to insert. Like `NewOrgRow`, money and commitment fields are
 * STRUCTURALLY absent — `quotedAmount`, `signed`, `keyDates.paid` cannot be set
 * from an email even by accident. That is the driver's HARD LIMIT expressed as
 * a type rather than a promise.
 */
export interface NewPersonRow {
  id: string;
  name: string;
  email: string;
  orgId: string;
  business?: string;
  verticalId: string;
  entityKind: "person";
  /** A human known only from one email is a lead. Never a client. */
  nodeType: "lead";
  status: "unlit";
  /** LEAST's seed: the earliest contact we can evidence. */
  metISO: string;
  notes: string;
}

/** The blank-filling half of the upsert. Only ever these four keys. */
export interface PersonFills {
  email?: string;
  orgId?: string;
  business?: string;
  /** LEAST(existing.met, thisEmail) — see `earliestMet`. */
  met?: string;
}

export type PersonSkipReason =
  | "no-anchor"
  | "role-account"
  | "generic-domain"
  | "unknown-org"
  | "nothing-to-merge";

export type PersonPlan =
  | { kind: "create"; person: NewPersonRow }
  | { kind: "merge"; personId: string; fills: PersonFills }
  | { kind: "skip"; reason: PersonSkipReason; detail: string };

/** The org row the plan attaches to — only the three fields creation needs. */
export interface AnchorOrg {
  id: string;
  name?: string;
  verticalId: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Same never-empty, never-colliding shape as `orgIdFor`, seeded from the address. */
export function personIdFor(name: string, address: string, taken: Set<string>): string {
  const local = address.slice(0, Math.max(address.lastIndexOf("@"), 0));
  const base = slugify(name) || slugify(local) || "person";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The name, taken from the header — NEVER prettified out of the local part.
 *
 * `j.smith22@roofco.com` becomes "J Smith22" under any local-part heuristic,
 * and that string is then the human's name in Rob's CRM forever. inc.4 refused
 * to invent a company name from a domain for exactly this reason. So: the
 * display name if the sender wrote one, otherwise the ADDRESS itself — ugly on
 * screen, but true, and it tells the rep at a glance that nobody has named this
 * person yet.
 */
export function displayNameFrom(party: EmailParty): string {
  const raw = (party.raw ?? "").trim();
  const angled = raw.indexOf("<");
  let name = angled > 0 ? raw.slice(0, angled) : "";
  name = name.trim().replace(/^["']|["']$/g, "").trim();
  // "dana@roofco.com <dana@roofco.com>" — a display name that is just the
  // address again is not a name, it is the address twice.
  if (!name || name.toLowerCase() === party.address) return party.address;
  return name;
}

// A header `Date` is attacker-controllable and routinely wrong. A 1970 or 2099
// stamp that reached LEAST would back-date `met` to the epoch on a record Rob
// reads as first-contact history, so anything outside a sane window is treated
// as no date at all rather than as evidence.
const MET_FLOOR_ISO = "2000-01-01";

export function usableMet(emailDateISO: string | undefined, capturedAtISO: string): string {
  const day = (emailDateISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return capturedAtISO.slice(0, 10);
  if (day < MET_FLOOR_ISO) return capturedAtISO.slice(0, 10);
  if (day > capturedAtISO.slice(0, 10)) return capturedAtISO.slice(0, 10);
  return day;
}

/**
 * LEAST(existing, incoming) — the earliest date wins.
 *
 * An email dated before the recorded first contact is EVIDENCE that contact
 * started earlier, so `met` moves back. It never moves forward: a later email
 * says nothing about when we met, and advancing that date would rewrite the
 * record's history every time someone replied to a thread.
 */
export function earliestMet(existing: string | undefined, incoming: string): string | undefined {
  const have = (existing ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(have)) return incoming; // blank → COALESCE fills it
  return incoming < have ? incoming : undefined; // undefined = leave the row alone
}

function provenance(address: string, orgName: string | undefined, whenISO: string): string {
  const at = orgName ? ` at ${orgName}` : "";
  return `Created from an email${at} on ${whenISO} — ${address} wrote from a domain the CRM already owns. Nothing beyond the address and the header name is confirmed.`;
}

/**
 * Plan the person write for ONE counterpart of one captured email.
 *
 * Creation is deliberately narrow — only rung 3 (`kind: "org"`), the one case
 * where a company is already ours and the human is not:
 *
 *  • NO ANCHOR — rung 6 (`propose-org`) has no company to attach to yet, and a
 *    person row with no `orgId` is a floating contact nobody can find. The org
 *    proposal is reviewed first; the person follows the company, never leads.
 *
 *  • ROLE ACCOUNT — rungs 1–3 sit ABOVE the noise filters by design, so
 *    `billing@roofco.com` correctly anchors its mail to the org. It must not
 *    also become a human named "Billing" sitting in the rep's contact list.
 *
 *  • GENERIC DOMAIN — belt and braces. The index can only reach rung 3 for a
 *    domain a company owns, but if a `gmail.com` org ever slipped in, this
 *    refuses to hang every consumer address on earth off it.
 *
 * Rungs 1/2 (`kind: "person"`) are the MERGE path: we already know this human,
 * so the email may only fill what is blank.
 */
export function planPersonFromEmail(args: {
  plan: GraphPlan;
  party: EmailParty;
  index: GraphIndex;
  org?: AnchorOrg;
  existing?: Person;
  takenIds?: Iterable<string>;
  capturedAtISO: string;
  emailDateISO?: string;
}): PersonPlan {
  const { plan, party, index, org, existing, capturedAtISO, emailDateISO } = args;
  const address = party.address.trim().toLowerCase();
  const when = usableMet(emailDateISO, capturedAtISO);

  if (plan.kind === "person") {
    if (!existing) {
      return {
        kind: "skip",
        reason: "nothing-to-merge",
        detail: `${plan.personId} matched the ladder but was not loaded — refusing to merge into a row we cannot read.`,
      };
    }
    const fills: PersonFills = {};
    // COALESCE: a filled field is never overwritten. Rob's typed name, phone,
    // status and every money field are untouchable from here.
    if (!existing.email?.trim()) fills.email = address;
    if (!existing.orgId?.trim() && org?.id) fills.orgId = org.id;
    if (!existing.business?.trim() && org?.name) fills.business = org.name;
    const met = earliestMet(existing.keyDates?.met, when);
    if (met) fills.met = met;
    if (Object.keys(fills).length === 0) {
      return {
        kind: "skip",
        reason: "nothing-to-merge",
        detail: `${existing.id} already carries everything this email knows.`,
      };
    }
    return { kind: "merge", personId: existing.id, fills };
  }

  if (plan.kind !== "org") {
    return {
      kind: "skip",
      reason: "no-anchor",
      detail: `${address} anchored no company (${plan.kind}) — a person with no org is a floating row.`,
    };
  }

  if (isRoleAccount(address)) {
    return {
      kind: "skip",
      reason: "role-account",
      detail: `${address} is a role account — its mail belongs to the company, not to a person named after the mailbox.`,
    };
  }
  const domain = domainOf(address);
  if (isGenericDomain(domain, index.genericDomains)) {
    return {
      kind: "skip",
      reason: "generic-domain",
      detail: `${domain} is a generic mail domain — no company owns it, so no person hangs off it.`,
    };
  }
  if (!org || org.id !== plan.orgId) {
    return {
      kind: "skip",
      reason: "unknown-org",
      detail: `The ladder anchored ${plan.orgId} but that company row was not supplied — refusing to create a person against an org we cannot read.`,
    };
  }

  const name = displayNameFrom({ address, raw: party.raw });
  return {
    kind: "create",
    person: {
      id: personIdFor(name, address, new Set(args.takenIds ?? [])),
      name,
      email: address,
      orgId: org.id,
      business: org.name,
      verticalId: org.verticalId,
      entityKind: "person",
      nodeType: "lead",
      status: "unlit",
      metISO: when,
      notes: provenance(address, org.name, when),
    },
  };
}
