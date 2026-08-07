import { describe, expect, it } from "vitest";

import {
  fromCalendarEvents,
  sourceRecordsFromAttachments,
  type RawCalendarEvent,
} from "@/lib/meetings/calendarEvents";
import { reconcileCalendarSpine } from "@/lib/meetings/calendarSpine";

/** The caller owns the zone; these tests use a fixed one so nothing here reads a clock. */
const toLocalDay = (iso: string) => iso.slice(0, 10);

const base: RawCalendarEvent = {
  id: "evt",
  summary: "A meeting",
  start: { dateTime: "2026-08-03T19:45:00-04:00" },
  attendees: [{ email: "rob@aivoicetech.io", self: true }, { email: "someone@else.com" }],
};

describe("fromCalendarEvents", () => {
  it("nothing is ever dropped — meetings + skipped always equals the input", () => {
    const events: RawCalendarEvent[] = [
      base,
      { ...base, id: "solo", summary: "Sarah", attendees: undefined },
      { ...base, id: "bday", summary: "Ellie Birthday Em", eventType: "BIRTHDAY", attendees: undefined },
      { ...base, id: "gone", status: "cancelled" },
      { ...base, id: "nostart", start: undefined },
    ];
    const { meetings, skipped } = fromCalendarEvents(events, { toLocalDay });
    expect(meetings.length + skipped.length).toBe(events.length);
    expect(meetings.map((m) => m.id)).toEqual(["evt"]);
    for (const s of skipped) expect(s.why.length).toBeGreaterThan(20);
  });

  it("a Meet URL typed into the location box is a conference link, NOT a physical location", () => {
    // Rob's real 2026-08-03 event: a conferenceUrl AND a second Meet room in `location`.
    const { meetings } = fromCalendarEvents(
      [
        {
          ...base,
          id: "austin",
          summary: "Rob & Austin | MArtin Fierro",
          conferenceUrl: "https://meet.google.com/twu-rpxe-fvg",
          location: "https://meet.google.com/snf-vmxj-dpo",
        },
      ],
      { toLocalDay },
    );
    expect(meetings[0].hasConferenceLink).toBe(true);
    expect(meetings[0].location).toBeUndefined();
  });

  it("that refusal is what keeps the spine from CLOSING a video call as in-person", () => {
    const { meetings } = fromCalendarEvents(
      [{ ...base, id: "austin", conferenceUrl: "https://meet.google.com/a", location: "https://meet.google.com/b" }],
      { toLocalDay },
    );
    const { rows } = reconcileCalendarSpine(meetings, []);
    // `in-person-no-recorder-possible` is the one status that closes a row. This must stay OPEN.
    expect(rows[0].status).toBe("owed-a-human");
  });

  it("a real street address survives as a location", () => {
    const { meetings } = fromCalendarEvents(
      [{ ...base, id: "omega", location: "3384 Woods Edge Cir #103, Bonita Springs, FL 34134, USA" }],
      { toLocalDay },
    );
    expect(meetings[0].hasConferenceLink).toBe(false);
    expect(meetings[0].location).toContain("Bonita Springs");
  });

  it("a solo entry WITH a conference link is still a meeting — the link is what makes it joinable", () => {
    const { meetings, skipped } = fromCalendarEvents(
      [{ ...base, id: "solo-call", attendees: [{ email: "rob@aivoicetech.io", self: true }], conferenceUrl: "https://meet.google.com/x" }],
      { toLocalDay },
    );
    expect(meetings).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("the local day comes from the caller, never from this module", () => {
    const seen: string[] = [];
    fromCalendarEvents([base], {
      toLocalDay: (iso) => {
        seen.push(iso);
        return "1999-01-01";
      },
    });
    expect(seen).toEqual(["2026-08-03T19:45:00-04:00"]);
  });

  it("an all-day event uses its `date`, and an untitled event is labelled rather than blanked", () => {
    const { meetings } = fromCalendarEvents(
      [{ id: "allday", start: { date: "2026-08-04" }, attendees: [{ email: "a@b.c" }] }],
      { toLocalDay },
    );
    expect(meetings[0].day).toBe("2026-08-04");
    expect(meetings[0].title).toBe("(untitled)");
  });
});

/* ------------------------------------------------------------------------------------------------
 * Q86 inc.4 — attachments become located source records.
 * ---------------------------------------------------------------------------------------------- */

const GEMINI_DOC =
  "https://docs.google.com/document/d/1R3Dh6W7w_dk_mc57wehfak3ToktX_nEfq9_o02ZjQV8/edit?usp=meet_tnfm_calendar";

const withNotes: RawCalendarEvent = {
  ...base,
  id: "k5c9v683uk0umjqp618ltsrbbg",
  summary: "Rob & Dix | MLE & Skin Cancer Detection AI Model",
  start: { dateTime: "2026-07-29T14:00:00-04:00" },
  conferenceUrl: "https://meet.google.com/bai-dvjq-dat",
  attachments: [{ fileUrl: GEMINI_DOC, title: "Notes by Gemini" }],
};

describe("sourceRecordsFromAttachments", () => {
  it("a Notes by Gemini doc becomes a gemini record, addressed by its Drive file id", () => {
    const [record] = sourceRecordsFromAttachments([withNotes], { toLocalDay });
    expect(record.source).toBe("gemini");
    expect(record.id).toBe("1R3Dh6W7w_dk_mc57wehfak3ToktX_nEfq9_o02ZjQV8");
    expect(record.url).toBe(GEMINI_DOC);
    expect(record.calendarEventId).toBe(withNotes.id);
    expect(record.day).toBe("2026-07-29");
  });

  it("THE REFUSAL: a located doc never claims a transcript, so it cannot close a row", () => {
    const records = sourceRecordsFromAttachments([withNotes], { toLocalDay });
    expect(records.every((r) => r.hasTranscript === false && r.hasVideo === false)).toBe(true);

    const { meetings } = fromCalendarEvents([withNotes], { toLocalDay });
    const report = reconcileCalendarSpine(meetings, records);
    // Still open work — but now with an address on it, which is the entire point of the increment.
    expect(report.rows[0].status).toBe("owed-a-human");
    expect(report.counts.owedAHuman).toBe(1);
    expect(report.rows[0].links).toHaveLength(1);
    expect(report.rows[0].links[0]).toMatchObject({ source: "gemini", basis: "calendar-id" });
  });

  it("a non-Gemini attachment is a Drive file, not silently called Gemini's", () => {
    const [record] = sourceRecordsFromAttachments(
      [{ ...withNotes, attachments: [{ fileId: "abc1234567890", title: "Agenda.pdf" }] }],
      { toLocalDay },
    );
    expect(record.source).toBe("drive");
    expect(record.id).toBe("abc1234567890");
    expect(record.url).toBeUndefined();
  });

  it("an attachment with no id and no url is dropped — a link nobody can open is not a source", () => {
    expect(
      sourceRecordsFromAttachments([{ ...withNotes, attachments: [{ title: "Notes by Gemini" }] }], {
        toLocalDay,
      }),
    ).toHaveLength(0);
  });

  it("a cancelled event's attachment is not coverage — the meeting did not happen", () => {
    expect(sourceRecordsFromAttachments([{ ...withNotes, status: "cancelled" }], { toLocalDay })).toHaveLength(0);
  });

  it("events without attachments produce nothing, so the sweep is safe over the whole calendar", () => {
    expect(sourceRecordsFromAttachments([base, { ...base, attachments: [] }], { toLocalDay })).toHaveLength(0);
  });
});

/**
 * The defect this increment opened on, asserted against the REAL snapshot rather than a fixture:
 * inc.3's committed snapshot dropped `attachments` entirely, so a fixture-only test would have gone
 * green on the exact omission. This reads the file that ships.
 */
describe("the live calendar snapshot carries its attachments", () => {
  it("the two Notes by Gemini docs Rob's calendar holds survive into the snapshot", async () => {
    const { readFileSync } = await import("node:fs");
    const snapshot = JSON.parse(
      readFileSync("MLE Internal Meetings/calendar-snapshot-2026-08-07.json", "utf8"),
    ) as { events: RawCalendarEvent[]; timeZone?: string };

    const records = sourceRecordsFromAttachments(snapshot.events, { toLocalDay });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.source)).toEqual(["gemini", "gemini"]);
    expect(records.every((r) => r.url?.startsWith("https://docs.google.com/document/d/"))).toBe(true);
    expect(records.every((r) => r.hasTranscript === false)).toBe(true);
    // Every record joins its event on the calendar's own id — no title guessing anywhere.
    const ids = new Set(snapshot.events.map((e) => e.id));
    expect(records.every((r) => ids.has(r.calendarEventId!))).toBe(true);
  });
});
