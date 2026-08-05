import { describe, it, expect } from "vitest";
import { intelSourceFromActivities, candidatesFromActivity } from "../intelSource";
import { buildMeetingIntel } from "../meetingIntel";
import type { Activity } from "@/lib/types";

function act(over: Partial<Activity> & { id: string }): Activity {
  return {
    type: "meeting",
    source: "manual",
    sourceContext: {},
    bookProtected: false,
    occurredAt: "2026-07-28T15:00:00.000Z",
    createdAt: "2026-07-28T15:00:00.000Z",
    ...over,
  } as Activity;
}

describe("intelSource — the seam between a stored meeting and the gate", () => {
  it("ignores non-meeting activities entirely", () => {
    const got = intelSourceFromActivities([
      act({ id: "A-1", type: "email", sourceContext: { intel: [{ kind: "action-items", text: "x", sourceRef: "l1" }] } }),
      act({ id: "A-2", type: "note", sourceContext: { intel: [{ kind: "talking-points", text: "y", sourceRef: "l2" }] } }),
    ]);
    expect(got.meetingCount).toBe(0);
    expect(got.candidates).toHaveLength(0);
  });

  it("a meeting with no intel yields no candidates but still counts as a meeting", () => {
    // The distinction the whole surface rests on: "we had a call and captured nothing"
    // must not look like "we never spoke".
    const got = intelSourceFromActivities([act({ id: "A-1" })]);
    expect(got.meetingCount).toBe(1);
    expect(got.candidates).toHaveLength(0);
  });

  it("maps a well-formed entry, using the activity id as the meeting id", () => {
    const got = candidatesFromActivity(
      act({
        id: "ACT-omega-0728",
        sourceContext: {
          intel: [
            {
              kind: "pain-points",
              text: "we lose two days every closing chasing wet signatures",
              sourceRef: "line 412",
              excerpt: "honestly we lose two days every closing chasing wet signatures",
              url: "https://example.com/t#412",
              rank: 2,
            },
          ],
        },
      }),
    );
    expect(got.candidates[0]).toMatchObject({
      kind: "pain-points",
      provenance: { meetingId: "ACT-omega-0728", sourceRef: "line 412", url: "https://example.com/t#412" },
      rank: 2,
    });
  });

  it("NEVER fabricates a deep link from the meeting's own recording URL", () => {
    // A link that opens the meeting is not a link that opens the LINE.
    const got = candidatesFromActivity(
      act({
        id: "A-1",
        recordingUrl: "https://fireflies.ai/view/abc",
        transcriptUrl: "https://fireflies.ai/transcript/abc",
        sourceContext: { intel: [{ kind: "talking-points", text: "ask about the LOI", sourceRef: "block 3" }] },
      }),
    );
    expect(got.candidates[0].provenance?.url).toBeUndefined();
  });

  describe("Q89 inc.18 — the row's own in-CRM address", () => {
    const intel = { kind: "talking-points", text: "ask about the LOI", sourceRef: "block 3" };

    it("stamps the company page + row anchor when the meeting is filed on an org", () => {
      const got = candidatesFromActivity(
        act({ id: "A-MTG-2026-07-28-OMEGA", orgId: "C-2019", sourceContext: { intel: [intel] } }),
      );
      expect(got.candidates[0].provenance?.url).toBe("/companies/C-2019#A-MTG-2026-07-28-OMEGA");
    });

    it("stamps the person page when the meeting is filed on a person", () => {
      const got = candidatesFromActivity(
        act({ id: "A-MTG-1", personId: "P-1001", sourceContext: { intel: [intel] } }),
      );
      expect(got.candidates[0].provenance?.url).toBe("/people/P-1001#A-MTG-1");
    });

    it("prefers the org page when a row is filed on both — it renders there too", () => {
      const got = candidatesFromActivity(
        act({ id: "A-MTG-1", orgId: "C-2019", personId: "P-1001", sourceContext: { intel: [intel] } }),
      );
      expect(got.candidates[0].provenance?.url).toBe("/companies/C-2019#A-MTG-1");
    });

    it("the entry's OWN url still wins — external evidence beats an in-page jump", () => {
      const got = candidatesFromActivity(
        act({
          id: "A-MTG-1",
          orgId: "C-2019",
          sourceContext: { intel: [{ ...intel, url: "https://example.com/t#412" }] },
        }),
      );
      expect(got.candidates[0].provenance?.url).toBe("https://example.com/t#412");
    });

    it("still refuses the recording URL even when an anchor is available", () => {
      // The anchor may be stamped; the recording may never be. Both at once is the case
      // that would have quietly let the old fallback back in.
      const got = candidatesFromActivity(
        act({
          id: "A-MTG-1",
          orgId: "C-2019",
          recordingUrl: "https://fireflies.ai/view/abc",
          sourceContext: { intel: [intel] },
        }),
      );
      expect(got.candidates[0].provenance?.url).toBe("/companies/C-2019#A-MTG-1");
    });

    it("stamps NOTHING when the row's id cannot safely be a fragment", () => {
      // A mangled anchor lands the reader at the top of the page — a link to nothing.
      const got = candidatesFromActivity(
        act({ id: "row #2", orgId: "C-2019", sourceContext: { intel: [intel] } }),
      );
      expect(got.candidates[0].provenance?.url).toBeUndefined();
    });

    it("stamps NOTHING when the row is filed against no record at all", () => {
      const got = candidatesFromActivity(act({ id: "A-MTG-1", sourceContext: { intel: [intel] } }));
      expect(got.candidates[0].provenance?.url).toBeUndefined();
    });
  });

  it("passes a malformed entry THROUGH so the gate rejects it visibly", () => {
    // Filtering here would make a bad entry look like a meeting where nothing was said.
    const got = intelSourceFromActivities([
      act({
        id: "A-1",
        sourceContext: {
          intel: [
            { kind: "action-items", text: "send the LOI" }, // no sourceRef
            { kind: "pain-points", text: "opportunity to streamline their workflow", sourceRef: "l9", excerpt: "we hate the paperwork" },
          ],
        },
      }),
    ]);
    expect(got.candidates).toHaveLength(2);

    const intel = buildMeetingIntel(got.candidates);
    const reasons = intel.rejected.map((r) => r.reason).sort();
    expect(reasons).toEqual(["no-source-ref", "paraphrased-pain"]);
    expect(intel.isEmpty).toBe(true);
  });

  it("an unrecognised kind is reported as unusable, never silently dropped", () => {
    const got = intelSourceFromActivities([
      act({ id: "A-1", sourceContext: { intel: [{ kind: "vibes", text: "felt good", sourceRef: "l1" }, "not-an-object"] } }),
    ]);
    expect(got.candidates).toHaveLength(0);
    expect(got.unusable).toHaveLength(2);
    expect(got.unusable[0]).toMatchObject({ activityId: "A-1" });
    expect(got.unusable[0].reason).toContain("vibes");
  });

  it("empty strings are absence, not values", () => {
    const got = candidatesFromActivity(
      act({ id: "A-1", sourceContext: { intel: [{ kind: "action-items", text: "  ", sourceRef: "", owner: "" }] } }),
    );
    expect(got.candidates[0].text).toBe("");
    expect(got.candidates[0].provenance?.sourceRef).toBeUndefined();
    expect(got.candidates[0].owner).toBeUndefined();
    expect(buildMeetingIntel(got.candidates).rejected[0].reason).toBe("empty-text");
  });

  it("orders meetings oldest-first, and a row with no date sorts last rather than vanishing", () => {
    const got = intelSourceFromActivities([
      act({ id: "A-late", occurredAt: "2026-07-28T00:00:00.000Z", sourceContext: { intel: [{ kind: "action-items", text: "second", sourceRef: "l1" }] } }),
      act({ id: "A-none", occurredAt: "", sourceContext: { intel: [{ kind: "action-items", text: "undated", sourceRef: "l1" }] } }),
      act({ id: "A-early", occurredAt: "2026-07-01T00:00:00.000Z", sourceContext: { intel: [{ kind: "action-items", text: "first", sourceRef: "l1" }] } }),
    ]);
    expect(got.meetingCount).toBe(3);
    expect(got.candidates.map((c) => c.text)).toEqual(["first", "second", "undated"]);
  });

  it("a non-array intel field is not a crash and not a candidate", () => {
    expect(candidatesFromActivity(act({ id: "A-1", sourceContext: { intel: "action items: send LOI" } })).candidates).toHaveLength(0);
  });
});
