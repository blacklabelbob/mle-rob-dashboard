// Q86 inc.43 — the call-date window, tested against the REAL read rather than fixtures.
//
// The first test loads `MLE Internal Meetings/transcript-reads/john-burns-2026-08-08.json` and pins
// the live shape, so a re-read that changes the upload day or the negotiated weekdays fails loudly
// instead of leaving the arithmetic green about a world that moved.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { boundCallDate, weekdayName, weekdayIndex } from "../transcriptCallWindow";
import { planTranscriptActivity } from "../transcriptActivityDraft";
import type { TranscriptRecordLink } from "../transcriptRecordLink";

const READ_PATH = path.join(
  process.cwd(),
  "MLE Internal Meetings",
  "transcript-reads",
  "john-burns-2026-08-08.json",
);

const read = JSON.parse(readFileSync(READ_PATH, "utf8"));

describe("the live john-burns read", () => {
  it("still carries the upload ceiling and the intel the window depends on", () => {
    expect(read.transcriptRef).toBe("john-burns.txt");
    expect(read.callDate.latestPossible).toBe("2026-07-09");
    expect(read.callDate.resolved).toBe(false);
    // Every intel entry must be addressable — this is the property publish-meeting-activity needs.
    expect(read.intel.length).toBeGreaterThan(0);
    for (const item of read.intel) {
      expect(item.text.trim().length).toBeGreaterThan(0);
      expect(item.sourceRef).toMatch(/^john-burns\.txt:\d+$/);
    }
  });

  it("names no money, quoted, signed or paid field anywhere in the read", () => {
    const blob = JSON.stringify(read.intel).toLowerCase();
    for (const forbidden of ["quoted_amount", "signed_at", "paid_at", "amount_paid"]) {
      expect(blob).not.toContain(forbidden);
    }
  });
});

describe("weekday arithmetic", () => {
  it("is Monday-first and matches the real calendar", () => {
    expect(weekdayName("2026-07-06")).toBe("monday");
    expect(weekdayName("2026-07-09")).toBe("thursday");
    expect(weekdayIndex("2026-07-12")).toBe(6); // Sunday
  });
});

describe("boundCallDate", () => {
  const johnBurns = () =>
    boundCallDate({
      ref: "john-burns.txt",
      uploadedOn: read.callDate.latestPossible,
      futureWeekdays: ["friday", "thursday"],
    });

  it("reproduces the three candidates the read recorded, from the evidence alone", () => {
    const w = johnBurns();
    expect(w.candidates).toEqual(read.callDate.candidates);
    expect(w.weekStart).toBe("2026-07-06");
    expect(w.latestPossible).toBe("2026-07-09");
  });

  it("refuses to resolve when more than one day survives", () => {
    const w = johnBurns();
    expect(w.resolved).toBe(false);
    expect(w.day).toBeNull();
    expect(w.why).toContain("3 days survive");
  });

  it("takes the EARLIEST future weekday as binding, so Friday cannot widen Thursday", () => {
    const withFridayOnly = boundCallDate({
      ref: "x",
      uploadedOn: "2026-07-09",
      futureWeekdays: ["friday"],
    });
    expect(withFridayOnly.candidates).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
    ]);
    // Adding Thursday can only NARROW, never widen.
    expect(johnBurns().candidates.length).toBeLessThan(withFridayOnly.candidates.length);
  });

  it("resolves to a single day only when exactly one survives", () => {
    const w = boundCallDate({
      ref: "x",
      uploadedOn: "2026-07-06",
      futureWeekdays: ["tuesday"],
    });
    expect(w.candidates).toEqual(["2026-07-06"]);
    expect(w.resolved).toBe(true);
    expect(w.day).toBe("2026-07-06");
  });

  it("says the week assumption is broken rather than inventing a day outside it", () => {
    const w = boundCallDate({ ref: "x", uploadedOn: "2026-07-09", futureWeekdays: ["monday"] });
    expect(w.candidates).toEqual([]);
    expect(w.resolved).toBe(false);
    expect(w.day).toBeNull();
    expect(w.why).toContain("NOT the upload week");
  });

  it("falls back to the upload ceiling alone when no weekday is placed in the future", () => {
    const w = boundCallDate({ ref: "x", uploadedOn: "2026-07-08" });
    expect(w.candidates).toEqual(["2026-07-06", "2026-07-07", "2026-07-08"]);
    expect(w.assumptions[0]).toContain("nothing narrows the week");
  });

  it("ignores a misheard weekday instead of throwing", () => {
    const w = boundCallDate({ ref: "x", uploadedOn: "2026-07-09", futureWeekdays: ["thorsday"] });
    expect(w.candidates).toHaveLength(4);
  });

  it("rejects a day that is not YYYY-MM-DD rather than coercing one", () => {
    expect(() => boundCallDate({ ref: "x", uploadedOn: "July 9" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("the intel half of the refusal is now closed", () => {
  const link: TranscriptRecordLink = {
    transcript: { ref: "john-burns.txt", title: "Call with John Burns" },
    status: "linked",
    record: { id: "P-1015", entityKind: "person", name: "John Burns", slug: "john-burns" },
    signals: { nameMatched: "John Burns", slugMatched: true },
    unexplainedTitleWords: [],
  } as unknown as TranscriptRecordLink;

  const intel = read.intel.map((i: { kind: string; text: string; sourceRef: string }) => ({
    kind: i.kind,
    text: i.text,
    sourceRef: i.sourceRef,
  }));

  it("no longer refuses for `no-intel` — the real read satisfies the write boundary", () => {
    const result = planTranscriptActivity({
      link,
      orgId: "C-2013",
      personId: "P-1015",
      occurredOn: null,
      intel,
    });
    expect(result.drafted).toBe(false);
    if (result.drafted) throw new Error("unreachable");
    // The ONLY remaining blocker is the day. That is the measurable move this increment made.
    expect(result.refusal.kind).toBe("no-day");
  });

  it("drafts the moment a proven day is supplied, carrying every sourceRef through", () => {
    const result = planTranscriptActivity({
      link,
      orgId: "C-2013",
      personId: "P-1015",
      occurredOn: "2026-07-08",
      intel,
    });
    expect(result.drafted).toBe(true);
    if (!result.drafted) throw new Error("unreachable");
    expect(result.draft.orgId).toBe("C-2013");
    expect(result.draft.personId).toBe("P-1015");
    expect(result.draft.occurredAt).toBe("2026-07-08");
    expect(result.draft.sourceContext.intel).toHaveLength(intel.length);
    for (const item of result.draft.sourceContext.intel) {
      expect(item.sourceRef).toMatch(/^john-burns\.txt:\d+$/);
    }
  });

  it("still refuses on an unresolved window — the draft cannot be reached by guessing", () => {
    const w = boundCallDate({
      ref: "john-burns.txt",
      uploadedOn: "2026-07-09",
      futureWeekdays: ["thursday", "friday"],
    });
    const result = planTranscriptActivity({
      link,
      orgId: "C-2013",
      personId: "P-1015",
      occurredOn: w.day, // null while unresolved
      intel,
    });
    expect(result.drafted).toBe(false);
  });
});
