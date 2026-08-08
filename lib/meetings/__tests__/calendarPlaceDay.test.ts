// Q86 inc.48 — DoD (b)/(e). Does the calendar hold an event on 2026-06-19?
//
// inc.47 read the largest artefact in Drive `/Unprocessed` — "Call w David Cates RE MLE Sales
// Position Overview", 114,530 chars of speaker-attributed dialogue, Drive `createdTime`
// 2026-06-19 — and left TWO named unblocks: a calendar event on or near that day to place it,
// and a company record for the Cates side. This file settles the first one BY MACHINE, against
// the real snapshot on disk, so no future increment re-scrolls the same calendar.
//
// The reason it is a test and not a script run: the answer only counts if it is re-provable. If
// somebody widens the snapshot window or re-fetches the calendar and a 6/19 event appears, this
// file goes red and the doc becomes placeable — which is the correct alarm, not a regression.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { daysWithMeetings, placeDay } from "../calendarSpine";

const SNAPSHOT = join(
  process.cwd(),
  "MLE Internal Meetings",
  "calendar-snapshot-2026-08-07.json",
);

type RawEvent = { summary?: string; start?: { dateTime?: string; date?: string } };

/**
 * The local day of an event. The snapshot's `dateTime` carries its OWN UTC offset
 * (`2026-06-18T13:30:00-04:00`), so the first ten characters are already the local day — no Date
 * is constructed and no ambient zone can shift it.
 */
function localDay(e: RawEvent): string {
  return String(e.start?.dateTime ?? e.start?.date ?? "").slice(0, 10);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
  window: { start: string; end: string };
  events: RawEvent[];
};

const spine = {
  window: {
    startDay: snapshot.window.start.slice(0, 10),
    endDay: snapshot.window.end.slice(0, 10),
  },
  daysWithMeetings: daysWithMeetings(
    snapshot.events.map((e) => ({ day: localDay(e), title: e.summary ?? "" })),
  ),
};

/** Drive `createdTime` of the earlier Cates transcript, per `drive-doc-reads-2026-08-08.json`. */
const CATES_DAY = "2026-06-19";

describe("placeDay against the real calendar snapshot", () => {
  it("proves the read COVERS 2026-06-19 before saying anything about what is on it", () => {
    // This is the assertion that makes the next one worth something. `in-window-day-empty` and
    // `outside-window` both look like "no event"; only the first is a finding.
    expect(CATES_DAY >= spine.window.startDay).toBe(true);
    expect(CATES_DAY < spine.window.endDay).toBe(true);
  });

  it("finds the calendar BUSY on the days either side, so the read is demonstrably live there", () => {
    // If 6/18 and 6/20 were also empty the verdict on 6/19 would be worthless — it would mean the
    // read simply holds nothing in that stretch. They are not: both carry real meetings.
    expect(placeDay("2026-06-18", spine)).toBe("in-window-day-busy");
    expect(placeDay("2026-06-20", spine)).toBe("in-window-day-busy");
  });

  it("finds NO event on 2026-06-19 — the earlier Cates call was never on this calendar", () => {
    expect(placeDay(CATES_DAY, spine)).toBe("in-window-day-empty");
    expect(spine.daysWithMeetings.get(CATES_DAY) ?? []).toHaveLength(0);
  });

  it("never reports a bare day as empty when no window was declared", () => {
    // The failure direction that matters: silence about the read must not read as absence.
    expect(placeDay(CATES_DAY, { daysWithMeetings: spine.daysWithMeetings })).toBe(
      "unknown-window",
    );
    expect(placeDay(undefined, spine)).toBe("undated");
  });

  it("calls a day the read never reached `outside-window`, not empty", () => {
    expect(placeDay("2025-01-05", spine)).toBe("outside-window");
    expect(placeDay(spine.window.endDay, spine)).toBe("outside-window"); // end is EXCLUSIVE
  });
});
