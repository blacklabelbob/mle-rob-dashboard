import { describe, expect, it } from "vitest";
import { networkIntelFromActivities } from "../networkIntel";
import { buildMeetingIntel, sourceLabel } from "../meetingIntel";
import type { Activity } from "@/lib/types";

function meeting(over: Partial<Activity> & { id: string }): Activity {
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

const painEntry = {
  kind: "pain-points",
  text: "we lose two days every closing chasing payoffs",
  sourceRef: "line 44",
  excerpt: "Scott: we lose two days every closing chasing payoffs, every single time.",
};

describe("networkIntelFromActivities", () => {
  it("stamps the company onto provenance, never onto the claim", () => {
    const out = networkIntelFromActivities(
      [meeting({ id: "A-77", orgId: "C-2019", sourceContext: { intel: [painEntry] } })],
      { "C-2019": "Omega Title" }
    );
    expect(out.candidates).toHaveLength(1);
    // The address carries the company; the sentence stays exactly as it was said.
    expect(out.candidates[0].provenance?.context).toBe("Omega Title");
    expect(out.candidates[0].text).toBe(painEntry.text);
    expect(sourceLabel({ meetingId: "A-77", sourceRef: "line 44", context: "Omega Title" })).toBe(
      "Omega Title · A-77 · line 44"
    );
  });

  it("falls back to the raw id rather than inventing a name", () => {
    const out = networkIntelFromActivities(
      [meeting({ id: "A-77", orgId: "C-9999", sourceContext: { intel: [painEntry] } })],
      {}
    );
    expect(out.candidates[0].provenance?.context).toBe("C-9999");
  });

  it("never attaches an unattributed meeting to a nearby company", () => {
    const out = networkIntelFromActivities(
      [
        meeting({ id: "A-1", orgId: "C-2019", sourceContext: { intel: [painEntry] } }),
        meeting({ id: "A-2", sourceContext: { intel: [painEntry] } }),
      ],
      { "C-2019": "Omega Title" }
    );
    expect(out.unattributedMeetings).toBe(1);
    expect(out.companyCount).toBe(1);
    // Both survive — silence about a call that happened is the worse failure — but the
    // orphan carries no company at all.
    expect(out.candidates.map((c) => c.provenance?.context)).toEqual(["Omega Title", undefined]);
  });

  it("counts meetings and companies, ignoring non-meeting rows", () => {
    const out = networkIntelFromActivities(
      [
        meeting({ id: "A-1", orgId: "C-1", occurredAt: "2026-07-01T00:00:00.000Z" }),
        meeting({ id: "A-2", orgId: "C-2", occurredAt: "2026-07-02T00:00:00.000Z" }),
        meeting({ id: "A-3", orgId: "C-1", occurredAt: "2026-07-03T00:00:00.000Z" }),
        { ...meeting({ id: "A-4", orgId: "C-3" }), type: "email" } as Activity,
      ],
      {}
    );
    expect(out.meetingCount).toBe(3);
    expect(out.companyCount).toBe(2);
  });

  it("keeps meetings oldest-first so source order means the same thing as on a record", () => {
    const out = networkIntelFromActivities(
      [
        meeting({
          id: "A-late",
          orgId: "C-1",
          occurredAt: "2026-08-01T00:00:00.000Z",
          sourceContext: { intel: [{ ...painEntry, kind: "action-items", text: "send the LOI" }] },
        }),
        meeting({
          id: "A-early",
          orgId: "C-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
          sourceContext: { intel: [{ ...painEntry, kind: "action-items", text: "book the follow-up" }] },
        }),
      ],
      {}
    );
    expect(out.candidates.map((c) => c.provenance?.meetingId)).toEqual(["A-early", "A-late"]);
  });

  it("reports an unusable entry instead of dropping it", () => {
    const out = networkIntelFromActivities(
      [meeting({ id: "A-77", orgId: "C-1", sourceContext: { intel: [{ kind: "vibes", text: "good call" }] } })],
      {}
    );
    expect(out.candidates).toHaveLength(0);
    expect(out.unusable).toHaveLength(1);
    expect(out.unusable[0].activityId).toBe("A-77");
  });

  it("adds no ranking of its own — the gate still says source order", () => {
    const out = networkIntelFromActivities(
      [
        meeting({ id: "A-1", orgId: "C-1", sourceContext: { intel: [painEntry] } }),
        meeting({
          id: "A-2",
          orgId: "C-2",
          occurredAt: "2026-07-29T00:00:00.000Z",
          sourceContext: { intel: [{ ...painEntry, text: "renewals slip because nobody owns them", excerpt: "Ann: renewals slip because nobody owns them." }] },
        }),
      ],
      { "C-1": "Omega Title", "C-2": "Monarch National" }
    );
    const intel = buildMeetingIntel(out.candidates);
    const pains = intel.blocks.find((b) => b.kind === "pain-points")!;
    expect(pains.items).toHaveLength(2);
    expect(pains.ordering).toBe("source-order");
  });

  // The boundary the 265 green tests could not see: `networkIntel` stamped `context`
  // and `sourceLabel` printed it, and each was asserted alone — but `buildMeetingIntel`
  // sat between them rebuilding provenance without it, so no label on any screen ever
  // named a company. Asserted end to end, and on the NAME rather than on any truthy
  // string, because falling back to the raw id is exactly the failure to catch.
  it("carries the company name all the way to the rendered label", () => {
    const out = networkIntelFromActivities(
      [meeting({ id: "A-77", orgId: "C-2018", sourceContext: { intel: [painEntry] } })],
      { "C-2018": "Gulf Coast RE Group" }
    );
    const pains = buildMeetingIntel(out.candidates).blocks.find((b) => b.kind === "pain-points")!;
    expect(pains.items).toHaveLength(1);
    expect(sourceLabel(pains.items[0].provenance)).toBe("Gulf Coast RE Group · A-77 · line 44");
  });

  it("prints the raw id, not a blank, when the network cannot name the company", () => {
    const out = networkIntelFromActivities(
      [meeting({ id: "A-77", orgId: "C-9999", sourceContext: { intel: [painEntry] } })],
      {}
    );
    const pains = buildMeetingIntel(out.candidates).blocks.find((b) => b.kind === "pain-points")!;
    expect(sourceLabel(pains.items[0].provenance)).toBe("C-9999 · A-77 · line 44");
  });

  it("an empty CRM reports zero rather than an empty finding", () => {
    const out = networkIntelFromActivities([], {});
    expect(out).toMatchObject({ meetingCount: 0, companyCount: 0, unattributedMeetings: 0 });
    expect(buildMeetingIntel(out.candidates).isEmpty).toBe(true);
  });
});
