/**
 * Q89 inc.21 — critic-rob punch #6: "the coverage gap is invisible: a company with no
 * captured meeting looks exactly like a company with nothing to say."
 *
 * `MeetingIntelSection` returns null when a record has no meeting, so ~28 of ~31
 * companies render NOTHING under Q89 — and a blank space is read as "there was nothing
 * worth recording here", which is a claim about the counterparty we have no basis for.
 * The true statement is about US: we have not captured a call on this record.
 *
 * The review's own conclusion is followed exactly: the answer is ONE LINE, not four
 * empty boxes. Four empty blocks on 28 records would be the noise the original
 * `return null` was written to avoid, and would make "no calls yet" and "call went
 * uncaptured" look identical again.
 *
 * Why the sentence is built here and not in the component: both surfaces must print the
 * SAME numbers, and the component computes nothing by construction (inc.2). This module
 * is the only place the coverage arithmetic exists, so the record line and the Overview
 * label can never disagree.
 *
 * Pure per CR-3: no clock, no network, no store, no filesystem. Counting only — it never
 * decides what a meeting is (that is `intelSource`) nor what may be claimed from one
 * (that is `meetingIntel`).
 */

import type { Activity } from "@/lib/types";
import { sortMeetingsByOccurrence } from "./intelSource";

export type MeetingCoverage = {
  /** Meeting rows in the CRM, across every company. */
  meetings: number;
  /** Distinct companies those meetings are attached to. Unattached rows excluded. */
  companiesWithMeetings: number;
  /** Every company on the record, whether or not we have ever spoken to it. */
  totalCompanies: number;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Count coverage from the same meeting definition the rest of Q89 uses.
 *
 * `totalCompanies` is supplied by the caller — the page already holds the network and is
 * the one place allowed to decide what counts as a company (same contract as
 * `networkIntelFromActivities`).
 */
export function meetingCoverage(activities: Activity[], totalCompanies: number): MeetingCoverage {
  const meetings = sortMeetingsByOccurrence(activities);
  const companies = new Set<string>();
  for (const m of meetings) {
    const orgId = m.orgId?.trim();
    if (orgId) companies.add(orgId);
  }
  return {
    meetings: meetings.length,
    companiesWithMeetings: companies.size,
    totalCompanies: Math.max(0, totalCompanies),
  };
}

/**
 * The line a company record with no captured meeting prints instead of nothing.
 *
 * It says what is true — no call captured HERE — and immediately gives the scale, so the
 * reader learns in one glance that this is the normal state of the CRM today rather than
 * something peculiar to this company. Rob could otherwise only learn 3-of-31 by opening
 * 31 pages.
 */
export function noMeetingNote(c: MeetingCoverage): string {
  const scale =
    c.meetings === 0
      ? "No meeting has been captured on any company yet."
      : `${c.meetings} ${plural(c.meetings, "meeting", "meetings")} captured across ${
          c.companiesWithMeetings
        } of ${c.totalCompanies} ${plural(c.totalCompanies, "company", "companies")} in the CRM.`;
  return `No meeting captured on this record — ${scale}`;
}

/**
 * The Overview's count label. The denominator is the point: "4 meetings · 3 companies"
 * reads like coverage, "3 of 31 companies" reads like the gap it actually is.
 */
export function coverageCountLabel(c: MeetingCoverage, unattributedMeetings = 0): string {
  const head = `${c.meetings} ${plural(c.meetings, "meeting", "meetings")} · ${
    c.companiesWithMeetings
  } of ${c.totalCompanies} ${plural(c.totalCompanies, "company", "companies")}`;
  return unattributedMeetings > 0 ? `${head} · ${unattributedMeetings} unattached` : head;
}
