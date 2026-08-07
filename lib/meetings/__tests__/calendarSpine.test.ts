/**
 * Q86 inc.1 — the calendar spine.
 *
 * The tests that matter here are not "does it find the transcript". They are the ones that pin the
 * REFUSALS: a near-title is never welded, an absent transcript is never reported as a fact about
 * the meeting, and a recording nobody's calendar knows about never becomes a meeting.
 */

import { describe, expect, it } from "vitest";
import {
  reconcileCalendarSpine,
  normalizeTitle,
  type CalendarMeeting,
  type SourceRecord,
} from "@/lib/meetings/calendarSpine";

const MEET: CalendarMeeting = {
  id: "evt-1",
  title: "Joseph, Rob, Will | MLE Partnership",
  day: "2026-07-20",
  hasConferenceLink: true,
};

describe("reconcileCalendarSpine — the join ladder", () => {
  it("links on the calendar id without consulting the title at all", () => {
    const rec: SourceRecord = {
      source: "fireflies",
      id: "ff-9",
      title: "completely different words",
      day: "2026-01-01",
      calendarEventId: "evt-1",
      hasTranscript: true,
      hasVideo: true,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows[0].links).toHaveLength(1);
    expect(out.rows[0].links[0].basis).toBe("calendar-id");
    expect(out.rows[0].status).toBe("transcript-and-video");
    expect(out.counts.unclaimed).toBe(0);
  });

  it("links on same day AND identical normalized title", () => {
    const rec: SourceRecord = {
      source: "notion",
      id: "page-1",
      title: "  joseph, rob, will |  MLE   partnership ",
      day: "2026-07-20",
      hasTranscript: true,
      hasVideo: false,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows[0].links[0].basis).toBe("day-and-title");
    expect(out.rows[0].status).toBe("transcript-only");
  });

  it("REFUSES to weld a same-day near-title — it is reported as uncertain, not as coverage", () => {
    const rec: SourceRecord = {
      source: "gemini",
      id: "doc-1",
      title: "Joseph and Rob — partnership next steps",
      day: "2026-07-20",
      hasTranscript: true,
      hasVideo: false,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows[0].links).toHaveLength(0);
    expect(out.rows[0].uncertain).toHaveLength(1);
    expect(out.rows[0].uncertain[0].source).toBe("gemini");
    // the transcript it holds must NOT count for the meeting
    expect(out.rows[0].transcriptSources).toEqual([]);
    expect(out.rows[0].status).toBe("owed-a-human");
    expect(out.counts.withUncertain).toBe(1);
    // and it stays unclaimed, so it is never silently absorbed
    expect(out.counts.unclaimed).toBe(1);
  });

  it("does not consider a record whose calendar id points at a DIFFERENT event", () => {
    const rec: SourceRecord = {
      source: "fathom",
      id: "fa-1",
      title: "Joseph, Rob, Will | MLE Partnership",
      day: "2026-07-20",
      calendarEventId: "evt-other",
      hasTranscript: true,
      hasVideo: false,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows[0].links).toHaveLength(0);
    expect(out.rows[0].uncertain).toHaveLength(0);
  });

  it("converges duplicate recorders onto ONE meeting row carrying multiple source links", () => {
    const records: SourceRecord[] = [
      { source: "fireflies", id: "ff-1", title: "x", calendarEventId: "evt-1", hasTranscript: true, hasVideo: false },
      { source: "gemini", id: "gm-1", title: "y", calendarEventId: "evt-1", hasTranscript: true, hasVideo: false },
      { source: "fathom", id: "fa-1", title: "z", calendarEventId: "evt-1", hasTranscript: false, hasVideo: true },
    ];
    const out = reconcileCalendarSpine([MEET], records);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].links.map((l) => l.source).sort()).toEqual(["fathom", "fireflies", "gemini"]);
    expect(out.rows[0].transcriptSources.sort()).toEqual(["fireflies", "gemini"]);
    expect(out.rows[0].videoSources).toEqual(["fathom"]);
    expect(out.rows[0].status).toBe("transcript-and-video");
  });
});

describe("reconcileCalendarSpine — what it will and will not claim about an absence", () => {
  it("states the ONE reason the calendar itself proves: in person, no bot could join", () => {
    const inPerson: CalendarMeeting = {
      id: "evt-2",
      title: "Omega Title | Naples",
      day: "2026-07-28",
      hasConferenceLink: false,
      location: "3033 Riviera Dr, Naples FL",
    };
    const out = reconcileCalendarSpine([inPerson], []);
    expect(out.rows[0].status).toBe("in-person-no-recorder-possible");
    expect(out.rows[0].reason).toContain("no bot could");
    expect(out.counts.inPerson).toBe(1);
    expect(out.counts.owedAHuman).toBe(0);
  });

  it("a videoconference with nothing found is OWED A HUMAN — never 'no transcript exists'", () => {
    const out = reconcileCalendarSpine([MEET], []);
    expect(out.rows[0].status).toBe("owed-a-human");
    expect(out.rows[0].reason).toContain("about OUR search");
    expect(out.rows[0].reason).not.toMatch(/no transcript exists\b(?!.*until)/);
    expect(out.counts.owedAHuman).toBe(1);
  });

  it("an event with no link and no location is owed a human, NOT excused as in person", () => {
    const bare: CalendarMeeting = { id: "evt-3", title: "Weekly Review", day: "2026-07-17", hasConferenceLink: false };
    const out = reconcileCalendarSpine([bare], []);
    expect(out.rows[0].status).toBe("owed-a-human");
  });

  it("video with no transcript is its own state — Rob's bar is transcripts for ALL", () => {
    const rec: SourceRecord = {
      source: "drive",
      id: "m4a-1",
      title: "t",
      calendarEventId: "evt-1",
      hasTranscript: false,
      hasVideo: true,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows[0].status).toBe("video-only");
    expect(out.counts.withTranscript).toBe(0);
    expect(out.counts.withVideo).toBe(1);
  });
});

describe("reconcileCalendarSpine — records the spine does not claim", () => {
  it("reports an unclaimed recording rather than promoting it into a meeting", () => {
    const rec: SourceRecord = {
      source: "notion",
      id: "page-orphan",
      title: "Meeting 2026-08-05",
      day: "2026-08-05",
      hasTranscript: true,
      hasVideo: false,
    };
    const out = reconcileCalendarSpine([MEET], [rec]);
    expect(out.rows).toHaveLength(1);
    expect(out.unclaimed).toHaveLength(1);
    // Q86 inc.7 corrected this assertion in place. It used to demand the sentence "either the
    // event was never on the calendar, or the read did not cover this day" — an OR the caller can
    // resolve and this module was stating as if it could not. With NO window declared the module
    // now says exactly that much and no more: it does not know what the read covered.
    expect(out.unclaimed[0].placement).toBe("unknown-window");
    expect(out.unclaimed[0].why).toContain("no read window");
  });

  it("says plainly that a dateless record cannot be placed against the spine at all", () => {
    const rec: SourceRecord = { source: "notion", id: "p", title: "Meeting", hasTranscript: false, hasVideo: false };
    const out = reconcileCalendarSpine([], [rec]);
    expect(out.unclaimed[0].why).toContain("states no day");
  });
});

describe("normalizeTitle", () => {
  it("folds case, punctuation and whitespace and nothing else", () => {
    expect(normalizeTitle("Rob & Will | MLE  Partnership!")).toBe("rob will mle partnership");
  });
});
