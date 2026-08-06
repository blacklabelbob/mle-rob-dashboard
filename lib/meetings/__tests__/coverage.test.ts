import { describe, expect, it } from "vitest";
import { coverageCountLabel, meetingCoverage, noMeetingNote } from "../coverage";
import type { Activity } from "@/lib/types";

// Q89 inc.21 — critic-rob punch #6. The line a record with no captured meeting prints
// instead of nothing. What is under test is the SENTENCE, not just the arithmetic:
// punch #6 is a truth defect (blank space reads as "nothing was said here"), so the
// assertions pin the rendered string both surfaces will show.

// `type`, not `kind` — the same discriminator `intelSource.isMeeting` reads. A fixture
// that gets this wrong counts zero meetings and every assertion below passes vacuously.
const meeting = (id: string, orgId?: string): Activity =>
  ({
    id,
    type: "meeting",
    orgId,
    occurredAt: "2026-07-28T15:00:00Z",
    summary: id,
  }) as unknown as Activity;

const call = (id: string): Activity =>
  ({ id, type: "call", occurredAt: "2026-07-28T15:00:00Z", summary: id }) as unknown as Activity;

describe("meetingCoverage", () => {
  it("counts meetings and the distinct companies they attach to", () => {
    const c = meetingCoverage(
      [meeting("A-1", "C-2019"), meeting("A-2", "C-2018"), meeting("A-3", "C-2018"), call("A-4")],
      31
    );
    expect(c).toEqual({ meetings: 3, companiesWithMeetings: 2, totalCompanies: 31 });
  });

  it("does not credit an unattached meeting to any company", () => {
    const c = meetingCoverage([meeting("A-1"), meeting("A-2", "  ")], 31);
    expect(c.meetings).toBe(2);
    expect(c.companiesWithMeetings).toBe(0);
  });

  it("never reports a negative denominator", () => {
    expect(meetingCoverage([], -4).totalCompanies).toBe(0);
  });
});

describe("noMeetingNote", () => {
  it("states the gap on this record AND the scale of it, so 3-of-31 is one glance", () => {
    expect(noMeetingNote({ meetings: 4, companiesWithMeetings: 3, totalCompanies: 31 })).toBe(
      "No meeting captured on this record — 4 meetings captured across 3 of 31 companies in the CRM."
    );
  });

  it("never claims a coverage figure when the CRM holds no meeting at all", () => {
    expect(noMeetingNote({ meetings: 0, companiesWithMeetings: 0, totalCompanies: 31 })).toBe(
      "No meeting captured on this record — No meeting has been captured on any company yet."
    );
  });

  it("says nothing about what the counterparty did or did not say", () => {
    const note = noMeetingNote({ meetings: 4, companiesWithMeetings: 3, totalCompanies: 31 });
    // The whole point of punch #6: the sentence is about OUR capture, never about them.
    expect(note).not.toMatch(/nothing (was )?said|no (pain|action|talking)/i);
  });

  it("singularises one meeting and a one-company CRM", () => {
    expect(noMeetingNote({ meetings: 1, companiesWithMeetings: 1, totalCompanies: 1 })).toBe(
      "No meeting captured on this record — 1 meeting captured across 1 of 1 company in the CRM."
    );
  });
});

describe("coverageCountLabel", () => {
  it("prints the denominator, not a bare company count", () => {
    expect(coverageCountLabel({ meetings: 4, companiesWithMeetings: 3, totalCompanies: 31 })).toBe(
      "4 meetings · 3 of 31 companies"
    );
  });

  it("keeps the unattached tail the Overview already reported", () => {
    expect(coverageCountLabel({ meetings: 4, companiesWithMeetings: 3, totalCompanies: 31 }, 2)).toBe(
      "4 meetings · 3 of 31 companies · 2 unattached"
    );
  });

  it("omits the tail when nothing is unattached", () => {
    expect(coverageCountLabel({ meetings: 1, companiesWithMeetings: 1, totalCompanies: 31 }, 0)).toBe(
      "1 meeting · 1 of 31 companies"
    );
  });
});
