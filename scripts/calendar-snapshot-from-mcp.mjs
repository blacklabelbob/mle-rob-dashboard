#!/usr/bin/env node
/**
 * calendar-snapshot-from-mcp.mjs — Q86 inc.5: turn a RAW Google Calendar `list_events` payload
 * into the redacted snapshot `scripts/calendar-spine.mjs` consumes.
 *
 * WHY THIS EXISTS AS CODE AND NOT AS CARE. inc.3 and inc.4 built the snapshot by hand from an MCP
 * response, and the thing standing between Rob's live contacts and a public git history was an
 * agent remembering to drop the fields. `guard:pii` caught it once already, which is the guard
 * doing its job and also the warning: the next refresh is one forgetful edit away from committing
 * a client's address book. The redaction is now a function with a test, and refreshing the window
 * is a command rather than a transcription.
 *
 * WHAT IT DROPS, and why each one is a deliberate loss rather than an oversight:
 *   • attendee EMAIL and displayName — the spine reads exactly two things off an attendee,
 *     Google's own `self` marker and the COUNT of everyone else. Identity is resolved from the
 *     LIVE calendar by person-resolver, never from a file in git.
 *   • `description` — meeting bodies routinely carry dial-in PINs, personal phone numbers and
 *     private notes. Nothing in the spine reads it.
 *   • `creator` / `organizer` / `htmlLink` — addresses and a link that re-identifies the event.
 *
 * WHAT IT KEEPS is exactly `RawCalendarEvent` in `lib/meetings/calendarEvents.ts` and nothing more.
 * A field this script does not carry is a field the spine provably does not read — that is the
 * inc.4 lesson (`attachments` was silently dropped and a Gemini doc went missing for an increment)
 * turned into a rule: the keep-list lives next to the type it feeds.
 *
 * PURE-ish per CR-3: `redactCalendarPayload` takes the parsed payload and returns the snapshot
 * object. No clock — `fetchedAt` and the window are ARGUMENTS, because a snapshot that stamps
 * itself with `Date.now()` cannot be re-generated identically from the same input, and this file's
 * whole job is that the same payload always yields the same commit.
 *
 * Usage:
 *   node scripts/calendar-snapshot-from-mcp.mjs \
 *     --in <raw-list_events.json> --out "MLE Internal Meetings/calendar-snapshot-YYYY-MM-DD.json" \
 *     --fetched-at 2026-08-07T21:20:00-04:00 \
 *     --window-start 2026-06-01T00:00:00-04:00 --window-end 2026-08-08T00:00:00-04:00 \
 *     --calendar-id rob@aivoicetech.io --comment "..."
 */

import { readFileSync, writeFileSync } from "node:fs";

/** The ONLY attendee facts that survive: Google's `self` marker, and being counted. */
function redactAttendee(attendee) {
  return attendee?.self === true ? { self: true } : {};
}

/** The ONLY attachment facts the spine reads. `fileId`/`fileUrl` locate it; nothing opens it. */
function redactAttachment(attachment) {
  const kept = {};
  for (const field of ["fileId", "fileUrl", "title", "mimeType"]) {
    if (attachment?.[field] != null) kept[field] = attachment[field];
  }
  return kept;
}

/**
 * Raw `list_events` payload → the snapshot shape, with every field the spine does not read removed.
 *
 * @param payload      as Google returned it (already windowed by the caller).
 * @param meta         `{ fetchedAt, calendarId, timeZone, window, comment, pii }` — all stated by
 *                     the caller, because none of them can be derived from the payload honestly.
 */
export function redactCalendarPayload(payload, meta) {
  const events = (payload?.events ?? []).map((event) => {
    const out = { id: event.id };
    if (event.summary != null) out.summary = event.summary;
    if (event.status != null) out.status = event.status;
    if (event.eventType != null) out.eventType = event.eventType;
    if (event.location != null) out.location = event.location;
    if (event.conferenceUrl != null) out.conferenceUrl = event.conferenceUrl;
    if (event.start != null) {
      out.start = {};
      if (event.start.dateTime != null) out.start.dateTime = event.start.dateTime;
      if (event.start.date != null) out.start.date = event.start.date;
    }
    if (event.attendees != null) out.attendees = event.attendees.map(redactAttendee);
    if (event.attachments != null) out.attachments = event.attachments.map(redactAttachment);
    return out;
  });

  return {
    _comment: meta.comment,
    fetchedAt: meta.fetchedAt,
    calendarId: meta.calendarId,
    timeZone: meta.timeZone ?? payload?.timeZone ?? "America/New_York",
    window: meta.window,
    _pii: meta.pii,
    events,
  };
}

/**
 * Fold a newly-read SEGMENT into an existing snapshot, widening the declared window to the union.
 *
 * WHY A MERGE AND NOT A RE-READ. Widening the window by re-reading the whole span would re-send
 * every event already committed through an agent's context for no gain, and — worse — it would
 * make the widened snapshot unreproducible from the segment that was actually fetched. A segment
 * read is the honest unit: it names exactly which days were newly covered.
 *
 * Dedupe is by Google's own event `id`, and the INCOMING row wins, because the segment is the
 * more recent read. The window is the union of both declared windows; it is NOT widened past
 * what was read — `segmentWindow` must be the span the caller actually asked Google for.
 *
 * Pure per CR-3: two objects in, one object out. No fs, no clock.
 */
export function mergeCalendarSnapshots(base, segment) {
  const byId = new Map((base?.events ?? []).map((e) => [e.id, e]));
  for (const event of segment?.events ?? []) byId.set(event.id, event);
  const min = (a, b) => (a == null ? b : b == null ? a : a < b ? a : b);
  const max = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b);
  return {
    ...base,
    ...segment,
    window: {
      start: min(base?.window?.start, segment?.window?.start),
      end: max(base?.window?.end, segment?.window?.end),
    },
    _segments: [...(base?._segments ?? []), { window: segment?.window, fetchedAt: segment?.fetchedAt, events: (segment?.events ?? []).length }],
    events: [...byId.values()].sort((a, b) =>
      (a.start?.dateTime ?? a.start?.date ?? "").localeCompare(b.start?.dateTime ?? b.start?.date ?? ""),
    ),
  };
}

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());

if (isMain && argOf("--in")) {
  const inPath = argOf("--in");
  const outPath = argOf("--out");
  if (!outPath) {
    console.error("✖ --out is required");
    process.exit(1);
  }
  const snapshot = redactCalendarPayload(JSON.parse(readFileSync(inPath, "utf8")), {
    comment: argOf("--comment") ?? "Live read of Rob's Google Calendar via the Calendar MCP, redacted by scripts/calendar-snapshot-from-mcp.mjs.",
    fetchedAt: argOf("--fetched-at"),
    calendarId: argOf("--calendar-id") ?? "rob@aivoicetech.io",
    timeZone: argOf("--time-zone"),
    window: { start: argOf("--window-start"), end: argOf("--window-end") },
    pii:
      "Attendee EMAIL ADDRESSES, displayNames, event descriptions, creator/organizer and htmlLink are " +
      "DELIBERATELY ABSENT — removed in CODE by scripts/calendar-snapshot-from-mcp.mjs, not by hand. " +
      "`fromCalendarEvents` reads exactly two things off an attendee: Google's own `self` marker and the " +
      "COUNT of everyone else. Attendee identity is resolved from the LIVE calendar by person-resolver.",
  });
  const mergePath = argOf("--merge");
  const final = mergePath
    ? mergeCalendarSnapshots(JSON.parse(readFileSync(mergePath, "utf8")), snapshot)
    : snapshot;
  writeFileSync(outPath, `${JSON.stringify(final, null, 1)}\n`);
  console.log(
    mergePath
      ? `✓ ${snapshot.events.length} segment events merged into ${final.events.length} → ${outPath} (window ${final.window.start} → ${final.window.end})`
      : `✓ ${snapshot.events.length} events → ${outPath}`,
  );
}
