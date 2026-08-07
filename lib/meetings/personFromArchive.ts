/**
 * Q85 inc.21 — the proposal that has never actually been made.
 *
 * inc.8 DECIDED (`decidePersonProposal`): `Joseph Green` → propose, `Dix thedev08` → withhold.
 * inc.18 printed that decision per name. inc.19/20 narrowed which rows the decision is even
 * asked about. Twenty increments in, flag #213 still says *"propose the person"* and **not one
 * proposal exists** — because nothing anywhere turns that word into a row anyone could write.
 * This module is that step, and it is the org path's exact shape: `planOrgFromProposal` returns
 * a concrete row or a refusal a human can read, and NOTHING here writes.
 *
 * WHAT MEASURING IT FOUND, AND IT IS THE POINT OF THE INCREMENT: the proposal cannot be minted
 * from the archive row alone. `people.vertical_id` is `not null` (0001_network.sql:16), and the
 * ONE cell that would have carried a company — and with it a vertical — is the cell that is
 * empty; that emptiness is why the row is in #213 in the first place. So a person proposed from
 * a meeting archive row is STRUCTURALLY a reviewer question, never an automatic create. The
 * planner says so in a named refusal instead of inventing a vertical, which is the failure the
 * whole Q85 line has been avoiding one branch at a time.
 *
 * THE SECOND REQUIRED INPUT IS ATTRIBUTION, and it is required for a rule, not for a column.
 * `people.referred_by_id` is nullable, so Postgres would happily take an orphan. Rob's standing
 * rule is that every person traces back to him — a record created with no referrer is an orphan
 * the attribution sweep has to come back and fix, and a proposal is the cheapest place to ask.
 * Refused, not defaulted: defaulting to Rob would be a claim about who introduced Joseph Green,
 * and this build does not put an invented relationship in front of him.
 *
 * MONEY AND COMMITMENT ARE STRUCTURALLY ABSENT from the returned row (same as `NewPersonRow`):
 * `quotedAmount`, `signed`, `keyDates.paid` are not fields on the type, so the driver's hard
 * limit is enforced by the compiler rather than by a promise. `email` and `orgId` are absent
 * for a different reason — an archive attendee has neither, and a blank string written into
 * either is worse than the honest absence.
 */

import { nextPersonId, handleFor, slugifyHandle } from "../recordId";
import { normalizeName } from "@/lib/dedup/match";
import type { CrmPerson } from "./activityPlan";
import { personProposalText, type PersonProposalDecision } from "./personProposal";

/** The row a reviewer's click would insert. See the header on what is deliberately not here. */
export interface NewArchivePersonRow {
  /** A record number (`P-1042`) — Q70. Never derived from the name. */
  id: string;
  /** The findable-by-name handle the id used to be. A look-up key only; collisions are cosmetic. */
  legacySlug: string;
  name: string;
  /** `people.vertical_id` is NOT NULL — supplied by the reviewer, never guessed from a meeting. */
  verticalId: string;
  /** Rob's no-orphans rule, expressed as a required input rather than a nullable column. */
  referredById: string;
  entityKind: "person";
  /** A human known only from one meeting is a lead. Never a client. */
  nodeType: "lead";
  status: "unlit";
  /** The day of the meeting they were on — the earliest contact this row can evidence. */
  metISO: string;
  notes: string;
}

export type ArchivePersonRefusal =
  /** The decision itself said do not create — a display handle, fixed in Notion. */
  | "withheld"
  | "name-required"
  /** A person of that exact name exists now. The decision was computed against an older read. */
  | "already-known"
  | "vertical-required"
  | "unknown-vertical"
  | "referrer-required"
  | "unknown-referrer"
  | "met-required";

export type ArchivePersonPlan =
  | { kind: "create"; person: NewArchivePersonRow }
  | { kind: "refused"; reason: ArchivePersonRefusal; detail: string };

/** What the reviewer supplies on top of the decision. Both are questions, not defaults. */
export interface ReviewedPersonProposal {
  verticalId?: string;
  referredById?: string;
}

/**
 * One proposal, planned.
 *
 * @param decision `decidePersonProposal`'s answer for this attendee — the withhold branch is
 *   refused here too, so a caller that skipped the decision cannot reach a create by accident.
 * @param reviewed the two answers only a human has.
 * @param people the CRM people from the SAME read the decision used, for the staleness check.
 * @param verticalIds / @param dayISO the vertical list to validate against, and the meeting day.
 */
export function planPersonFromArchive(
  decision: PersonProposalDecision,
  reviewed: ReviewedPersonProposal,
  people: CrmPerson[],
  verticalIds: string[],
  dayISO: string,
  /**
   * Ids AND handles already promised to another plan built from this same read. #213 names two
   * proposable people, and the live run proved what happens without this: `nextPersonId` asked
   * twice about one snapshot answered `P-1023` twice, so approving both would insert the second
   * over the first. One set for both because the two namespaces are disjoint — a record number
   * can never look like a slug — and each lookup only ever matches its own kind. Callers
   * planning more than one go through `planPeopleFromArchive`, which threads it.
   */
  reserved?: ReadonlySet<string>
): ArchivePersonPlan {
  // First, and before any reviewer input is even looked at: the decision's own refusal. A
  // reviewer who filled the form in for `Dix thedev08` still must not get a record.
  if (decision.kind === "withhold") {
    return { kind: "refused", reason: "withheld", detail: personProposalText(decision) };
  }

  const name = decision.name.trim();
  if (!name) {
    return { kind: "refused", reason: "name-required", detail: "The attendee value is empty." };
  }

  // The decision was computed from a snapshot; the click comes later. Someone may have created
  // this person in between — by hand, or by the email path. Exact normalised name only, the same
  // comparison `attendeePerson` uses, because a looser test here would refuse a real second
  // human with a common name.
  const target = normalizeName(name);
  const existing = people.find((p) => normalizeName(p.name) === target);
  if (existing) {
    return {
      kind: "refused",
      reason: "already-known",
      detail: `${existing.name} [${existing.id}] now holds that exact name — attach the meeting to them instead of creating a second record.`,
    };
  }

  const verticalId = (reviewed.verticalId ?? "").trim();
  if (!verticalId) {
    return {
      kind: "refused",
      reason: "vertical-required",
      detail: `Pick a vertical for ${name}. The meeting row's company cell is empty, which is why this proposal exists — nothing on it can name one.`,
    };
  }
  if (!verticalIds.includes(verticalId)) {
    return {
      kind: "refused",
      reason: "unknown-vertical",
      detail: `"${verticalId}" is not a vertical in this CRM.`,
    };
  }

  const referredById = (reviewed.referredById ?? "").trim();
  if (!referredById) {
    return {
      kind: "refused",
      reason: "referrer-required",
      detail: `Say who ${name} traces back to. Being on a meeting is not an introduction, and a person with no referrer is an orphan on Rob's network.`,
    };
  }
  if (!people.some((p) => p.id === referredById)) {
    return {
      kind: "refused",
      reason: "unknown-referrer",
      detail: `"${referredById}" is not a person in this CRM.`,
    };
  }

  const day = dayISO.trim();
  if (!day) {
    return {
      kind: "refused",
      reason: "met-required",
      detail: `The meeting row carries no date, so ${name}'s "met" would be invented.`,
    };
  }

  const takenIds = new Set(people.map((p) => p.id));
  for (const id of reserved ?? []) takenIds.add(id);
  // Handles get their own accumulator seeded from the SLUG of each existing name — `taken` here
  // holds record numbers, which a handle could never collide with, and 0031's unique index on
  // `legacy_slug` would be the thing that noticed. Cosmetic on its own; not once two rows are
  // being planned at the same time.
  const takenHandles = new Set(people.map((p) => slugifyHandle(p.name)));
  for (const id of reserved ?? []) takenHandles.add(id);
  return {
    kind: "create",
    person: {
      id: nextPersonId(takenIds),
      legacySlug: handleFor(name, "person", takenHandles),
      name,
      verticalId,
      referredById,
      entityKind: "person",
      nodeType: "lead",
      status: "unlit",
      metISO: day,
      notes: provenance(name, day, decision.sharedSurname),
    },
  };
}

/**
 * Every proposal from ONE read of the CRM, planned together.
 *
 * The only safe way to plan more than one, and the reason is measured rather than theoretical:
 * planned separately, #213's two proposable names both came back `P-1023`. Refusals do not
 * reserve anything — a refused proposal writes no row, so holding a number for it would burn
 * ids on questions nobody has answered yet.
 *
 * `reviewedFor` is asked per name because the two answers are per person: two strangers on one
 * meeting can be in different verticals and be traced back through different people.
 */
export function planPeopleFromArchive(
  decisions: PersonProposalDecision[],
  reviewedFor: (decision: PersonProposalDecision) => ReviewedPersonProposal,
  people: CrmPerson[],
  verticalIds: string[],
  dayISO: string
): ArchivePersonPlan[] {
  const reserved = new Set<string>();
  return decisions.map((decision) => {
    const plan = planPersonFromArchive(decision, reviewedFor(decision), people, verticalIds, dayISO, reserved);
    if (plan.kind === "create") {
      reserved.add(plan.person.id);
      reserved.add(plan.person.legacySlug);
    }
    return plan;
  });
}

/**
 * The note the record is born with. It states where the person came from and, when there is one,
 * the same-surname warning the proposal carried — because the moment the row exists, the reason
 * it was safe to create it stops being visible anywhere else.
 */
function provenance(name: string, dayISO: string, sharedSurname: CrmPerson[]): string {
  const head = `Proposed from the meeting archive: ${name} attended a recorded meeting on ${dayISO} whose company cell was empty, and the CRM held nobody by that name.`;
  if (!sharedSurname.length) return head;
  const listed = sharedSurname.map((p) => `${p.name} [${p.id}]`).join(", ");
  return `${head} ${listed} shares the surname and is a DIFFERENT person — checked at proposal time, not assumed.`;
}
