/**
 * Q86 inc.3 — a Google Calendar event, as the spine needs it.
 *
 * `calendarSpine.ts` takes `CalendarMeeting[]` and refuses to know how to reach Google. The fetch
 * therefore lives in `scripts/calendar-spine.mjs`. What sits between the two — deciding which raw
 * event is a MEETING, which local day it fell on, and whether a bot could have joined it — is
 * judgement, not plumbing, so it lives here where a test can pin it.
 *
 * PURE per CR-3: no clock, no network, no fs. The window and the timezone are the caller's.
 *
 * THE TWO REFUSALS THIS MODULE EXISTS FOR, both found in the first live read (2026-08-07):
 *
 *   1. **A `location` that is itself a video link is NOT a physical location.** Rob's own
 *      `Rob & Austin | MArtin Fierro` event carries `conferenceUrl: meet.google.com/twu-rpxe-fvg`
 *      AND `location: https://meet.google.com/snf-vmxj-dpo` — two different Meet rooms, one of
 *      them typed into the address box. Passing that string through as a location would let the
 *      spine call a video call `in-person-no-recorder-possible`, which is the ONE status that
 *      CLOSES a row. A false close is worse than an open row: nobody looks again. So a
 *      URL-shaped location is dropped as a location and the event keeps `hasConferenceLink`.
 *
 *   2. **A solo entry is not a meeting, and is never silently dropped.** `Sarah`,
 *      `Ellie Birthday Em` — no attendees, no conference link. Counting them as meetings owed a
 *      transcript manufactures work; deleting them from the report manufactures confidence. They
 *      come back in `skipped` with the reason in words, so the arithmetic still adds up:
 *      `meetings.length + skipped.length === events.length`, pinned by test.
 *
 * It decides NOTHING about whether a meeting was recorded. That is the spine's job, and it is the
 * job this repo keeps getting wrong by answering it early.
 */

import type { CalendarMeeting } from "@/lib/meetings/calendarSpine";

/**
 * The sources `MEETING-SOURCE-MAP.md` names that nothing in this repo can query yet.
 *
 * It lives HERE, in the domain module, rather than in `scripts/calendar-spine.mjs` where it is
 * printed — and that placement was forced by a guard doing its job. Q76's `mailScopeBreaches`
 * scans `app/api` and `scripts` for modules that read a mailbox, and the bare word `gmail` in this
 * list tripped it: **the report NAMES Gmail precisely to say it is NOT read**. The two available
 * fixes were both worse. Declaring the script in `MAIL_READ_SCOPES` would invent a mailbox, a
 * credential and an audit trail that do not exist (the same reasoning that narrowed the marker for
 * `notion-meetings-sync.mjs`), and widening the marker's exclusions would blunt a guard over a
 * vocabulary problem. The list is domain vocabulary, so it belongs in the domain layer; the guard
 * keeps its full reach over `scripts/`, and every real route into that mailbox — the credential
 * name, the API surface, IMAP — still matches there.
 */
export const SOURCES_NOT_WIRED = ["gemini", "fathom", "notion", "gmail", "drive"] as const;

/** A Google Calendar event, narrowed to the fields the spine actually reads. */
export type RawCalendarEvent = {
  id: string;
  summary?: string;
  status?: string;
  location?: string;
  conferenceUrl?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean }[];
};

/** An event that is not a meeting, carried forward with the reason rather than dropped. */
export type SkippedEvent = {
  id: string;
  title: string;
  why: string;
};

export type CalendarHarvest = {
  meetings: CalendarMeeting[];
  skipped: SkippedEvent[];
};

/**
 * Event types that are never meetings no matter who is on them — Google's own classification, so
 * this is reading a fact rather than guessing one.
 */
const NON_MEETING_TYPES = new Set(["OUT_OF_OFFICE", "FOCUS_TIME", "WORKING_LOCATION", "BIRTHDAY"]);

/** Any conferencing link typed into the location box. Deliberately scheme-based, not host-based. */
function looksLikeAUrl(location: string): boolean {
  return /^https?:\/\//i.test(location.trim());
}

/**
 * Attendees other than Rob himself. `self` is Google's own marker for the authenticated user, and
 * it is trusted over any email comparison because the caller does not have to know which address
 * authenticated.
 */
function otherAttendees(event: RawCalendarEvent): number {
  return (event.attendees ?? []).filter((a) => a.self !== true).length;
}

/**
 * Raw events → spine meetings.
 *
 * @param events   as the calendar returned them, already windowed by the caller.
 * @param toLocalDay maps an ISO instant to a `YYYY-MM-DD` local day. The caller owns the zone —
 *                 an 8pm ET meeting is already tomorrow in UTC, and getting that wrong un-links a
 *                 meeting from every source record that agrees with it.
 */
export function fromCalendarEvents(
  events: RawCalendarEvent[],
  opts: { toLocalDay: (iso: string) => string },
): CalendarHarvest {
  const meetings: CalendarMeeting[] = [];
  const skipped: SkippedEvent[] = [];

  for (const event of events) {
    const title = event.summary?.trim() || "(untitled)";
    const skip = (why: string) => skipped.push({ id: event.id, title, why });

    if (event.status === "cancelled") {
      skip("the calendar marks this event cancelled — it did not happen, so no transcript is owed.");
      continue;
    }

    if (event.eventType && NON_MEETING_TYPES.has(event.eventType)) {
      skip(
        `eventType is ${event.eventType} — Google's own classification says this is not a meeting. ` +
          `Reported rather than dropped so the event count still reconciles.`,
      );
      continue;
    }

    const startIso = event.start?.dateTime ?? event.start?.date;
    if (!startIso) {
      skip("the event carries no start time, so it cannot be placed on a day or matched to a source.");
      continue;
    }

    const hasConferenceLink =
      Boolean(event.conferenceUrl?.trim()) || Boolean(event.location && looksLikeAUrl(event.location));

    if (otherAttendees(event) === 0 && !hasConferenceLink) {
      skip(
        "no attendee other than the calendar owner and no conference link — a personal entry, not a " +
          "meeting. It is listed here rather than deleted: an event this pass declined to count must " +
          "stay visible, or the report quietly shrinks its own denominator.",
      );
      continue;
    }

    // A URL in the location box is a video room, not a street. See refusal 1 at the top of the file.
    const physicalLocation =
      event.location && !looksLikeAUrl(event.location) ? event.location.trim() : undefined;

    meetings.push({
      id: event.id,
      title,
      day: opts.toLocalDay(startIso),
      hasConferenceLink,
      ...(physicalLocation ? { location: physicalLocation } : {}),
    });
  }

  return { meetings, skipped };
}
