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
  // inc.5 note: this asserted `toHaveLength(2)` — the count under inc.4's 14-day window — and went
  // red the moment the window widened to cover the archive (7 docs). A hard count pinned the WINDOW,
  // not the behaviour the test was written for, so it is now a floor plus a per-record assertion:
  // every attachment that survives must be a real, located, unread Gemini doc. Non-vacuous because
  // the floor fails loudly if the snapshot ever drops attachments again, which is the original defect.
  it("the Notes by Gemini docs Rob's calendar holds survive into the snapshot", async () => {
    const { readFileSync } = await import("node:fs");
    const snapshot = JSON.parse(
      readFileSync("MLE Internal Meetings/calendar-snapshot-2026-08-07.json", "utf8"),
    ) as { events: RawCalendarEvent[]; timeZone?: string };

    const records = sourceRecordsFromAttachments(snapshot.events, { toLocalDay });
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records.every((r) => r.source === "gemini")).toBe(true);
    expect(records.every((r) => r.url?.startsWith("https://docs.google.com/document/d/"))).toBe(true);
    expect(records.every((r) => r.hasTranscript === false)).toBe(true);
    // Every record joins its event on the calendar's own id — no title guessing anywhere.
    const ids = new Set(snapshot.events.map((e) => e.id));
    expect(records.every((r) => ids.has(r.calendarEventId!))).toBe(true);
  });
});

/**
 * inc.14 — refusal 3. A broadcast Rob REGISTERED for is not a meeting he ATTENDED.
 *
 * Every case here is built from a shape that is really in the committed snapshot, because the
 * whole reason this rule exists is that the Jan–May read returned 41 events — 39 marketing
 * broadcasts, one real meeting, and one personal entry — and the 39 were drowning the board.
 */
describe("a Zoom webinar registration is not a meeting (refusal 3)", () => {
  const webinar: RawCalendarEvent = {
    id: "webinar",
    summary: "[ENCORE] How to Turn LinkedIn Into a 24/7 Client-Getting Machine",
    start: { dateTime: "2026-02-17T10:00:00-05:00" },
    // Exactly the snapshot's shape: Rob is the only attendee, and Google attached no conference.
    attendees: [{ self: true }],
    location: "https://us06web.zoom.us/w/84919914568?tk=zQz8IgabfYLhrjVQHc2",
  };

  it("skips it with the reason in words, and never deletes it", () => {
    const { meetings, skipped } = fromCalendarEvents([webinar], { toLocalDay });
    expect(meetings).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].why).toMatch(/registered for, not a meeting he attended/);
    // The denominator is preserved — the report cannot shrink itself.
    expect(meetings.length + skipped.length).toBe(1);
  });

  it("a Zoom /j/ CALL link is still a meeting — the rule reads Zoom's product, not the word zoom", () => {
    const call = { ...webinar, location: "https://us06web.zoom.us/j/84919914568" };
    expect(fromCalendarEvents([call], { toLocalDay }).meetings).toHaveLength(1);
  });

  it("another attendee makes it a meeting no matter what the link is", () => {
    const withGuest = { ...webinar, attendees: [{ self: true }, { email: "someone@else.com" }] };
    expect(fromCalendarEvents([withGuest], { toLocalDay }).meetings).toHaveLength(1);
  });

  it("an attached conferenceUrl makes it a meeting — Google parsed a real room", () => {
    const withConference = { ...webinar, conferenceUrl: "https://meet.google.com/ksx-ayxa-rgr" };
    expect(fromCalendarEvents([withConference], { toLocalDay }).meetings).toHaveLength(1);
  });

  it("a non-Zoom registration page is NOT caught — the rule is deliberately narrow", () => {
    // `impactforleads.com/linkedin-leads-training` is really in Rob's snapshot and really is a
    // broadcast. It stays owed-a-human rather than being swept up by an "unfamiliar host" rule
    // that would also eat a real 1:1 with a proprietary room link. See the doc comment.
    const other = { ...webinar, location: "https://www.impactforleads.com/linkedin-leads-training" };
    expect(fromCalendarEvents([other], { toLocalDay }).meetings).toHaveLength(1);
  });
});

/**
 * The rule measured against the file that ships, not a fixture — the inc.4 lesson. A fixture-only
 * test would go green while the real board stayed flooded.
 */
describe("against Rob's real committed snapshot", () => {
  it("the Jan–May webinars are skipped, both real meetings survive, and nothing is lost", async () => {
    const { readFileSync } = await import("node:fs");
    const snapshot = JSON.parse(
      readFileSync("MLE Internal Meetings/calendar-snapshot-2026-08-07.json", "utf8"),
    ) as { events: RawCalendarEvent[] };

    const { meetings, skipped } = fromCalendarEvents(snapshot.events, { toLocalDay });

    // Nothing is ever dropped: the two lists still account for every event in the file.
    expect(meetings.length + skipped.length).toBe(snapshot.events.length);

    const broadcasts = skipped.filter((s) => /registered for, not a meeting/.test(s.why));
    // A floor, not a hard count — inc.5's lesson about pinning the window instead of the behaviour.
    // It still fails loudly if the classification stops firing, which is the defect.
    expect(broadcasts.length).toBeGreaterThanOrEqual(41);

    // The two real Jan–May meetings must survive. This is the half that matters: a rule that
    // cleans the board by also removing real meetings is strictly worse than the flood.
    const titles = meetings.map((m) => m.title);
    expect(titles).toContain("Florian Rolke and Rob Acheson");
    // `Dr Lovette Phone` is a solo entry with no link — skipped by refusal 2, not by this rule.
    expect(skipped.find((s) => s.title === "Dr Lovette Phone")?.why).toMatch(/personal entry/);
  });
});
