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

import { handleFor, nextOrgId } from "../recordId";
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
  /** A record number (`C-2001`) — Q70. Never derived from the name; see lib/recordId.ts. */
  id: string;
  /**
   * The handle this row would have been keyed by before Q70 (`the-title-base`). Kept so old
   * links resolve and so a company stays findable by name. A LOOK-UP KEY ONLY.
   */
  legacySlug: string;
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

/**
 * The company's identity: a record number, never the name (Q70).
 *
 * This returned `slugify(name)` until Q70. Two companies with the same trading name — which
 * is common, and across states routine — collided into one row, and a rename made the id a
 * lie. `taken` now only decides which NUMBER is free.
 */
export function orgIdFor(name: string, domain: string, taken: Set<string>): string {
  void name;
  void domain;
  return nextOrgId(taken);
}

/**
 * The findable-by-name handle, which is what the id used to be.
 *
 * Same fallback ladder as before — name, then the domain's first label, then "org" — so it
 * can never be empty. A collision is now cosmetic; the ids already differ.
 */
export function orgHandleFor(name: string, domain: string, taken: Set<string>): string {
  // `"..."` splits to [""], so the `|| "org"` is what keeps the last resort reachable.
  return handleFor(name, domain.split(".")[0] || "org", taken);
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
  todayISO?: string,
  /**
   * Handles already in use, kept SEPARATE from `takenIds` — the same split
   * `planPersonFromEmail` already makes (Q70 inc.2). `takenIds` now holds record
   * numbers, so checking a name-handle against it can never collide and
   * `orgHandleFor`'s de-duplication silently stops working: two companies trading
   * under one name would both be minted `the-title-base`, and 0031's
   * `orgs_legacy_slug_key` UNIQUE INDEX rejects the second insert with a constraint
   * error nobody would connect to naming. Defaults to `takenIds` only so a caller
   * that has not been updated behaves exactly as it did.
   */
  takenHandles?: Iterable<string>
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
      legacySlug: orgHandleFor(name, domain, new Set(takenHandles ?? takenIds)),
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
 * Q69 increment 9: the same refusal, when the DATABASE is the one refusing.
 *
 * `planOrgFromProposal`'s `domain-already-known` reads a graph index built
 * BEFORE the reviewer's click. inc.8's `orgs_domain_unique` index exists
 * precisely because that read can be stale — a double-click on a slow route, or
 * two reviewers on the same queued proposal, both plan `create` and the second
 * INSERT is the one that fails. Without this, that failure surfaces as a 500:
 * the reviewer reads "server error" for the one outcome that is actually fine
 * (the company exists — someone else just made it a second earlier).
 *
 * MATCHED ON THE INDEX NAME, NOT ON "duplicate key": a 23505 on `orgs_pkey`
 * means the id slug collided, which is a real bug in `orgIdFor` — reporting it
 * as "this domain already belongs to someone" would bury it behind a friendly
 * sentence. The store flattens Postgres errors into a message string
 * (`supabaseStore.upsertPerson`), so the constraint name is the only part of
 * the original error that survives the trip; it is a stable DB artifact from
 * migration 0022.
 *
 * Pure and total (CR-3): any non-Error, null, or unrelated failure is `false`,
 * so the caller rethrows rather than swallowing an unknown write failure.
 */
export const ORG_DOMAIN_UNIQUE_INDEX = "orgs_domain_unique";

export function isOrgDomainConflict(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message.includes(ORG_DOMAIN_UNIQUE_INDEX);
}

/** The sentence the reviewer reads when the race is what refused them. */
export function domainRaceDetail(domain: string): string {
  return `${domain} was created by someone else while you were reviewing — nothing to create.`;
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
    // The handle was being computed and then dropped on the floor here, so the
    // de-duplication above had nothing downstream to protect. It travels with the
    // row now; whether the store persists it is `fromPerson`'s call, not ours.
    legacySlug: org.legacySlug,
    // SECOND instance of the same defect, in the same function, under the comment
    // written for the FIRST one. `domain` was computed, de-duplicated against, and
    // then dropped here — so `orgs_domain_unique` (a PARTIAL index, WHERE domain IS
    // NOT NULL) was guarding exactly one of 23 production rows. Keying a company on
    // its domain rather than its spoken name is the whole lesson of the Omega
    // identity chain; that rule was structurally unenforced until this line.
    domain: org.domain,
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
