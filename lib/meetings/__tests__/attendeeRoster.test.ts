import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  rosterFromActivity,
  rosterLinkCounts,
  rostersFromActivities,
} from "../attendeeRoster";
import type { Activity } from "@/lib/types";
import type { CrmPerson } from "../activityPlan";

/**
 * The Gulf Coast kickoff as it is actually stored — read from the SHIPPED payload rather than
 * hand-typed here. Q85 inc.26 put `Shasta` into `attendeesOther` at source; a hand-written
 * fixture would let that row change under the test without the test noticing, which is the
 * exact shape of the `activities.transcript_url` defect (a test true of a copy, false of the
 * thing). If the payload stops carrying three counterparties, this file goes red.
 */
const PAYLOAD = JSON.parse(
  readFileSync(join(process.cwd(), "data/meetings/2026-07-22-gulfcoast.activity.json"), "utf8"),
) as { activity: Activity };

const GULF_COAST = PAYLOAD.activity;

const PEOPLE: CrmPerson[] = [
  { id: "P-0101", name: "Alex Greenwood", orgId: "C-2018" },
  { id: "P-0102", name: "Chris Acheson", orgId: "C-2018" },
  { id: "P-0900", name: "Daniella Roach", orgId: "C-2003" },
];

describe("rosterFromActivity — the shipped Gulf Coast row", () => {
  // The guard that makes every assertion below mean something: if the stored row ever stops
  // naming three counterparties, the rest of this describe is green about nothing.
  it("the payload under test really does store both sides", () => {
    const sc = GULF_COAST.sourceContext as Record<string, unknown>;
    expect(sc.attendeesMle).toEqual(["Rob Acheson", "Will DeVito"]);
    expect(sc.attendeesOther).toEqual(["Alex Greenwood", "Chris Acheson", "Shasta"]);
  });

  it("puts us on our side and them on theirs, off the source columns", () => {
    const roster = rosterFromActivity(GULF_COAST, PEOPLE);
    expect(roster.ours.map((e) => e.name)).toEqual(["Rob Acheson", "Will DeVito"]);
    expect(roster.theirs.map((e) => e.name)).toEqual(["Alex Greenwood", "Chris Acheson", "Shasta"]);
    expect(roster.ours.every((e) => e.source === "MLE Attendees")).toBe(true);
    expect(roster.gap).toBeUndefined();
  });

  it("links the two the CRM can prove and says why the third is not linked", () => {
    const roster = rosterFromActivity(GULF_COAST, PEOPLE);
    const byName = Object.fromEntries(roster.theirs.map((e) => [e.name, e]));
    expect(byName["Alex Greenwood"].personId).toBe("P-0101");
    expect(byName["Chris Acheson"].personId).toBe("P-0102");
    // Shasta is stored faithfully and shown — and carries OUR reason, not a verdict on her.
    expect(byName["Shasta"].personId).toBeUndefined();
    expect(byName["Shasta"].reason).toBe("not-identifying");
    expect(byName["Shasta"].detail).toContain("too thin");
  });

  it("never links an internal attendee to a CRM person", () => {
    const rob: CrmPerson = { id: "P-0001", name: "Rob Acheson", orgId: "C-2018" };
    const roster = rosterFromActivity(GULF_COAST, [...PEOPLE, rob]);
    expect(roster.ours.every((e) => e.personId === undefined)).toBe(true);
  });

  it("counts links off the roster rather than estimating them", () => {
    const counts = rosterLinkCounts([rosterFromActivity(GULF_COAST, PEOPLE)]);
    expect(counts).toEqual({ linked: 2, unlinked: 1 });
  });
});

function meeting(over: Partial<Activity>): Activity {
  return {
    id: "A-1",
    type: "meeting",
    source: "manual",
    sourceContext: {},
    bookProtected: false,
    occurredAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  } as Activity;
}

describe("rosterFromActivity — the refusals", () => {
  it("names a person at another company without linking them", () => {
    const roster = rosterFromActivity(
      meeting({ orgId: "C-2005", sourceContext: { attendeesOther: ["Daniella Roach"] } }),
      PEOPLE,
    );
    expect(roster.theirs[0].personId).toBeUndefined();
    expect(roster.theirs[0].reason).toBe("cross-org");
  });

  it("says a name is missing from the CRM, not that the person is unknown", () => {
    const roster = rosterFromActivity(
      meeting({ orgId: "C-2018", sourceContext: { attendeesOther: ["Marcus Feld"] } }),
      PEOPLE,
    );
    expect(roster.theirs[0].reason).toBe("unknown");
    expect(roster.theirs[0].detail).toContain("no CRM record");
  });

  it("refuses to pick when two records answer to one name", () => {
    const twins: CrmPerson[] = [
      { id: "P-1", name: "Sam Reed", orgId: "C-2018" },
      { id: "P-2", name: "Sam Reed", orgId: "C-2018" },
    ];
    const roster = rosterFromActivity(
      meeting({ orgId: "C-2018", sourceContext: { attendeesOther: ["Sam Reed"] } }),
      twins,
    );
    expect(roster.theirs[0].personId).toBeUndefined();
    expect(roster.theirs[0].reason).toBe("ambiguous");
  });

  it("states an empty roster as OUR gap and keeps the row", () => {
    const roster = rosterFromActivity(meeting({ orgId: "C-2018" }), PEOPLE);
    expect(roster.ours).toEqual([]);
    expect(roster.theirs).toEqual([]);
    expect(roster.gap).toContain("gap in our record");
  });
});

describe("rostersFromActivities", () => {
  it("drops non-meetings, keeps empty rosters, and orders newest first", () => {
    const rows: Activity[] = [
      meeting({ id: "A-old", occurredAt: "2026-06-01T00:00:00.000Z" }),
      meeting({ id: "A-new", occurredAt: "2026-07-30T00:00:00.000Z" }),
      meeting({ id: "A-email", type: "email" }),
    ];
    const rosters = rostersFromActivities(rows, PEOPLE);
    expect(rosters.map((r) => r.activityId)).toEqual(["A-new", "A-old"]);
  });
});
