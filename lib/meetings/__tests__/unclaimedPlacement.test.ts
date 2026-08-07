/**
 * Q86 inc.7 — the five records inc.6 left in the orphan list, and the sentence that covered them.
 *
 * inc.6 ended with five unclaimed recordings and one honest note: each is *"either a meeting that
 * was never on the calendar at all, or one whose invite the read did not reach. That distinction
 * is the finding, and it must not be guessed."* It is not a guess — the caller knows which days the
 * read covered, and the report already holds every event it found. The module was simply never
 * given the window, so it printed an OR it did not have to print.
 *
 * The script HAD grown a window check of its own (inc.5), in a `verdictOf` closure no test ever
 * ran. That is the shape this repo keeps paying for: a rule that lives in the printer, agreeing
 * with the arithmetic only for as long as someone remembers to keep it agreeing. It moves here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { reconcileCalendarSpine, type CalendarMeeting, type SourceRecord } from "../calendarSpine";

const WINDOW = { startDay: "2026-06-01", endDay: "2026-08-08" };

const meeting = (over: Partial<CalendarMeeting> = {}): CalendarMeeting => ({
  id: "evt-1",
  title: "Rob & Austin",
  day: "2026-07-09",
  hasConferenceLink: true,
  ...over,
});

const record = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  source: "fireflies",
  id: "ff-1",
  title: "MLE TEAM KICKOFF",
  day: "2026-07-09",
  hasTranscript: true,
  hasVideo: false,
  ...over,
});

describe("unclaimed placement — the read's reach, stated rather than implied", () => {
  it("names the same-day events when the calendar was read that day and holds some", () => {
    const out = reconcileCalendarSpine(
      [meeting(), meeting({ id: "evt-2", title: "Standup" })],
      [record()],
      { window: WINDOW },
    );

    const [u] = out.unclaimed;
    expect(u.placement).toBe("in-window-day-busy");
    expect(u.sameDayMeetings.map((m) => m.id)).toEqual(["evt-1", "evt-2"]);
    // The candidates are printed, because a human ruling on two titles is the whole point; the
    // module must NOT rule, so the sentence has to hand over the alternatives rather than a pick.
    expect(u.why).toContain('"Rob & Austin"');
    expect(u.why).toContain('"Standup"');
    expect(u.why).toContain("a human rules");
  });

  it("says the calendar holds NOTHING that day when the read covered it and found no event", () => {
    const out = reconcileCalendarSpine([meeting({ day: "2026-07-10" })], [record()], {
      window: WINDOW,
    });

    const [u] = out.unclaimed;
    expect(u.placement).toBe("in-window-day-empty");
    expect(u.sameDayMeetings).toEqual([]);
    expect(u.why).toContain("NO event that day");
    // Still not a conclusion about the meeting: another calendar remains a live possibility, and
    // this is INCIDENT-LEDGER #22/#34 — our silence is never the meeting's absence.
    expect(u.why).toContain("another calendar");
  });

  it("calls a record outside the window an artefact of the read, never a finding", () => {
    const out = reconcileCalendarSpine([meeting()], [record({ day: "2026-05-30" })], {
      window: WINDOW,
    });

    const [u] = out.unclaimed;
    expect(u.placement).toBe("outside-window");
    expect(u.why).toContain("outside the window");
    expect(u.why).toContain("not a finding about the meeting");
  });

  it("treats the window's end as EXCLUSIVE, exactly as it is declared to the fetcher", () => {
    const onEnd = reconcileCalendarSpine([], [record({ day: "2026-08-08" })], { window: WINDOW });
    const dayBefore = reconcileCalendarSpine([], [record({ day: "2026-08-07" })], { window: WINDOW });
    expect(onEnd.unclaimed[0].placement).toBe("outside-window");
    expect(dayBefore.unclaimed[0].placement).toBe("in-window-day-empty");
  });

  it("counts ONLY the in-window records as the finding, and reports the other two beside it", () => {
    const out = reconcileCalendarSpine(
      [meeting()],
      [
        record({ id: "a" }), //                      in window, busy day
        record({ id: "b", day: "2026-07-10" }), //   in window, empty day
        record({ id: "c", day: "2026-05-01" }), //   outside
        record({ id: "d", day: undefined }), //      undated
      ],
      { window: WINDOW },
    );

    expect(out.counts.unclaimed).toBe(4);
    expect(out.counts.unclaimedInWindow).toBe(2);
    expect(out.counts.unclaimedOutsideWindow).toBe(1);
    expect(out.counts.unclaimedUndated).toBe(1);
    // The three never sum into one another: an artefact and an unreadable record are not open work,
    // and folding them in is how a real gap gets hidden inside a bigger, softer number.
    expect(
      out.counts.unclaimedInWindow + out.counts.unclaimedOutsideWindow + out.counts.unclaimedUndated,
    ).toBe(out.counts.unclaimed);
  });

  it("admits it does not know the read's reach when no window is declared", () => {
    const out = reconcileCalendarSpine([meeting()], [record()]);
    expect(out.unclaimed[0].placement).toBe("unknown-window");
    expect(out.counts.unclaimedInWindow).toBe(0);
  });

  it("judges a dateless record against no window at all", () => {
    const out = reconcileCalendarSpine([meeting()], [record({ day: undefined })], {
      window: WINDOW,
    });
    expect(out.unclaimed[0].placement).toBe("undated");
    expect(out.unclaimed[0].why).toContain("states no day");
  });
});

describe("against Rob's real committed snapshot", () => {
  it("declares a window covering the snapshot's own dates, so the report can be judged", () => {
    // Read rather than fixtured: the five orphans inc.6 wrote down are real rows, and a fixture
    // would go green about a snapshot nobody is running.
    const snapshot = JSON.parse(
      readFileSync(
        join(process.cwd(), "MLE Internal Meetings", "calendar-snapshot-2026-08-07.json"),
        "utf8",
      ),
    );
    expect(snapshot.window?.start).toBeTruthy();
    expect(snapshot.window?.end).toBeTruthy();
    // The window must actually contain the events it was used to fetch, or every unclaimed record
    // would be excused as "outside the read" and the finding would vanish into an artefact.
    const days: string[] = (snapshot.events ?? [])
      .map((e: { start?: { dateTime?: string; date?: string } }) => e.start?.dateTime ?? e.start?.date)
      .filter(Boolean)
      .map((iso: string) => iso.slice(0, 10));
    expect(days.length).toBeGreaterThan(0);
    const start = String(snapshot.window.start).slice(0, 10);
    const end = String(snapshot.window.end).slice(0, 10);
    for (const d of days) {
      expect(d >= start && d < end).toBe(true);
    }
  });
});
