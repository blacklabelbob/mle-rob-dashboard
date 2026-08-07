/**
 * Q85 inc.16 — the join that makes inc.15's candidates reachable by inc.14's caller.
 *
 * inc.14 measured the gap and inc.15 built the missing half; neither closed it. The confirm
 * path can fill an empty `Company Meeting with` cell, and the only way a human learns WHICH
 * org to name is by knowing it already. `candidateOrgFromAttendees` derives that org from the
 * humans the archive itself named — and it had no caller, so nine writable rows still sat with
 * no candidate at all.
 *
 * This module is the join and nothing else: take the same `check:archive` plan rows the confirm
 * path takes, keep exactly the rows that path would ACCEPT, and answer "what would you offer for
 * this one" for each.
 *
 * THE SCOPE IS COPIED FROM THE CONFIRM PATH, NOT RE-DECIDED. A suggestion for a row
 * `planCompanyConfirmations` would refuse is worse than no suggestion: it reads as work a human
 * can do, spends their attention, and comes back `out-of-scope` or `cell-not-empty` after they
 * have made the decision. So the two gates here are the confirm path's own, in its order —
 * `recorderSawMeeting` (Q84's human-account rows are not Q85's) then `blockerFor === "empty-company"`
 * (a cell holding text a human typed is never overwritten by a bulk pass). Every row this module
 * emits is one the confirm path would act on if the human agrees.
 *
 * THE CIRCULARITY RULE, HONOURED AT THE ONE PLACE IT IS BREAKABLE. `resolveRowAttendees` takes an
 * optional `orgId` and uses it to narrow an ambiguous name to the person at that org. This module
 * is asking WHICH ORG, so it passes none — deliberately, in one place, with the test that proves
 * the difference living beside `attendeeOrgCandidate`'s own. `planRow.org` is right there on the
 * row and passing it would make every answer agree with the question.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion, no filesystem. It returns an OFFER a
 * human rules on. It is not a confirmation and cannot become one — nothing here produces a
 * `CompanyConfirmation`, because the `confirmedBy` on that type is the whole point of it.
 */

import type { ActivityPlanRow, CrmOrg, CrmPerson } from "./activityPlan";
import { indexOrgsByHost } from "./activityPlan";
import { recorderSawMeeting } from "./activityDraft";
import { blockerFor } from "./writeBlockerFinding";
import { readArchiveAttendees } from "./archiveAttendees";
import { resolveRowAttendees } from "./attendeePerson";
import { candidateOrgFromAttendees, type AttendeeOrgCandidate, type AttendeeOrgOutcome } from "./attendeeOrgCandidate";
import { candidateOrgFromTitle, type TitleOrgCandidate } from "./titleOrgCandidate";

export type EmptyCellSuggestion = {
  pageId: string;
  pageTitle: string;
  pageUrl: string | null;
  /** The day the row would be dated, carried so a human can recognise the meeting. */
  day: string;
  candidate: AttendeeOrgCandidate;
  /**
   * Q85 inc.17 — the SECOND, WEAKER evidence class, in its own field and never merged into
   * `candidate`. Present only when `candidate.outcome !== "candidate"`: a row the humans already
   * answered is never re-answered by its title, so the two can never disagree in one output.
   * Null therefore means one of two different things and the distinction is readable off
   * `candidate` — either the attendees answered, or the title was consulted and said nothing.
   */
  titleCandidate: TitleOrgCandidate | null;
};

export type EmptyCellSuggestions = {
  /** Offerable first — `candidate` rows, then everything else in the order the plan held them. */
  suggestions: EmptyCellSuggestion[];
  counts: Record<AttendeeOrgOutcome, number> & {
    /** Rows in scope: recorder-seen AND blocked on an empty company cell. */
    rows: number;
    /**
     * Q85 inc.17 — rows with NO attendee-derived candidate whose TITLE reaches exactly one org.
     * Counted separately and never added into `candidate`: adding them would make one number
     * mean two different strengths of evidence, which is the merge this build refuses.
     */
    "title-candidate": number;
  };
};

/**
 * Three tiers, in strength order: an attendee-derived answer, then a title-derived one, then
 * everything with no answer at all. The tiers are the two evidence classes plus the absence of
 * both — NOT a confidence score. Nothing inside a tier is re-ranked (see the sort's own note).
 */
const OFFERABLE_FIRST = (s: EmptyCellSuggestion) =>
  s.candidate.outcome === "candidate" ? 0 : s.titleCandidate?.outcome === "title-candidate" ? 1 : 2;

/**
 * Offer a company for every empty-cell row the confirm path would accept.
 *
 * @param planRows `check:archive --json` → `activityPlan.rows`.
 * @param orgs / @param people the CRM from that same snapshot — the plan a human reads and the
 *   plan the confirm path computes must come from one read, or the offer can name an org that
 *   moved between them.
 */
export function suggestCompaniesForEmptyCells(
  planRows: ActivityPlanRow[],
  orgs: CrmOrg[],
  people: CrmPerson[],
): EmptyCellSuggestions {
  const suggestions: EmptyCellSuggestion[] = [];
  // Built once, from the same orgs the attendee path uses, so a title host and a company-field
  // host can never resolve to different companies (`titleCompany.ts`'s standing rule).
  const hostIndex = indexOrgsByHost(orgs);

  for (const planRow of planRows) {
    const row = planRow.row;
    if (!row?.id) continue;
    if (!recorderSawMeeting(row)) continue;
    if (blockerFor(planRow) !== "empty-company") continue;

    const attendees = readArchiveAttendees({
      contactName: row.contactName,
      nonMleAttendees: row.nonMleAttendees,
      mleAttendees: row.mleAttendees,
      salesRep: row.salesRep,
    });
    // No org. See the header — this is the one line the circularity rule lives on.
    const resolved = resolveRowAttendees(attendees, people);

    const candidate = candidateOrgFromAttendees(resolved, orgs);

    suggestions.push({
      pageId: row.id,
      pageTitle: row.title || "(untitled)",
      pageUrl: row.url || null,
      day: row.day || "",
      candidate,
      // Subordinate by construction: the title is only consulted where the humans could not
      // answer. This `if` is the whole of the precedence rule — there is no scoring, no
      // fallback chain, and no place a title answer can overwrite an attendee answer.
      titleCandidate:
        candidate.outcome === "candidate"
          ? null
          : candidateOrgFromTitle(row.title, orgs, hostIndex),
    });
  }

  // Stable: offerable rows first, otherwise the plan's own order. Never re-ranked by "how many
  // people agreed" — an offer backed by two attendees is not more true than one backed by one,
  // and ordering by it would read as confidence this module has no way to measure.
  const ordered = suggestions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => OFFERABLE_FIRST(a.s) - OFFERABLE_FIRST(b.s) || a.i - b.i)
    .map(({ s }) => s);

  const count = (outcome: AttendeeOrgOutcome) =>
    ordered.filter((s) => s.candidate.outcome === outcome).length;

  return {
    suggestions: ordered,
    counts: {
      rows: ordered.length,
      candidate: count("candidate"),
      "no-counterparty": count("no-counterparty"),
      "no-matched-person": count("no-matched-person"),
      "person-without-org": count("person-without-org"),
      "ambiguous-orgs": count("ambiguous-orgs"),
      "org-not-in-crm": count("org-not-in-crm"),
      "title-candidate": ordered.filter((s) => s.titleCandidate?.outcome === "title-candidate")
        .length,
    },
  };
}

/**
 * The exact argument a human would paste to confirm one offer.
 *
 * Built here rather than in the script so the string a test pins is the string the terminal
 * prints. It is deliberately only ever the `--confirm` PAIR, never a whole command line with a
 * `--by` filled in: who confirmed a cell is the one field this pass may not supply.
 */
export function confirmArgFor(suggestion: EmptyCellSuggestion): string | null {
  const { outcome, orgId } = suggestion.candidate;
  if (outcome !== "candidate" || !orgId) return null;
  return `--confirm ${suggestion.pageId}=${orgId}`;
}

/**
 * Q85 inc.17 — the same string for the WEAKER class, and a SEPARATE FUNCTION on purpose.
 *
 * The pair it emits is byte-identical to `confirmArgFor`'s — the confirm path cannot tell them
 * apart and must not: `planCompanyConfirmations` re-checks the cell and the caller re-reads the
 * page whatever produced the pair. What differs is where a human meets it. Two functions means
 * every caller has to decide, in code, to print the title-derived offers, and can print them
 * under their own heading. One function with a flag would have made it possible to render both
 * classes into one list by passing nothing — which is exactly the merge this increment refuses.
 *
 * Returns null when the attendee class already answered: a row with a real candidate is never
 * offered its title as a second option, because there is no question left for it to answer.
 */
export function titleConfirmArgFor(suggestion: EmptyCellSuggestion): string | null {
  if (suggestion.candidate.outcome === "candidate") return null;
  const title = suggestion.titleCandidate;
  if (!title || title.outcome !== "title-candidate" || !title.orgId) return null;
  return `--confirm ${suggestion.pageId}=${title.orgId}`;
}
