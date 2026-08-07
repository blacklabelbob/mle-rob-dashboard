import { describe, expect, it } from "vitest";

import { fromCalendarEvents, type RawCalendarEvent } from "@/lib/meetings/calendarEvents";
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
