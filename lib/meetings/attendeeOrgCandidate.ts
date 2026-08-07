/**
 * Q85 inc.15 — the candidate source the EMPTY-cell rows actually need.
 *
 * inc.14's live run measured the structural gap this module closes. The confirm path
 * (`companyConfirmation.ts` → `scripts/confirm-meeting-company.mjs`) can write a company onto a
 * Notion archive row, and it had nothing to carry: candidates were derived from
 * `groupBlockedByCompany`, which builds them out of `nearMiss` — and `nearMiss` only fires when
 * the `Company Meeting with` cell ALREADY HOLDS TEXT that nearly matched a CRM org. So the two
 * halves were disjoint by construction:
 *
 *   - 6 `unknown-company` rows  — cell full, candidate exists, refused (`cell-not-empty`).
 *   - 9 `empty-company` rows    — cell empty, WRITABLE, and no candidate at all.
 *
 * A candidate for an empty cell cannot come from the cell. It has to come from somewhere else on
 * the row, and inc.5/inc.6 already built the only honest somewhere: the four attendee columns,
 * read with the side taken off the column, resolved to CRM people by exact-after-normalization
 * name. If the archive names a human the CRM already holds, the CRM already knows what company
 * that human belongs to. THAT is the candidate — not a guess about the meeting, a lookup of a
 * person the archive itself named.
 *
 * WHAT THIS MODULE MAY READ, and it is short on purpose: `matched` attendee resolutions and the
 * org rows the caller supplies. Not the title (that is `titleCompany.ts`, a separate and weaker
 * signal), not the summary, not the body, not the domain of anyone's email. One evidence class,
 * so a reader of the output always knows which fact produced it.
 *
 * IT MUST NOT BE HANDED AN ALREADY-RESOLVED ORG, and this is the one rule that would silently
 * destroy the module's value. `resolveRowAttendees(attendees, people, orgId)` uses `orgId` to
 * NARROW an ambiguous name to the person at that org. Feeding it the org while asking it for the
 * org is circular: the answer would be assumed by the question. Callers resolving FOR a candidate
 * must pass no org — `candidateOrgFromAttendees` asserts nothing about that (a pure module cannot
 * see its caller's arguments), so it is pinned by test and stated here.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion. It returns a candidate a human rules
 * on. It writes nothing, and it is not a writer's permission slip — `planCompanyConfirmations`
 * still re-checks the cell, and the caller still re-reads the page before any PATCH.
 */

import type { CrmOrg } from "./activityPlan";
import type { ResolvedAttendees } from "./attendeePerson";

/**
 * What the attendee columns can honestly say about which company an empty-cell row belongs to.
 *
 *   - `candidate`          — exactly one CRM org, named by one or more people the archive named
 *                            and the CRM holds. The only outcome the confirm path may act on.
 *   - `no-counterparty`    — the row names nobody on the other side. Not a failure of this pass:
 *                            those four columns are empty in the archive.
 *   - `no-matched-person`  — counterparties exist and none resolved to a CRM person. The honest
 *                            ask is a person proposal (inc.9's finding), not a company guess.
 *   - `person-without-org` — the people resolved and none of them carries an org. The CRM holds
 *                            the human and not their employer; fixing the PERSON fixes this row.
 *   - `ambiguous-orgs`     — matched people belong to MORE THAN ONE company. Never resolved by
 *                            "most attendees" or "first named": a call welded onto the wrong
 *                            company is unrecoverable, and a genuine two-company meeting is
 *                            exactly the shape that would be broken by a tiebreak.
 *   - `org-not-in-crm`     — every matched person points at an org id the supplied org list does
 *                            not hold. Reported here by name rather than left to be refused
 *                            downstream as a bare `unknown-org`, because the defect is a stale
 *                            `orgId` on a person row and that is where someone must go.
 */
export type AttendeeOrgOutcome =
  | "candidate"
  | "no-counterparty"
  | "no-matched-person"
  | "person-without-org"
  | "ambiguous-orgs"
  | "org-not-in-crm";

/** One person's contribution, carried so a reader can audit the candidate back to a column. */
export type AttendeeOrgEvidence = {
  personId: string;
  personName: string;
  /** As the archive wrote it. Kept beside the CRM spelling — they are not always the same. */
  attendeeName: string;
  /** The column the name was typed into, so a wrong one can be gone and fixed. */
  source: string;
  orgId: string;
};

export type AttendeeOrgCandidate = {
  outcome: AttendeeOrgOutcome;
  /** Set only on `candidate`. */
  orgId?: string;
  /** Set only on `candidate`. The CRM's spelling, which is what would be written. */
  orgName?: string;
  /** Every matched person that named an org, on every outcome that had any. */
  evidence: AttendeeOrgEvidence[];
  /**
   * Set on `ambiguous-orgs` and `org-not-in-crm` — the distinct org ids in play, in first-named
   * order. A human picking between them needs the list, not the count.
   */
  competingOrgIds?: string[];
  /** Plain-language next step, in the words of the thing a human would go do. */
  nextStep: string;
};

/**
 * Derive the company an empty-cell archive row belongs to, from the humans it names.
 *
 * @param resolved output of `resolveRowAttendees` for this row, resolved WITHOUT an org (see the
 *   header — passing one makes the answer circular).
 * @param orgs the CRM's orgs, from the same snapshot the caller will show the human.
 */
export function candidateOrgFromAttendees(
  resolved: ResolvedAttendees,
  orgs: CrmOrg[]
): AttendeeOrgCandidate {
  if (resolved.counts.total === 0) {
    return {
      outcome: "no-counterparty",
      evidence: [],
      nextStep:
        "The four attendee columns name nobody on the other side of this meeting. Fill " +
        "`Contact Name` or `Non MLE Attendees` in Notion and this row resolves itself.",
    };
  }

  const matched = resolved.resolutions.filter((r) => r.outcome === "matched" && r.person);
  if (matched.length === 0) {
    return {
      outcome: "no-matched-person",
      evidence: [],
      nextStep:
        `The archive names ${resolved.counts.total} counterpart` +
        `${resolved.counts.total === 1 ? "y" : "ies"} and the CRM holds none of them by name. ` +
        "Create the person first — a company guessed from an unknown human is a guess twice over.",
    };
  }

  const evidence: AttendeeOrgEvidence[] = matched
    .filter((r) => r.person!.orgId)
    .map((r) => ({
      personId: r.person!.id,
      personName: r.person!.name,
      attendeeName: r.attendee.name,
      source: r.attendee.source,
      orgId: r.person!.orgId!,
    }));

  if (evidence.length === 0) {
    return {
      outcome: "person-without-org",
      evidence: [],
      nextStep:
        `The CRM holds ${matched.length} of this meeting's people (` +
        `${matched.map((r) => r.person!.id).join(", ")}) and none of them carries an org. ` +
        "Attach those people to a company and this row resolves itself.",
    };
  }

  const distinctOrgIds = [...new Set(evidence.map((e) => e.orgId))];
  if (distinctOrgIds.length > 1) {
    return {
      outcome: "ambiguous-orgs",
      evidence,
      competingOrgIds: distinctOrgIds,
      nextStep:
        `This meeting's people belong to ${distinctOrgIds.length} different companies ` +
        `(${distinctOrgIds.join(", ")}). Nothing here can pick between them and nothing should — ` +
        "type the company into `Company Meeting with` yourself, or say it was genuinely both.",
    };
  }

  const orgId = distinctOrgIds[0];
  const org = orgs.find((o) => o.id === orgId);
  if (!org) {
    return {
      outcome: "org-not-in-crm",
      evidence,
      competingOrgIds: distinctOrgIds,
      nextStep:
        `${evidence.length === 1 ? "The person" : "Every person"} on this row points at org ` +
        `${orgId}, which is not in the CRM snapshot. Fix the stale orgId on ` +
        `${evidence.map((e) => e.personId).join(", ")} — the row is not the defect.`,
    };
  }

  return {
    outcome: "candidate",
    orgId: org.id,
    orgName: org.name,
    evidence,
    nextStep:
      `Confirm ${org.name} (${org.id}) — named by ` +
      `${evidence.map((e) => `${e.personName} (${e.personId}, ${e.source})`).join(", ")}.`,
  };
}
