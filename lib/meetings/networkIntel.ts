/**
 * Q89 inc.4 — the Overview half. The DoD asks for the four blocks on the company record
 * AND on the overview; inc.3 mounted the record. This module is the only new thing the
 * overview needs, and it is deliberately thin: the same seam (`intelSource`), the same
 * gate (`meetingIntel`), the same face (`MeetingIntelSection`). It adds no rule of its
 * own, and above all no second ranking — a cross-company view that quietly reordered
 * items would be exactly the "second door" the dependency note forbids.
 *
 * What it DOES add is one fact the record page never needs: WHOSE call each item came
 * from. That is stamped onto `provenance.context`, which the shared `sourceLabel()`
 * prints, so on the Overview an item reads `Omega Title · A-77 · line 44`. It is never
 * prefixed onto `text` — a pain point with a company name welded to the front is no
 * longer the customer's sentence, and rule 2 of the gate exists to keep our wording out
 * of their words.
 *
 * Two refusals worth stating, both inherited from the same doctrine:
 *
 * 1. A MEETING WITH NO `orgId` IS NEVER ATTACHED TO A NEARBY COMPANY. Its candidates
 *    still flow through (silence about a call that happened is the worse failure) but
 *    they carry no context, and the count of such meetings is reported so "we heard this
 *    somewhere" can never read as "we heard this from them". Same rule Q85's DoD sets
 *    for the writer: an unresolvable attribution queues a question, it does not guess.
 *
 * 2. AN UNKNOWN `orgId` FALLS BACK TO THE ID, NEVER TO A NAME. If the network has no row
 *    for that id, the reader gets `C-2019` — ugly and true — instead of a friendly label
 *    invented here.
 *
 * Pure per CR-3: no clock, no network, no store, no filesystem.
 */

import type { Activity } from "@/lib/types";
import type { IntelCandidate } from "./meetingIntel";
import { candidatesFromActivity, sortMeetingsByOccurrence } from "./intelSource";

export type NetworkIntelSource = {
  candidates: IntelCandidate[];
  /** Meeting rows read, across every company. The denominator the Overview prints. */
  meetingCount: number;
  /** Distinct companies those meetings belong to. Unattributed rows are NOT counted here. */
  companyCount: number;
  /** Meetings carrying no `orgId`. Stated, because an unowned call is a gap, not a zero. */
  unattributedMeetings: number;
  /** Entries whose `kind` names no block — same pass-through-or-count contract as the seam. */
  unusable: { activityId: string; reason: string }[];
};

/**
 * Every meeting in the CRM → one candidate list for the Overview, oldest first so
 * "source order" means the same thing here as on a record.
 *
 * `orgNameById` is supplied by the caller (the page already holds the network) rather
 * than read here, which keeps this module pure and testable and keeps exactly one place
 * — the page — responsible for what counts as a company.
 */
export function networkIntelFromActivities(
  activities: Activity[],
  orgNameById: Record<string, string> = {}
): NetworkIntelSource {
  const meetings = sortMeetingsByOccurrence(activities);

  const candidates: IntelCandidate[] = [];
  const unusable: { activityId: string; reason: string }[] = [];
  const companies = new Set<string>();
  let unattributedMeetings = 0;

  for (const m of meetings) {
    const orgId = m.orgId?.trim();
    if (orgId) companies.add(orgId);
    else unattributedMeetings += 1;

    // Name if the network knows it, the raw id if it does not. Never a guess.
    const context = orgId ? orgNameById[orgId]?.trim() || orgId : undefined;

    const got = candidatesFromActivity(m);
    for (const c of got.candidates) {
      candidates.push(
        context ? { ...c, provenance: { ...c.provenance, context } } : c
      );
    }
    unusable.push(...got.unusable);
  }

  return {
    candidates,
    meetingCount: meetings.length,
    companyCount: companies.size,
    unattributedMeetings,
    unusable,
  };
}
