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
import { recorderSawMeeting } from "./activityDraft";
import { blockerFor } from "./writeBlockerFinding";
import { readArchiveAttendees } from "./archiveAttendees";
import { resolveRowAttendees } from "./attendeePerson";
import { candidateOrgFromAttendees, type AttendeeOrgCandidate, type AttendeeOrgOutcome } from "./attendeeOrgCandidate";

export type EmptyCellSuggestion = {
  pageId: string;
  pageTitle: string;
  pageUrl: string | null;
  /** The day the row would be dated, carried so a human can recognise the meeting. */
  day: string;
  candidate: AttendeeOrgCandidate;
};

export type EmptyCellSuggestions = {
  /** Offerable first — `candidate` rows, then everything else in the order the plan held them. */
  suggestions: EmptyCellSuggestion[];
  counts: Record<AttendeeOrgOutcome, number> & {
    /** Rows in scope: recorder-seen AND blocked on an empty company cell. */
    rows: number;
  };
};

/** Only `candidate` is actionable; the rest are reported so a reader sees the whole shape. */
const OFFERABLE_FIRST = (s: EmptyCellSuggestion) => (s.candidate.outcome === "candidate" ? 0 : 1);

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

    suggestions.push({
      pageId: row.id,
      pageTitle: row.title || "(untitled)",
      pageUrl: row.url || null,
      day: row.day || "",
      candidate: candidateOrgFromAttendees(resolved, orgs),
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
