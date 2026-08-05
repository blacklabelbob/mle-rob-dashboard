import { describe, expect, it } from "vitest";
import {
  activityAnchorId,
  activityAnchorUrl,
  activityFeedQuery,
  activitySubjectColumn,
  type TimelineSubject,
} from "@/lib/activities/timelineSubject";

describe("activityFeedQuery", () => {
  it("asks the feed for a person by person", () => {
    expect(activityFeedQuery({ kind: "person", id: "P-1022" })).toBe("person=P-1022");
  });

  // The bug this file exists for. Verified against prod, not assumed: all 4 meeting rows
  // are filed with `org_id` set and `person_id` null, and C-2018 holds 2 of them. The
  // company page asked `?person=C-2018`, got zero rows back, and rendered "Nothing logged
  // yet" over both of that company's filed meetings.
  it("asks the feed for an org by ORG, not by person", () => {
    expect(activityFeedQuery({ kind: "org", id: "C-2018" })).toBe("org=C-2018");
  });

  it("escapes an id rather than letting it forge a second parameter", () => {
    expect(activityFeedQuery({ kind: "org", id: "C-1&person=P-9" })).toBe(
      "org=C-1%26person%3DP-9"
    );
  });
});

describe("activitySubjectColumn", () => {
  it("maps each subject kind to the column it is actually filed under", () => {
    expect(activitySubjectColumn("person")).toBe("person_id");
    expect(activitySubjectColumn("org")).toBe("org_id");
  });
});

describe("activityAnchorId", () => {
  it("passes through the real activity ids we file", () => {
    expect(activityAnchorId("A-MTG-2026-07-28-OMEGA")).toBe("A-MTG-2026-07-28-OMEGA");
    expect(activityAnchorId("n8n-email-19fce65a18364b9c")).toBe("n8n-email-19fce65a18364b9c");
  });

  it("refuses absence instead of inventing an anchor", () => {
    expect(activityAnchorId(undefined)).toBeNull();
    expect(activityAnchorId(null)).toBeNull();
    expect(activityAnchorId("")).toBeNull();
    expect(activityAnchorId("   ")).toBeNull();
  });

  // A mangled anchor is a link that lands at the top of the page while claiming to land
  // on the row — inc.16's "a link to nothing is the same class of defect as a link to a
  // lie". Refusal is the only honest answer.
  it("refuses ids that cannot safely be a fragment, rather than rewriting them", () => {
    expect(activityAnchorId("A MTG 2026")).toBeNull();
    expect(activityAnchorId("a/b")).toBeNull();
    expect(activityAnchorId("row#2")).toBeNull();
    expect(activityAnchorId("2026-07-28")).toBeNull(); // must start with a letter
  });

  it("does not accept a non-string id from an untyped row", () => {
    expect(activityAnchorId(42 as unknown as string)).toBeNull();
  });
});

describe("activityAnchorUrl — Q89 inc.18, the link inc.16 refused and inc.17 made possible", () => {
  it("builds a record-page url with the row as its fragment", () => {
    expect(activityAnchorUrl({ kind: "org", id: "C-2019" }, "A-MTG-2026-07-28-OMEGA"))
      .toBe("/companies/C-2019#A-MTG-2026-07-28-OMEGA");
    expect(activityAnchorUrl({ kind: "person", id: "P-1001" }, "n8n-email-19fce65a18364b9c"))
      .toBe("/people/P-1001#n8n-email-19fce65a18364b9c");
  });

  it("returns null when the row has no safe anchor — no link beats a link to the page top", () => {
    expect(activityAnchorUrl({ kind: "org", id: "C-2019" }, "row#2")).toBeNull();
    expect(activityAnchorUrl({ kind: "org", id: "C-2019" }, undefined)).toBeNull();
    expect(activityAnchorUrl({ kind: "org", id: "C-2019" }, "")).toBeNull();
  });

  it("refuses a subject id that is not our own id shape — it is a path segment", () => {
    // "C-2019/../deals" or a bare "" would build a url pointing at another page entirely.
    expect(activityAnchorUrl({ kind: "org", id: "C-2019/../deals" }, "A-MTG-1")).toBeNull();
    expect(activityAnchorUrl({ kind: "org", id: "  " }, "A-MTG-1")).toBeNull();
    expect(activityAnchorUrl({ kind: "org", id: 7 as unknown as string }, "A-MTG-1")).toBeNull();
  });

  it("refuses a subject kind it does not know rather than guessing a route", () => {
    expect(activityAnchorUrl({ kind: "deal" } as unknown as TimelineSubject, "A-MTG-1")).toBeNull();
  });
});
