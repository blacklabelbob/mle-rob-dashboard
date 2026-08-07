/**
 * Q85 inc.27 — WHO WAS IN THE ROOM, on the screen.
 *
 * Twenty-six increments taught the CRM to read attendee columns, resolve them to people,
 * refuse the ones it cannot prove, and store what the archive said. Every one of those
 * answers lives in a script's stdout or a `source_context` blob. A reader opening
 * `/companies/C-2018` still sees four intel blocks and no answer to the first question
 * anyone asks about a call: *who was on it?*
 *
 * This module turns a stored meeting row into that list. It is the READ side of the same
 * facts `storedActivityPerson.ts` decides on, and it deliberately shares that module's
 * `attendeeFieldsFromStored` rather than re-parsing `source_context` — two parsers on one
 * blob is how the screen and the writer start disagreeing about who attended.
 *
 * WHAT IT WILL NOT DO:
 *   - It never reaches back to Notion. A row that kept no attendee column is reported as
 *     OUR gap ("we did not store who was there"), never as a claim that nobody was there.
 *   - It never links a name it cannot prove. Every counterparty without a person id carries
 *     the reason, and each reason is a statement about the CRM or about our storage — never
 *     about the human. "Not in the CRM yet" is a fact about us; "not a real person" is not a
 *     sentence this module can produce.
 *   - It never links across orgs. A name that resolves to somebody at ANOTHER company is
 *     shown, unlinked, saying so — the same rule `decideStoredPerson` applies at write time,
 *     because a reader clicking through to the wrong company's person is the same defect as
 *     writing it.
 *
 * PURE (CR-3): no clock, no network, no Supabase, no Notion. Callers supply rows and people.
 */

import type { Activity } from "@/lib/types";
import { readArchiveAttendees, type AttendeeSide, type AttendeeSource } from "./archiveAttendees";
import { resolveAttendee } from "./attendeePerson";
import type { CrmPerson } from "./activityPlan";
import { attendeeFieldsFromStored } from "./storedActivityPerson";

/**
 * Why a counterparty on the roster has no link. Each is a sentence about a record, not a
 * person, and each names the ONE thing that would close it.
 *
 *   - `not-identifying` — a single token ("Shasta"). Our floor, not their fault; stated so a
 *                         reader does not go looking for a CRM bug that is not there.
 *   - `unknown`         — nobody in the CRM by that name. The ask is a person proposal.
 *   - `ambiguous`       — more than one CRM record answers to it. The ask is a human pick.
 *   - `cross-org`       — resolved, at a different company. Shown, never linked.
 */
export type RosterUnlinkedReason = "not-identifying" | "unknown" | "ambiguous" | "cross-org";

export type RosterEntry = {
  name: string;
  side: AttendeeSide;
  /** The archive column this name came out of, carried so the roster is auditable on sight. */
  source: AttendeeSource;
  /** Set ONLY when exactly one CRM person matched and they belong to this row's org. */
  personId?: string;
  reason?: RosterUnlinkedReason;
  /** The one line the surface prints under an unlinked name. Never about the human. */
  detail?: string;
};

export type MeetingRoster = {
  activityId: string;
  occurredAt: string;
  /** The row's own title if it kept one — never invented, never derived from the company. */
  title?: string;
  /** Us. Never resolved against the CRM: internal people are not counterparties. */
  ours: RosterEntry[];
  theirs: RosterEntry[];
  /**
   * Set when the row stored NO attendee names at all. Present is the signal to print the
   * gap; the string states it as ours.
   */
  gap?: string;
};

const REASON_DETAIL: Record<RosterUnlinkedReason, string> = {
  "not-identifying": "one name only — too thin for us to match a record without guessing",
  unknown: "no CRM record by this name yet",
  ambiguous: "more than one CRM record answers to this name",
  "cross-org": "found in the CRM at another company — not linked from this call",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * One meeting row's roster.
 *
 * `orgId` comes off the ROW rather than being passed separately: the org on a stored
 * activity is a fact somebody already established, and the cross-org guard is only honest
 * if it compares against that same fact.
 */
export function rosterFromActivity(activity: Activity, people: CrmPerson[]): MeetingRoster {
  const sc = activity.sourceContext ?? {};
  const attendees = readArchiveAttendees(attendeeFieldsFromStored(sc));
  const orgId = activity.orgId ?? null;

  const ours: RosterEntry[] = [];
  const theirs: RosterEntry[] = [];

  for (const attendee of attendees) {
    if (attendee.side === "internal") {
      ours.push({ name: attendee.name, side: "internal", source: attendee.source });
      continue;
    }

    const resolution = resolveAttendee(attendee, people, orgId);
    let entry: RosterEntry = { name: attendee.name, side: "counterparty", source: attendee.source };

    if (resolution.outcome === "matched" && resolution.person) {
      const personOrg = resolution.person.orgId ?? "";
      // The org on the row wins. A name match is not permission to send a reader to another
      // company's person — the same rule the writer applies, for the same reason.
      if (orgId && personOrg && personOrg !== orgId) {
        entry = { ...entry, reason: "cross-org", detail: REASON_DETAIL["cross-org"] };
      } else {
        entry = { ...entry, personId: resolution.person.id };
      }
    } else {
      const reason = resolution.outcome as RosterUnlinkedReason;
      entry = { ...entry, reason, detail: REASON_DETAIL[reason] };
    }
    theirs.push(entry);
  }

  const roster: MeetingRoster = {
    activityId: activity.id,
    occurredAt: activity.occurredAt,
    ours,
    theirs,
  };
  const title = str(sc.title) ?? str(sc.meetingTitle);
  if (title) roster.title = title;
  if (attendees.length === 0) {
    roster.gap = "We did not store who was on this call — that is a gap in our record, not a statement about the meeting.";
  }
  return roster;
}

/**
 * Every meeting row on a record, newest first.
 *
 * Non-meeting activities are dropped rather than rostered: an email has no room. Rows that
 * yield an empty roster are KEPT — a call we captured and stored no names for is exactly the
 * thing this surface exists to make visible, and filtering it would hide our own gap.
 */
export function rostersFromActivities(activities: Activity[], people: CrmPerson[]): MeetingRoster[] {
  return activities
    .filter((a) => a.type === "meeting")
    .map((a) => rosterFromActivity(a, people))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

/** How many counterparties across a set of rosters carry a link. Printed, never estimated. */
export function rosterLinkCounts(rosters: MeetingRoster[]): { linked: number; unlinked: number } {
  let linked = 0;
  let unlinked = 0;
  for (const roster of rosters) {
    for (const entry of roster.theirs) {
      if (entry.personId) linked += 1;
      else unlinked += 1;
    }
  }
  return { linked, unlinked };
}
