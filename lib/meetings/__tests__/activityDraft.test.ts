import { describe, expect, it } from "vitest";
import { draftActivityFromPlan, draftActivityId, recorderSawMeeting } from "@/lib/meetings/activityDraft";
import { planMeetingActivities, type CrmOrg, type CrmPerson } from "@/lib/meetings/activityPlan";
import { readArchiveAttendees } from "@/lib/meetings/archiveAttendees";
import { resolveRowAttendees } from "@/lib/meetings/attendeePerson";
import type { ArchiveRowDetail } from "@/lib/meetings/unexplainedRows";

const ORGS: CrmOrg[] = [
  { id: "C-0001", name: "PropLogix, LLC." },
  { id: "C-0002", name: "Gulf Coast RE Group", domain: "gulfcoastregroup.com" },
];

const row = (over: Partial<ArchiveRowDetail> = {}): ArchiveRowDetail => ({
  id: "3ad1de57-0199-80dd-b213-d09c387217e7",
  title: "Kickoff",
  day: "2026-07-22",
  ...over,
});

/** One plan row, built through the real planner so the draft is never tested against a hand-made shape. */
const plan1 = (r: ArchiveRowDetail) => planMeetingActivities([r], ORGS).rows[0];

describe("draftActivityFromPlan", () => {
  it("drafts the publish payload for an attachable row", () => {
    const result = draftActivityFromPlan(plan1(row({ company: "proplogix llc" })), "driver:test");
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft).toMatchObject({
      orgId: "C-0001",
      type: "meeting",
      source: "notion-archive",
      createdBy: "driver:test",
      occurredAt: "2026-07-22T12:00:00.000Z",
      bookProtected: false,
    });
    expect(result.draft.sourceContext).toMatchObject({
      system: "notion",
      database: "Master Meetings Database",
      pageId: "3ad1de57-0199-80dd-b213-d09c387217e7",
      dayFrom: "call-date",
      matchedBy: "name",
    });
  });

  it("dates at midday UTC so the day never renders as the day before in a US timezone", () => {
    const result = draftActivityFromPlan(plan1(row({ company: "proplogix llc" })), "driver:test");
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    // The failure this pins: `T00:00:00.000Z` is 2026-07-21 in every US zone.
    const inNaples = new Date(result.draft.occurredAt).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    expect(inNaples).toBe("2026-07-22");
  });

  it("is idempotent — the same row drafts the same id twice", () => {
    const r = row({ company: "proplogix llc" });
    const a = draftActivityFromPlan(plan1(r), "driver:one");
    const b = draftActivityFromPlan(plan1(r), "driver:two");
    expect(a.drafted && b.drafted && a.draft.id === b.draft.id).toBe(true);
    expect(a.drafted && a.draft.id).toBe(draftActivityId(r.id, "2026-07-22"));
  });

  it("gives two different Notion pages on the same day two different ids", () => {
    expect(draftActivityId("3ad1de57-0199-80dd-b213-d09c387217e7", "2026-08-04")).not.toBe(
      draftActivityId("3b21de57-0199-8006-959b-d4a9c66718ef", "2026-08-04"),
    );
  });

  it("refuses every disposition that needs a human first", () => {
    for (const r of [
      row({ company: "" }), // no-company
      row({ company: "Nobody Ltd" }), // unknown-company
      row({ company: "proplogix llc", day: "", title: "Kickoff" }), // no-date
    ]) {
      const result = draftActivityFromPlan(plan1(r), "driver:test");
      expect(result.drafted).toBe(false);
      if (result.drafted) continue;
      expect(result.refusal.kind).toBe("not-attachable");
    }
  });

  it("carries the recording url as context but never as the identity key", () => {
    const withRec = row({ company: "proplogix llc", recording: "https://app.fireflies.ai/view/ABC" });
    const withoutRec = row({ company: "proplogix llc" });
    const a = draftActivityFromPlan(plan1(withRec), "driver:test");
    const b = draftActivityFromPlan(plan1(withoutRec), "driver:test");
    expect(a.drafted && a.draft.sourceContext.recording).toBe("https://app.fireflies.ai/view/ABC");
    expect(b.drafted && b.draft.sourceContext.recording).toBeUndefined();
    // Same page, same day — the Fireflies link changing does not mint a second activity.
    expect(a.drafted && b.drafted && a.draft.id === b.draft.id).toBe(true);
  });

  it("keeps a real summary", () => {
    const result = draftActivityFromPlan(
      plan1(row({ company: "proplogix llc", summary: "Phase 1 scope agreed; Trent sends the LOI Friday." })),
      "driver:test",
    );
    expect(result.drafted && result.draft.summary).toBe(
      "Phase 1 scope agreed; Trent sends the LOI Friday.",
    );
    expect(result.drafted && result.droppedSummary).toBeUndefined();
  });

  it("drops Notion's empty-recording template instead of writing it onto a company record", () => {
    // The live shape from Q84 inc.45 — 1,300 chars of canned apology and no meeting on the page.
    const boilerplate =
      "Hey there! 👋 It looks like you've just created a very short (or empty) recording. " +
      "I don't see any transcript or notes to summarize yet. Here's what I can do with longer recordings: " +
      "Meeting summaries. Action items. Try recording again and I'll be here. " +
      "Looking forward to helping you capture your next conversation!";
    const result = draftActivityFromPlan(
      plan1(row({ company: "proplogix llc", summary: boilerplate })),
      "driver:test",
    );
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.summary).toBeUndefined();
    expect(result.droppedSummary).toMatch(/empty-recording template/);
    // The row is still drafted — the meeting is not disproved by its summary being a template.
    expect(result.draft.orgId).toBe("C-0001");
  });

  it("marks a title-derived day as such rather than laundering it into a human's Call Date", () => {
    const result = draftActivityFromPlan(
      plan1(row({ company: "proplogix llc", day: "", title: "Meeting 2026-07-30" })),
      "driver:test",
    );
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.occurredAt).toBe("2026-07-30T12:00:00.000Z");
    expect(result.draft.sourceContext.dayFrom).toBe("title");
  });
});

// Q85 inc.2 — the scope gate. The writer's first live run against prod found that the ONE
// archive row clearing the company check is one no recorder ever saw, so this predicate is the
// difference between "wrote nothing, correctly" and "welded an unwitnessed meeting onto C-2005".
describe("recorderSawMeeting — Q85's scope line as code", () => {
  it("is true only when the row carries a recording", () => {
    expect(recorderSawMeeting({ recording: "https://fireflies.ai/view/abc" })).toBe(true);
  });

  it("is false for the shapes prod actually produces — absent, empty, and whitespace", () => {
    expect(recorderSawMeeting({})).toBe(false);
    expect(recorderSawMeeting({ recording: "" })).toBe(false);
    expect(recorderSawMeeting({ recording: "   " })).toBe(false);
  });

  it("excludes the real 2026-07-30 Martin Fierro row that the writer would otherwise have written", () => {
    // Verbatim from prod via `check:archive --json`: attachable, matched by name to C-2005,
    // day read off its own placeholder title, and nothing witnessed it.
    const live = row({ title: "Meeting 2026-07-30", day: "", company: "Martin Fierro Restaurant ", recording: "" });
    const planned = planMeetingActivities([live], [{ id: "C-2005", name: "Martin Fierro Restaurant" }]).rows[0];
    expect(planned.disposition).toBe("attachable");
    // The plan is right that it COULD attach. The scope gate is what says this pass must not.
    expect(recorderSawMeeting(planned.row)).toBe(false);
  });
});

/**
 * Q85 inc.7 — the person half of the draft. Every case below is built through the REAL resolver
 * (`resolveRowAttendees`) and the real reader (`readArchiveAttendees`), so nothing here can pass
 * against a hand-made resolution shape the pipeline never produces.
 */
describe("draftActivityFromPlan — the person on the row (inc.7)", () => {
  const PEOPLE: CrmPerson[] = [
    { id: "P-1022", name: "Alex Greenwood", orgId: "C-0002" },
    { id: "P-1018", name: "Caleb Green", orgId: "C-0006" },
  ];
  const attachable = () => plan1(row({ company: "Gulf Coast RE Group", recording: "https://fireflies.ai/view/x" }));
  const resolveFor = (fields: Parameters<typeof readArchiveAttendees>[0], orgId = "C-0002") =>
    resolveRowAttendees(readArchiveAttendees(fields), PEOPLE, orgId);

  it("attaches the one counterparty the CRM resolved, and says so in sourceContext", () => {
    const result = draftActivityFromPlan(
      attachable(),
      "driver:test",
      resolveFor({ nonMleAttendees: "Alex Greenwood", mleAttendees: ["Rob Acheson"] })
    );
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.personId).toBe("P-1022");
    expect(result.draft.sourceContext.attendees).toMatchObject({ counterparties: 1, matched: 1, matchedIds: ["P-1022"] });
    expect(result.personRefusal).toBeUndefined();
  });

  it("never attaches an internal attendee — Rob is on both sides of every meeting", () => {
    const result = draftActivityFromPlan(attachable(), "driver:test", resolveFor({ mleAttendees: ["Rob Acheson"] }));
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.personId).toBeUndefined();
    expect(result.draft.sourceContext.attendees).toMatchObject({ counterparties: 0 });
    expect(result.personRefusal).toContain("names nobody on the other side");
  });

  it("refuses to pick when TWO counterparties resolved — person_id is one column, a meeting is not", () => {
    const result = draftActivityFromPlan(
      attachable(),
      "driver:test",
      resolveFor({ nonMleAttendees: "Alex Greenwood, Caleb Green" })
    );
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.personId).toBeUndefined();
    // Both are still ON the row — refusing to pick is not refusing to record.
    expect(result.draft.sourceContext.attendees?.matchedIds).toEqual(["P-1022", "P-1018"]);
    expect(result.personRefusal).toContain("none is picked");
  });

  it("attaches nobody for a person the CRM has never met — the live Joseph Green / Caleb Green trap", () => {
    const result = draftActivityFromPlan(attachable(), "driver:test", resolveFor({ nonMleAttendees: "Joseph Green" }));
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.personId).toBeUndefined();
    expect(result.draft.sourceContext.attendees).toMatchObject({ unknown: 1, matched: 0 });
    expect(result.personRefusal).toContain("never met");
  });

  it("attaches nobody for a first name alone, and says which fix makes it work", () => {
    const result = draftActivityFromPlan(attachable(), "driver:test", resolveFor({ contactName: "Alex" }));
    expect(result.drafted).toBe(true);
    if (!result.drafted) return;
    expect(result.draft.personId).toBeUndefined();
    expect(result.personRefusal).toContain("first name only");
  });

  it("a caller that passes no attendees drafts exactly the pre-inc.7 row — no person, no context, no refusal", () => {
    const before = draftActivityFromPlan(attachable(), "driver:test");
    expect(before.drafted).toBe(true);
    if (!before.drafted) return;
    expect(before.draft.personId).toBeUndefined();
    expect(before.draft.sourceContext.attendees).toBeUndefined();
    expect(before.personRefusal).toBeUndefined();
  });

  it("attaching a person never changes the row's identity — the id is the page, not the human", () => {
    const withPerson = draftActivityFromPlan(attachable(), "driver:test", resolveFor({ nonMleAttendees: "Alex Greenwood" }));
    const without = draftActivityFromPlan(attachable(), "driver:test");
    expect(withPerson.drafted && without.drafted && withPerson.draft.id === without.draft.id).toBe(true);
  });
});
