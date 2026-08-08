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
 *   3. **A broadcast you REGISTERED for is not a meeting you ATTENDED** (inc.14, forced by the
 *      Jan–May read). Widening the window to the gap inc.13 left explicit returned 41 events, of
 *      which **39 are marketing broadcasts** and 2 are Rob's own (`Florian Rolke and Rob Acheson`,
 *      a real meeting, and `Dr Lovette Phone`, a personal entry). Refusal 2 already caught 7 of the
 *      39 — the ones with no link at all — so 32 of them landed on the board as meetings owed a
 *      transcript, taking it 33 → 66 meetings and 19 → 52 `owed-a-human`. The real gaps Rob is
 *      chasing ended up outnumbered 2:1 by mailing-list noise. A board nobody can scan does not
 *      report a gap; it hides one, which is the same false-confidence failure as a false close,
 *      arriving by volume instead of by verdict.
 *
 *      This also CORRECTS inc.13, which called December's four webinars "correctly counted as
 *      meetings nobody recorded". The count was honest and the classification was wrong; at four
 *      rows it was survivable and at forty-three it is not, but the rule was never true at any
 *      count. Rob's bar is *transcripts for ALL* — of HIS meetings. Nobody owes a transcript of a
 *      webinar broadcast to a mailing list, and no recorder was ever going to produce one.
 *
 *      AND IT REACHES FURTHER BACK THAN THE NEW SEGMENT. Of the 41 broadcasts the rule now skips,
 *      **9 were already in the committed snapshot** before this increment widened anything: the
 *      four December ones inc.13 named, plus **five June 2026 webinars** (Reddit Client Machine,
 *      SmartAgentX ×2, and two encores) that had been sitting on the board as meetings owed a
 *      human since long before December was ever read. Nobody widened a window to find those —
 *      they were miscounted in plain sight, which is why the rule is worth more than the segment
 *      that forced it.
 */

import { meetCodesIn } from "@/lib/meetings/calendarSpine";
import type { CalendarMeeting, MeetingSource, SourceRecord } from "@/lib/meetings/calendarSpine";

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
 *
 * **Q86 inc.15 — `gemini` and `drive` came OFF this list**, because they are now read: the Drive
 * MCP measures each attached Doc into `drive-snapshot-2026-08-07.json` and a reader's verdict lands
 * in `drive-read-confirmations.json` (`lib/meetings/driveReads.ts`). The list is shorter by
 * subtraction of work done, never by lowering what "wired" means — `gmail` stays because no mailbox
 * has been asked anything, and the sentence below still holds for it exactly.
 */
export const SOURCES_NOT_WIRED = ["gmail"] as const;

/**
 * A file Google Calendar hangs off an event. Google Meet writes one of these — `Notes by Gemini` —
 * onto the event automatically when Gemini takes notes, which is why this field is the cheapest
 * real coverage on the board: the pointer is already sitting on the spine we read.
 */
export type RawCalendarAttachment = {
  fileId?: string;
  fileUrl?: string;
  title?: string;
  mimeType?: string;
};

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
  attachments?: RawCalendarAttachment[];
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

/**
 * A Zoom **webinar** registration link — Zoom's `/w/` path, which is a different product from the
 * `/j/` join path a real Zoom call uses. See refusal 3.
 *
 * THE RULE IS DELIBERATELY NARROW, and the narrowness is the safety. It reads Zoom's own product
 * distinction rather than anything about the title: "webinar", "[ENCORE]", "🔴WATCH LIVE" and the
 * rest are marketing prose, and a rule keyed on prose would eventually eat a real meeting someone
 * titled badly. `/w/` is a fact Zoom wrote, not a word a human typed.
 *
 * It is NOT generalised to "any registration-looking URL". Rob's snapshot holds one more broadcast
 * of exactly this kind — `impactforleads.com/linkedin-leads-training` — and it stays a meeting
 * `owed-a-human` on purpose, because the only rule that would catch it is "an unfamiliar host with
 * no other attendee", which would also catch a genuine 1:1 whose organiser pasted a proprietary
 * room link Google never parsed into `conferenceUrl`. One survivor on the board is cheap; one real
 * meeting silently reclassified out of it is the failure this whole item exists to prevent.
 */
function isZoomWebinarRegistration(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return /(^|\.)zoom\.us$/i.test(parsed.hostname) && /^\/w\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

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

    // Refusal 3. All three conditions are required together, and each one carries weight:
    // Google attached no real conference, Rob is the only person on the invite, and the only link
    // is Zoom's WEBINAR path. A real Zoom call fails at least one of them — it has a `/j/` link,
    // or someone else on it, or both.
    if (
      !event.conferenceUrl?.trim() &&
      otherAttendees(event) === 0 &&
      event.location &&
      isZoomWebinarRegistration(event.location)
    ) {
      skip(
        "a Zoom WEBINAR registration link (`/w/`, not the `/j/` a call uses) with no other attendee " +
          "and no conference attached — a broadcast Rob registered for, not a meeting he attended. " +
          "Nobody owes a transcript of someone else's marketing webinar, and no recorder was ever " +
          "going to produce one. Listed here, never deleted: 41 of these would otherwise outnumber " +
          "the real gaps on the board 2:1 and hide them by volume.",
      );
      continue;
    }

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

    // inc.6 — the room codes on the invite, from BOTH boxes. Refusal 1 above drops a URL-shaped
    // location as a *location*; it must not also throw away the room it names. `snf-vmxj-dpo` was
    // typed into Rob's 8/3 address box and Fireflies recorded that exact room — reading only
    // `conferenceUrl` would leave that recording an orphan while its own address sat one field away.
    const conferenceCodes = [
      ...new Set([
        ...meetCodesIn(event.conferenceUrl ?? ""),
        ...(event.location && looksLikeAUrl(event.location) ? meetCodesIn(event.location) : []),
      ]),
    ];

    meetings.push({
      id: event.id,
      title,
      day: opts.toLocalDay(startIso),
      hasConferenceLink,
      ...(physicalLocation ? { location: physicalLocation } : {}),
      ...(conferenceCodes.length ? { conferenceCodes } : {}),
    });
  }

  return { meetings, skipped };
}

/* ------------------------------------------------------------------------------------------------
 * Q86 inc.4 — attachments on the event become NAMED, LOCATED source records.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The Drive file id inside a Docs/Drive URL, when there is one.
 *
 * A record needs a stable id or the spine cannot tell two runs apart. Google gives attachments a
 * `fileId` sometimes and not others — neither of Rob's two live `Notes by Gemini` attachments
 * carries one, only a `fileUrl` — so the id is lifted out of the URL, and the whole URL is the
 * fallback. Never a synthesised counter: an index would change the moment an attachment is added.
 */
function driveFileIdFrom(url: string): string | undefined {
  const byPath = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url);
  if (byPath) return byPath[1];
  const byQuery = /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url);
  return byQuery ? byQuery[1] : undefined;
}

/** Google Meet's own name for the doc Gemini writes. Matched loosely — the noun is what matters. */
function isGeminiNotes(title: string): boolean {
  return /gemini/i.test(title);
}

/**
 * Calendar attachments → source records the spine can reconcile.
 *
 * WHAT THIS FIXES: inc.3's snapshot dropped `attachments`, so two meetings Gemini demonstrably took
 * notes on read as `owed-a-human` with **no lead at all** — the report told a human to go looking
 * while the calendar was already holding the address. Rob named Gemini himself: *"sometimes I have
 * gemeni in there just in case"*.
 *
 * THE REFUSAL THAT MATTERS, and it is the whole reason this returns what it returns:
 * **`hasTranscript` and `hasVideo` are ALWAYS `false`.** Nothing in this repo has opened these
 * Docs — there is no Drive credential (see `SOURCES_NOT_WIRED`) — and *"a doc exists"* is not
 * *"a transcript exists"*. Setting `hasTranscript: true` here would flip both rows to
 * `transcript-only` and CLOSE them on evidence nobody read, which is INCIDENT-LEDGER #22/#34
 * running in the opposite direction: the same substitution of a reader's state for the meeting's.
 * So the row stays open and gains a URL. **Located is the claim. Read is not.**
 *
 * PURE per CR-3 — same contract as `fromCalendarEvents`, and `toLocalDay` is the caller's.
 */
export function sourceRecordsFromAttachments(
  events: RawCalendarEvent[],
  opts: { toLocalDay: (iso: string) => string },
): SourceRecord[] {
  const records: SourceRecord[] = [];

  for (const event of events) {
    // A cancelled event did not happen; a doc hanging off it is not coverage of a meeting.
    if (event.status === "cancelled") continue;

    const startIso = event.start?.dateTime ?? event.start?.date;

    for (const attachment of event.attachments ?? []) {
      const url = attachment.fileUrl?.trim();
      const id = attachment.fileId?.trim() || (url ? driveFileIdFrom(url) : undefined) || url;

      // No id and no URL is not a located record — it is a rumour. Dropped rather than reported
      // as a source, because a source link a human cannot open is worse than an empty row.
      if (!id) continue;

      const title = attachment.title?.trim() || "(untitled attachment)";

      // Gemini's notes are their own source in MEETING-SOURCE-MAP.md; anything else attached to a
      // Google Calendar event is a Drive file, which is also a source the map names.
      const source: MeetingSource = isGeminiNotes(title) ? "gemini" : "drive";

      records.push({
        source,
        id,
        title,
        ...(startIso ? { day: opts.toLocalDay(startIso) } : {}),
        // The certain join — this file is ON the event, so the spine links it at rung 1 and never
        // has to guess from a title.
        calendarEventId: event.id,
        hasTranscript: false,
        hasVideo: false,
        ...(url ? { url } : {}),
      });
    }
  }

  return records;
}
