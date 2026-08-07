/**
 * Q85 inc.6 — the counterparty resolver.
 *
 * The fixtures are the names live prod actually carries in the archive's attendee columns
 * (inc.5's measurement: `Alex Greenwood`, `Chris Acheson`, `Dixith Magadiev`, and the
 * single-token `Alex` / `Shasta` / `Dani`), because the question this module answers is which
 * of THOSE may be written on. The near misses that must FAIL are pinned first-class: this
 * module's value is what it refuses.
 */

import { describe, expect, it } from "vitest";
import { readArchiveAttendees } from "../archiveAttendees";
import { resolveAttendee, resolveRowAttendees } from "../attendeePerson";
import type { CrmPerson } from "../activityPlan";

const PEOPLE: CrmPerson[] = [
  { id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" },
  { id: "P-1021", name: "Alex Greenwood", orgId: "C-2018" },
  { id: "P-1022", name: "Chris Acheson", orgId: "C-2018" },
];

const attendee = (name: string, identifying = true) =>
  ({ name, side: "counterparty", source: "Non MLE Attendees", identifying }) as const;

describe("resolveAttendee", () => {
  it("matches a real prod name exactly after normalization", () => {
    const r = resolveAttendee(attendee("alex   GREENWOOD"), PEOPLE);
    expect(r.outcome).toBe("matched");
    expect(r.person?.id).toBe("P-1021");
  });

  it("refuses a one-character near miss — a surname is not a typo", () => {
    // Greene/Green and Chan/Chen are ordinary different people. Edit distance cannot tell.
    expect(resolveAttendee(attendee("Alex Greenwoods"), PEOPLE).outcome).toBe("unknown");
    expect(resolveAttendee(attendee("Chris Achesen"), PEOPLE).outcome).toBe("unknown");
  });

  it("refuses a first name even when the CRM holds exactly one such person", () => {
    // The repo HAS a first-name index (activityPlan.byPersonName) — for reports, never writes.
    const r = resolveAttendee(attendee("Alex", false), PEOPLE);
    expect(r.outcome).toBe("not-identifying");
    expect(r.candidates).toEqual([]);
    expect(r.nextStep).toMatch(/surname/i);
  });

  it("reports unknown with a proposal, never the nearest human", () => {
    const r = resolveAttendee(attendee("Priya Raghunathan"), PEOPLE);
    expect(r.outcome).toBe("unknown");
    expect(r.person).toBeUndefined();
    expect(r.nextStep).toMatch(/Propose the person/);
  });

  it("stays ambiguous when two people share a name and no org narrows it", () => {
    const twins: CrmPerson[] = [
      { id: "P-1", name: "Alex Greenwood", orgId: "C-2018" },
      { id: "P-2", name: "Alex Greenwood", orgId: "C-2005" },
    ];
    const r = resolveAttendee(attendee("Alex Greenwood"), twins);
    expect(r.outcome).toBe("ambiguous");
    expect(r.candidates.map((p) => p.id)).toEqual(["P-1", "P-2"]);
    expect(r.nextStep).toContain("P-1, P-2");
  });

  it("lets the meeting's own org narrow two candidates to one — and records that it did", () => {
    const twins: CrmPerson[] = [
      { id: "P-1", name: "Alex Greenwood", orgId: "C-2018" },
      { id: "P-2", name: "Alex Greenwood", orgId: "C-2005" },
    ];
    const r = resolveAttendee(attendee("Alex Greenwood"), twins, "C-2018");
    expect(r.outcome).toBe("matched");
    expect(r.person?.id).toBe("P-1");
    expect(r.disambiguatedBy).toBe("org");
  });

  it("stays ambiguous when both same-name candidates are at that same org", () => {
    const twins: CrmPerson[] = [
      { id: "P-1", name: "Alex Greenwood", orgId: "C-2018" },
      { id: "P-2", name: "Alex Greenwood", orgId: "C-2018" },
    ];
    expect(resolveAttendee(attendee("Alex Greenwood"), twins, "C-2018").outcome).toBe("ambiguous");
  });

  it("never lets the org ADD a candidate the name did not produce", () => {
    // Nobody named "Jordan Vance" is in the CRM; C-2018 having people is not a reason to pick one.
    const r = resolveAttendee(attendee("Jordan Vance"), PEOPLE, "C-2018");
    expect(r.outcome).toBe("unknown");
    expect(r.candidates).toEqual([]);
  });
});

describe("resolveRowAttendees", () => {
  it("resolves a real prod row and never resolves our own people", () => {
    // Prod: "Gulf Coast RE KICKOFF 2026-07-22"
    const attendees = readArchiveAttendees({
      nonMleAttendees: "Alex Greenwood, Chris Acheson, Shasta",
      mleAttendees: ["Rob Acheson", "Will DeVito"],
    });

    const resolved = resolveRowAttendees(attendees, PEOPLE, "C-2018");

    expect(resolved.attachablePersonIds).toEqual(["P-1021", "P-1022"]);
    expect(resolved.counts).toEqual({
      matched: 2,
      ambiguous: 0,
      unknown: 0,
      notIdentifying: 1,
      total: 3,
    });
    // Rob and Will are on both sides of every meeting — they must never be attachable.
    expect(resolved.resolutions.some((r) => /Rob Acheson|Will DeVito/.test(r.attendee.name))).toBe(false);
  });

  it("returns an empty attach list rather than a guess when the row names nobody resolvable", () => {
    // Prod carries rows whose only counterparty is a truncated first name.
    const resolved = resolveRowAttendees(readArchiveAttendees({ contactName: "Dani" }), PEOPLE);
    expect(resolved.attachablePersonIds).toEqual([]);
    expect(resolved.counts.notIdentifying).toBe(1);
  });
});
