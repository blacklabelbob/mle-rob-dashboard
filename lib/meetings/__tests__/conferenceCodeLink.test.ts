/**
 * Q86 inc.6 — the Meet room code as a join, and the three ways it must refuse to be one.
 *
 * The bug this closes was not a missing feature, it was a report reading its own inputs past each
 * other: `fireflies:snf-vmxj-dpo` sat in the unclaimed list dated 2026-08-03 while the calendar
 * event it belongs to sat in the SAME report, on the SAME day, with `snf-vmxj-dpo` typed into its
 * address box. So the real-snapshot assertions below are the point of this file — a fixture would
 * have gone green against the defect.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fromCalendarEvents } from "@/lib/meetings/calendarEvents";
import {
  meetCodesIn,
  reconcileCalendarSpine,
  type CalendarMeeting,
  type SourceRecord,
} from "@/lib/meetings/calendarSpine";

const meeting = (over: Partial<CalendarMeeting> = {}): CalendarMeeting => ({
  id: "evt-1",
  title: "Rob & Austin | MArtin Fierro",
  day: "2026-08-03",
  hasConferenceLink: true,
  conferenceCodes: ["snf-vmxj-dpo", "twu-rpxe-fvg"],
  ...over,
});

const record = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  source: "fireflies",
  id: "01KZ4ZNFE9ZKDJ6T9H4508PC9E",
  title: "snf-vmxj-dpo",
  day: "2026-08-03",
  hasTranscript: true,
  hasVideo: false,
  ...over,
});

describe("meetCodesIn", () => {
  it("reads a bare code, a Meet URL and an address-box URL alike", () => {
    expect(meetCodesIn("snf-vmxj-dpo")).toEqual(["snf-vmxj-dpo"]);
    expect(meetCodesIn("https://meet.google.com/twu-rpxe-fvg")).toEqual(["twu-rpxe-fvg"]);
    expect(meetCodesIn("SNF-VMXJ-DPO")).toEqual(["snf-vmxj-dpo"]);
  });

  it("finds nothing in a human title — which is why it can be trusted as an identifier", () => {
    expect(meetCodesIn("Rob & Dix | Skin Cancer Model Demo")).toEqual([]);
    expect(meetCodesIn("MLE TEAM KICKOFF")).toEqual([]);
  });

  it("refuses a code that is only a substring of a longer slug", () => {
    // Anchored on word boundaries: `xsnf-vmxj-dpoz` is a different string and must not link.
    expect(meetCodesIn("xsnf-vmxj-dpoz")).toEqual([]);
    expect(meetCodesIn("abc-defg-hijk")).toEqual([]);
  });
});

describe("the conference-code rung", () => {
  it("links a recording titled after the room, and says so in the basis", () => {
    const out = reconcileCalendarSpine([meeting()], [record()]);
    expect(out.rows[0].links).toEqual([
      expect.objectContaining({ source: "fireflies", basis: "conference-code", hasTranscript: true }),
    ]);
    expect(out.rows[0].status).toBe("transcript-only");
    expect(out.unclaimed).toHaveLength(0);
  });

  it("REFUSES a code match on a different day — a recurring invite reuses one room for months", () => {
    const out = reconcileCalendarSpine([meeting()], [record({ day: "2026-08-10" })]);
    expect(out.rows[0].links).toEqual([]);
    expect(out.rows[0].status).toBe("owed-a-human");
    expect(out.unclaimed).toHaveLength(1);
  });

  it("REFUSES to link when the meeting carries no room code at all", () => {
    const out = reconcileCalendarSpine([meeting({ conferenceCodes: undefined })], [record()]);
    expect(out.rows[0].links).toEqual([]);
    expect(out.unclaimed).toHaveLength(1);
  });

  it("never overrides the calendar's own id — a record naming another event stays with that event", () => {
    const out = reconcileCalendarSpine([meeting()], [record({ calendarEventId: "evt-other" })]);
    expect(out.rows[0].links).toEqual([]);
  });

  it("sits ABOVE day-and-title: an id link is still taken first and is never doubled", () => {
    const out = reconcileCalendarSpine(
      [meeting()],
      [record({ calendarEventId: "evt-1", title: "snf-vmxj-dpo" })],
    );
    expect(out.rows[0].links).toHaveLength(1);
    expect(out.rows[0].links[0].basis).toBe("calendar-id");
  });
});

describe("against Rob's real committed calendar snapshot", () => {
  const snapshot = JSON.parse(
    readFileSync(
      join(process.cwd(), "MLE Internal Meetings", "calendar-snapshot-2026-08-07.json"),
      "utf8",
    ),
  );
  const { meetings } = fromCalendarEvents(snapshot.events ?? [], { toLocalDay: (iso: string) => iso.slice(0, 10) });

  it("lifts the room code out of BOTH the conference link and the address box", () => {
    // Rob's 8/3 invite carries two different rooms, one of them typed into `location`. Reading only
    // `conferenceUrl` would have left the Fireflies recording of `snf-vmxj-dpo` an orphan.
    const martinFierro = meetings.find((m) => m.title.includes("MArtin Fierro"));
    expect(martinFierro).toBeDefined();
    expect(martinFierro!.conferenceCodes).toEqual(
      expect.arrayContaining(["snf-vmxj-dpo", "twu-rpxe-fvg"]),
    );
    // …and the URL-shaped location is still not a physical location (inc.3's refusal, unbroken).
    expect(martinFierro!.location).toBeUndefined();
  });

  it("the three codes that sat orphaned for two increments are all present on the spine", () => {
    const all = new Set(meetings.flatMap((m) => m.conferenceCodes ?? []));
    for (const code of ["snf-vmxj-dpo", "bsn-kwzp-wch", "aob-fada-amf"]) {
      expect(all.has(code)).toBe(true);
    }
  });

  it("a real human-titled meeting still carries no code, so the rung cannot fire on prose", () => {
    const withCodes = meetings.filter((m) => (m.conferenceCodes ?? []).length > 0);
    const withoutCodes = meetings.filter((m) => (m.conferenceCodes ?? []).length === 0);
    expect(withCodes.length).toBeGreaterThan(0);
    expect(withoutCodes.length).toBeGreaterThan(0);
  });
});
