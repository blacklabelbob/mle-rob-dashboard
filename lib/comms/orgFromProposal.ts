// Q69 (Email → company graph), increment 4: the reviewer's one-click.
//
// inc.3 gave rung 6 somewhere to land — an outbound email to a company we have
// never dealt with queues a needs-action item on the ledger. This module is the
// other half: turning a REVIEWED proposal into the exact org row to create.
//
// The rule from inc.1 does not bend here, it moves up a level: rung 6 proposes,
// and only a human's explicit act creates. So this planner refuses to invent
// the two things a proposal cannot know — the company's NAME and its VERTICAL.
// The domain guess ("The Title Base" from `the-title-base.com`) may be what the
// reviewer confirms, but confirming is an act; defaulting is a fabrication.
//
// Pure (CR-3): no network, no clock (`todayISO` is injected), no writes. The
// route executes the returned plan verbatim and invents no ops of its own.

import { isGenericDomain, type GraphIndex } from "./emailGraph";
import type { Person } from "../types";

/** What the reviewer supplies when they accept a queued proposal. */
export interface ReviewedProposal {
  /** The flag's entity — the domain, which is the one fact the proposal owns. */
  domain: string;
  /** The reviewer's confirmed name. The domain guess is a suggestion, not this. */
  name: string;
  /** Required: `orgs.vertical_id` is NOT NULL and an FK. */
  verticalId: string;
  /** The address we sent to, carried through as the provenance line only. */
  address?: string;
}

/**
 * The row to insert. Money and commitment fields are structurally absent —
 * `quoted_amount`, `signed`, `paid` cannot be set from here even by accident,
 * which is the HARD LIMIT written into the driver's brief.
 */
export interface NewOrgRow {
  id: string;
  name: string;
  verticalId: string;
  domain: string;
  website: string;
  entityKind: "company";
  /** A company known only from one outbound email is a lead. Never a client. */
  nodeType: "lead";
  /** No contact back yet — `unlit` is the honest starting state. */
  status: "unlit";
  notes: string;
}

export type OrgCreateRefusal =
  | "domain-already-known"
  | "generic-domain"
  | "invalid-domain"
  | "name-required"
  | "vertical-required"
  | "unknown-vertical";

export type OrgCreatePlan =
  | { kind: "create"; org: NewOrgRow }
  | { kind: "refused"; reason: OrgCreateRefusal; detail: string };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A never-empty, never-colliding id.
 *
 * The name slug is preferred (`the-title-base`), but a name made entirely of
 * punctuation slugs to "" — so the domain's first label is the fallback, and
 * `org` the last resort. An empty id would collide with itself forever.
 */
export function orgIdFor(name: string, domain: string, taken: Set<string>): string {
  const base = slugify(name) || slugify(domain.split(".")[0] ?? "") || "org";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function provenance(domain: string, address: string | undefined, todayISO?: string): string {
  const when = todayISO ? ` on ${todayISO}` : "";
  const to = address ? ` to ${address}` : "";
  return `Created from the new-domain proposal for ${domain} — first outbound contact${to}${when}. No inbound history; nothing about this company is confirmed beyond the address we wrote to.`;
}

/**
 * Plan the create for one reviewed proposal.
 *
 * Refuses rather than guesses, in five ways that each prevent a specific mess:
 *
 *  • DOMAIN ALREADY KNOWN — between the proposal being queued and reviewed,
 *    someone may have created the company by hand (or a second flag slipped
 *    through). Creating anyway splits one company across two rows, and every
 *    later email anchors to whichever the index happened to pick first.
 *
 *  • GENERIC DOMAIN — the blocklist gates CREATION at every layer, including a
 *    reviewer clicking through. An org owning `gmail.com` would anchor every
 *    consumer address on earth to it (the inc.2 index rule, enforced upstream).
 *
 *  • NAME REQUIRED — the domain guess rides in the flag detail as a labelled
 *    suggestion. If nobody confirmed it, `mail.roofco.com` becomes a company
 *    called "Mail" and lives in Rob's CRM under that name forever.
 *
 *  • VERTICAL REQUIRED / UNKNOWN — `orgs.vertical_id` is a NOT NULL FK. Caught
 *    here, the reviewer reads "pick a vertical"; uncaught, they read a Postgres
 *    foreign-key error and the click looks broken.
 */
export function planOrgFromProposal(
  reviewed: ReviewedProposal,
  index: GraphIndex,
  takenIds: Iterable<string>,
  knownVerticalIds: Iterable<string>,
  todayISO?: string
): OrgCreatePlan {
  const domain = reviewed.domain.trim().toLowerCase().replace(/\.+$/, "");
  if (!domain || !domain.includes(".") || /[\s@/]/.test(domain)) {
    return { kind: "refused", reason: "invalid-domain", detail: `"${reviewed.domain}" is not a domain.` };
  }
  if (isGenericDomain(domain, index.genericDomains)) {
    return {
      kind: "refused",
      reason: "generic-domain",
      detail: `${domain} is a generic mail domain — a company cannot own it.`,
    };
  }
  const owner = index.orgIdByDomain.get(domain);
  if (owner) {
    return {
      kind: "refused",
      reason: "domain-already-known",
      detail: `${domain} already belongs to ${owner} — nothing to create.`,
    };
  }
  const name = reviewed.name.trim();
  if (!name) {
    return {
      kind: "refused",
      reason: "name-required",
      detail: `Confirm the company name for ${domain} — the domain guess is a suggestion, not a name.`,
    };
  }
  const verticalId = reviewed.verticalId.trim();
  if (!verticalId) {
    return { kind: "refused", reason: "vertical-required", detail: `Pick a vertical for ${name}.` };
  }
  if (!new Set(knownVerticalIds).has(verticalId)) {
    return {
      kind: "refused",
      reason: "unknown-vertical",
      detail: `"${verticalId}" is not a vertical in the registry.`,
    };
  }
  return {
    kind: "create",
    org: {
      id: orgIdFor(name, domain, new Set(takenIds)),
      name,
      verticalId,
      domain,
      website: `https://${domain}`,
      entityKind: "company",
      nodeType: "lead",
      status: "unlit",
      notes: provenance(domain, reviewed.address?.trim() || undefined, todayISO),
    },
  };
}

/**
 * Q69 increment 5: the plan's row, in the shape the store actually writes.
 *
 * `NewOrgRow` is deliberately narrow — the money and commitment fields are not
 * on it, so they cannot be set from a reviewer's click. That narrowness has to
 * survive the trip into `Person`, which DOES carry them, so this is the one
 * place the widening happens and it is explicit about every field it sets:
 * `signed: false`, no `quotedAmount`, and an EMPTY `keyDates` — a quoted or
 * paid date on a company we have only emailed once would be a fabricated
 * money fact on a money surface (driver HARD LIMIT).
 *
 * Pure (CR-3): no clock — the plan already carries the dated provenance line.
 */
export function newOrgToPerson(org: NewOrgRow): Person {
  return {
    id: org.id,
    name: org.name,
    entityKind: org.entityKind,
    nodeType: org.nodeType,
    verticalId: org.verticalId,
    website: org.website,
    status: org.status,
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    notes: org.notes,
  };
}
