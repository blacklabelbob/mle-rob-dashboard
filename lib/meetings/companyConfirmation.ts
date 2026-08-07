/**
 * THE CONFIRM PATH — what a human's "yes, that one" turns into, and everything it refuses.
 *
 * Flag #215 names three companies and one person for fifteen blocked meetings and changes
 * nothing: the empty cell it is complaining about lives in **Notion's** `Company Meeting with`
 * column, not in the CRM. This module is the middle between a confirmation and that cell.
 *
 * It is the whole of the decision and none of the write. Pure by CR-3: no clock, no network, no
 * Supabase, no Notion client. It returns a PLAN — the cells that would be filled and the exact
 * text — and a caller with credentials rules on it. That split is not ceremony: a company
 * written onto the wrong meeting row propagates into an activity on a real company record, and
 * the CRM's own worklist would then agree with the mistake on every subsequent run.
 *
 * The one substantive decision here: **the text written to Notion is the CRM's own org name,
 * never the string a human typed.** The cell is empty precisely because nothing matched; writing
 * back anything other than the name the resolver already matches on would leave the row blocked
 * with a full cell, which is strictly worse than blocked with an empty one.
 */

import type { ActivityPlanRow, CrmOrg, CrmPerson } from "./activityPlan";
import { recorderSawMeeting } from "./activityDraft";
import { blockerFor } from "./writeBlockerFinding";
import { groupBlockedByCompany } from "./blockedByCompany";

/** One human decision: this Notion row's counterparty is this CRM org. */
export type CompanyConfirmation = {
  /** The Notion page id, as printed on flag #215. */
  pageId: string;
  /** The CRM org id a human confirmed. */
  orgId: string;
  /**
   * Who confirmed it. Required, and carried onto the plan, so the provenance of a Notion cell
   * can never read as though a script decided a counterparty on its own.
   */
  confirmedBy: string;
};

/**
 * Why a confirmation was not turned into a write. Each one is a refusal some earlier increment
 * on this queue paid for; none is defensive padding.
 */
export type ConfirmationRefusal =
  /** No blocked row with that page id — a stale page id off an old copy of the worklist. */
  | "not-blocked"
  /** A recorder never saw this meeting: Q84's pass, expressly out of Q85's scope. */
  | "out-of-scope"
  /**
   * The blocker is NOT an empty cell. `unknown-company` and `ambiguous-company` mean the cell
   * already holds text a human typed, and a bulk pass is the worst place to overwrite that.
   */
  | "cell-not-empty"
  /** The row's blocker is the day, not the company. Filling a company would not unblock it. */
  | "not-a-company-blocker"
  /** The confirmed id is a person. A person's employer is not the meeting's counterparty. */
  | "person-not-company"
  /** The CRM does not hold that org id — nothing to copy a canonical name from. */
  | "unknown-org"
  /** Two confirmations for one page. Ambiguous, so neither is guessed at. */
  | "duplicate";

export type RefusedConfirmation = {
  pageId: string;
  reason: ConfirmationRefusal;
  /** Plain language, in the terms of the thing a human would go look at. */
  detail: string;
};

export type ConfirmedWrite = {
  pageId: string;
  pageTitle: string;
  /** The Notion row, so a plan can be checked against the page before it is applied. */
  pageUrl: string | null;
  orgId: string;
  orgName: string;
  /**
   * Exactly what goes in Notion's `Company Meeting with`. The CRM's own org name — see the
   * module header. Kept as its own field rather than derived at write time so the string a
   * human approves in a dry run is the string that lands.
   */
  companyText: string;
  confirmedBy: string;
  /**
   * Whether this is the org the worklist offered for this row, or a human naming a different
   * one. An override is honoured — a human who was in the meeting outranks a title match — but
   * it is never silent, because "the script suggested it" and "a person overrode it" are not
   * the same provenance for a cell nobody will revisit.
   */
  source: "candidate" | "off-candidate";
};

export type ConfirmationPlan = {
  writes: ConfirmedWrite[];
  refusals: RefusedConfirmation[];
};

/**
 * Page id → the org flag #215 offered for it.
 *
 * Built by CONSUMING `groupBlockedByCompany`, never by re-reading `nearMiss` here. The near-miss
 * union has four shapes and three of them can resolve to several orgs; a second reading of it
 * would eventually disagree with the worklist, and then "off-candidate" would be labelling rows
 * the human actually confirmed straight off the page they were shown.
 */
function candidateOrgByPage(planRows: ActivityPlanRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groupBlockedByCompany(planRows).companies) {
    for (const meeting of group.meetings) map.set(meeting.id, group.orgId);
  }
  return map;
}

/**
 * Turn confirmations into the cells that would be filled.
 *
 * `orgs` and `people` are the CRM as the caller read it — passed in rather than fetched, so the
 * plan a human approves was computed from the same snapshot the report they read was.
 */
export function planCompanyConfirmations(
  planRows: ActivityPlanRow[],
  orgs: CrmOrg[],
  people: CrmPerson[],
  confirmations: CompanyConfirmation[],
): ConfirmationPlan {
  const byPage = new Map<string, ActivityPlanRow>();
  for (const planRow of planRows) {
    if (planRow.row?.id) byPage.set(planRow.row.id, planRow);
  }
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const candidates = candidateOrgByPage(planRows);
  const personIds = new Set(people.map((p) => p.id));

  const writes: ConfirmedWrite[] = [];
  const refusals: RefusedConfirmation[] = [];
  const seen = new Set<string>();

  for (const confirmation of confirmations) {
    const { pageId, orgId, confirmedBy } = confirmation;

    if (seen.has(pageId)) {
      refusals.push({
        pageId,
        reason: "duplicate",
        detail: `a second confirmation names ${orgId} for a page already confirmed — neither is guessed at`,
      });
      continue;
    }
    seen.add(pageId);

    const planRow = byPage.get(pageId);
    if (!planRow) {
      refusals.push({
        pageId,
        reason: "not-blocked",
        detail: "no archive row with this page id — re-read the worklist before confirming",
      });
      continue;
    }

    if (!recorderSawMeeting(planRow.row)) {
      refusals.push({
        pageId,
        reason: "out-of-scope",
        detail: "no recorder saw this meeting — it belongs to Q84's human-account pass, not this one",
      });
      continue;
    }

    const blocker = blockerFor(planRow);
    if (blocker === null) {
      refusals.push({
        pageId,
        reason: "not-blocked",
        detail: "this row is already writable — nothing is standing in the way of it",
      });
      continue;
    }
    if (blocker === "no-date") {
      refusals.push({
        pageId,
        reason: "not-a-company-blocker",
        detail: "the blocker is the day, not the company — filling the company leaves it blocked",
      });
      continue;
    }
    if (blocker !== "empty-company") {
      refusals.push({
        pageId,
        reason: "cell-not-empty",
        detail: `Company Meeting with already holds text a human typed (${blocker}) — this pass never overwrites it`,
      });
      continue;
    }

    if (personIds.has(orgId)) {
      refusals.push({
        pageId,
        reason: "person-not-company",
        detail: `${orgId} is a person — their employer is not this meeting's counterparty`,
      });
      continue;
    }

    const org = orgById.get(orgId);
    if (!org) {
      refusals.push({
        pageId,
        reason: "unknown-org",
        detail: `the CRM holds no org ${orgId} — nothing to copy a canonical name from`,
      });
      continue;
    }

    writes.push({
      pageId,
      pageTitle: planRow.row.title || "(untitled)",
      pageUrl: planRow.row.url || null,
      orgId: org.id,
      orgName: org.name,
      companyText: org.name,
      confirmedBy,
      source: candidates.get(pageId) === org.id ? "candidate" : "off-candidate",
    });
  }

  return { writes, refusals };
}
