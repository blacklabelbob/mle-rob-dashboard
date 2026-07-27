// Q69 (Email → company graph), increment 11: the batch seam — one email, many
// counterparts, one set of person writes.
//
// inc.10 built `planPersonFromEmail`, which decides ONE address. Nothing called
// it. A real message has several counterparts (from + to + cc), and deciding
// them one at a time in the route would put four things a component must not
// own in a request handler: which addresses count, where the anchor org row
// comes from, which ids are already taken, and how a plan becomes a `Person`.
//
// The id accumulator is the reason this is a batch, not a loop over a single
// planner: two strangers at the same company on one thread both slugify to the
// same base id, and `personIdFor` can only avoid a collision it is told about.
// Ids taken by rows THIS email is creating are added as they are minted, so the
// second person becomes `dana-reyes-2` instead of overwriting the first.
//
// Pure (CR-3): no store, no clock, no network — the caller passes the network
// snapshot it already loaded and executes the returned writes verbatim.

import {
  domainOf,
  isGenericDomain,
  planEmailGraph,
  type EmailDirection,
  type GraphIndex,
} from "./emailGraph";
import {
  planPersonFromEmail,
  type AnchorOrg,
  type EmailParty,
  type PersonFills,
  type NewPersonRow,
  type PersonSkipReason,
} from "./personFromEmail";
import type { NetworkData, Person } from "../types";

export interface PersonCreateWrite {
  kind: "create";
  address: string;
  person: Person;
}

export interface PersonMergeWrite {
  kind: "merge";
  address: string;
  personId: string;
  fills: PersonFills;
  /** The existing row with the blanks filled — what the caller upserts. */
  person: Person;
}

export type PersonWrite = PersonCreateWrite | PersonMergeWrite;

export interface PersonSkip {
  address: string;
  reason: PersonSkipReason;
  detail: string;
}

export interface PeoplePlan {
  writes: PersonWrite[];
  skipped: PersonSkip[];
}

/**
 * A brand-new row as a domain `Person`.
 *
 * Every field the ledger requires is set here explicitly, and the money and
 * commitment fields are set to their EMPTY values, never carried in from
 * anywhere: `signed: false`, `keyDates` holding nothing but `met`, no
 * `quotedAmount`. `NewPersonRow` cannot express those fields (inc.10's type as
 * a promise); this is the one place they could have leaked back in.
 */
export function personFromNewRow(row: NewPersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    orgId: row.orgId,
    business: row.business,
    verticalId: row.verticalId,
    entityKind: row.entityKind,
    nodeType: row.nodeType,
    status: row.status,
    signed: false,
    keyDates: { met: row.metISO },
    phaseOne: "not-started",
    notes: row.notes,
  };
}

/**
 * The existing row with ONLY the four blanks `PersonFills` can fill.
 *
 * Returns a new object — the caller still holds the snapshot row and a mutation
 * here would change what the rest of the request reads. Everything else on the
 * row is copied through untouched: this is `COALESCE`, not an overwrite, and a
 * spread of `fills` over the row would have been the overwrite.
 */
export function mergedPerson(existing: Person, fills: PersonFills): Person {
  const merged: Person = { ...existing, keyDates: { ...existing.keyDates } };
  if (fills.email) merged.email = fills.email;
  if (fills.orgId) merged.orgId = fills.orgId;
  if (fills.business) merged.business = fills.business;
  if (fills.met) merged.keyDates.met = fills.met;
  return merged;
}

function orgRowForDomain(
  address: string,
  index: GraphIndex,
  byId: Map<string, Person>
): Person | undefined {
  const domain = domainOf(address);
  if (!domain) return undefined;
  if (isGenericDomain(domain, index.genericDomains)) return undefined;
  if (index.contestedDomains.has(domain)) return undefined;
  const orgId = index.orgIdByDomain.get(domain);
  return orgId ? byId.get(orgId) : undefined;
}

function anchorOrgFrom(row: Person | undefined): AnchorOrg | undefined {
  if (!row) return undefined;
  return { id: row.id, name: row.name, verticalId: row.verticalId };
}

/**
 * Plan every person write one captured email implies.
 *
 * `parties` is the counterpart list — the caller has already removed the
 * capture mailbox (Rob's own record carries that address, so leaving it in
 * would merge every message into Rob).
 *
 * Two dedupes, for two different failures:
 *  • the same ADDRESS on both `to` and `cc` would otherwise be planned twice,
 *    and the second create would mint a `-2` id for a person who does not exist;
 *  • two addresses that merge into the SAME existing row would produce two
 *    upserts of the same id, the second built from the pre-merge snapshot —
 *    silently undoing the first.
 */
export function planPeopleForEmail(args: {
  data: NetworkData;
  parties: EmailParty[];
  direction: EmailDirection;
  index: GraphIndex;
  capturedAtISO: string;
  emailDateISO?: string;
}): PeoplePlan {
  const { data, parties, direction, index, capturedAtISO, emailDateISO } = args;
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const taken = new Set(data.people.map((p) => p.id));
  const writes: PersonWrite[] = [];
  const skipped: PersonSkip[] = [];
  const seenAddresses = new Set<string>();
  const mergedIds = new Set<string>();

  for (const party of parties) {
    const address = party.address.trim().toLowerCase();
    if (!address || seenAddresses.has(address)) continue;
    seenAddresses.add(address);

    const graph = planEmailGraph(address, direction, index);
    const existing = graph.kind === "person" ? byId.get(graph.personId) : undefined;
    // Rung 3 hands the org over in the plan. Rungs 1/2 do not — the ladder
    // stopped at the human — yet a known person with a blank `orgId` is the
    // commonest merge there is, so the anchor is resolved from the DOMAIN by
    // the same two rules rung 3 obeys: a generic domain owns nobody, and a
    // domain two companies claim anchors to neither (`orgIdByDomain` keeps the
    // first claimant, which would silently file the person under a coin flip).
    const org =
      graph.kind === "org"
        ? anchorOrgFrom(byId.get(graph.orgId))
        : anchorOrgFrom(orgRowForDomain(address, index, byId));

    const plan = planPersonFromEmail({
      plan: graph,
      party: { address, raw: party.raw },
      index,
      org,
      existing,
      takenIds: taken,
      capturedAtISO,
      emailDateISO,
    });

    if (plan.kind === "skip") {
      skipped.push({ address, reason: plan.reason, detail: plan.detail });
      continue;
    }
    if (plan.kind === "create") {
      taken.add(plan.person.id);
      writes.push({ kind: "create", address, person: personFromNewRow(plan.person) });
      continue;
    }
    if (mergedIds.has(plan.personId)) {
      skipped.push({
        address,
        reason: "nothing-to-merge",
        detail: `${plan.personId} is already being merged by another address on this message.`,
      });
      continue;
    }
    const row = byId.get(plan.personId);
    if (!row) {
      // planPersonFromEmail only reaches "merge" with a row we handed it, so
      // this is unreachable — but upserting a half-built person would write a
      // row with no name, so it refuses instead of reconstructing one.
      skipped.push({
        address,
        reason: "nothing-to-merge",
        detail: `${plan.personId} was planned for merge but is not in the snapshot.`,
      });
      continue;
    }
    mergedIds.add(plan.personId);
    writes.push({
      kind: "merge",
      address,
      personId: plan.personId,
      fills: plan.fills,
      person: mergedPerson(row, plan.fills),
    });
  }

  return { writes, skipped };
}
