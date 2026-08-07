/**
 * Q85 inc.8 — whether an unknown attendee is a missing person or a display handle.
 *
 * Every fixture is a name live prod actually carries. The three `unknown` rows inc.7 measured
 * are the whole subject: `Joseph Green` and `Ryan Groth` are real proposals, and `Dix thedev08`
 * is Dixith Magadiev's [P-1010] Notion handle — a proposal that would have created a duplicate
 * of a person the CRM has held since intake. The resolutions are built through the REAL
 * resolver, not hand-authored, so a change to `attendeePerson` that reclassified these names
 * would fail here rather than pass a stale fixture.
 */

import { describe, expect, it } from "vitest";
import { resolveAttendee } from "../attendeePerson";
import { decidePersonProposal, personProposalText } from "../personProposal";
import type { CrmPerson } from "../activityPlan";

const PEOPLE: CrmPerson[] = [
  { id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" },
  { id: "P-1018", name: "Caleb Green", orgId: "C-2013" },
  { id: "P-1021", name: "Alex Greenwood", orgId: "C-2018" },
  { id: "P-1022", name: "Chris Acheson", orgId: "C-2018" },
];

const attendee = (name: string, identifying = true) =>
  ({ name, side: "counterparty", source: "Non MLE Attendees", identifying }) as const;

const decide = (name: string, people: CrmPerson[] = PEOPLE) =>
  decidePersonProposal(resolveAttendee(attendee(name), people), people);

describe("decidePersonProposal", () => {
  it("WITHHOLDS the prod handle that would have duplicated P-1010", () => {
    const d = decide("Dix thedev08");
    expect(d?.kind).toBe("withhold");
    if (d?.kind !== "withhold") return;
    expect(d.reason.rung).toBe("display-handle");
    expect(d.reason.handleToken).toBe("thedev08");
    expect(d.reason.people.map((p) => p.id)).toEqual(["P-1010"]);
    expect(personProposalText(d)).toContain("Do NOT create a person");
  });

  it("PROPOSES Joseph Green even though Caleb Green shares the surname exactly", () => {
    const d = decide("Joseph Green");
    expect(d?.kind).toBe("propose");
    if (d?.kind !== "propose") return;
    expect(d.sharedSurname.map((p) => p.id)).toEqual(["P-1018"]);
    expect(d.looksLikeHandle).toBe(false);
    const text = personProposalText(d);
    expect(text).toContain("propose the person");
    expect(text).toContain("DIFFERENT person");
  });

  it("PROPOSES Ryan Groth with no near miss at all", () => {
    const d = decide("Ryan Groth");
    expect(d?.kind).toBe("propose");
    if (d?.kind !== "propose") return;
    expect(d.sharedSurname).toEqual([]);
    expect(d.looksLikeHandle).toBe(false);
  });

  it("does not withhold on a first-name prefix when the second token is a real surname", () => {
    // "dix" opens "dixith", but "Fischer" is a surname — without the digit test this would
    // have refused a proposal that is owed.
    const d = decide("Dix Fischer");
    expect(d?.kind).toBe("propose");
  });

  it("breaks no tie when a handle opens two CRM first names", () => {
    const twoAlex: CrmPerson[] = [
      { id: "P-1021", name: "Alex Greenwood", orgId: "C-2018" },
      { id: "P-1099", name: "Alexander Reed", orgId: "C-2001" },
    ];
    const d = decide("Alex xyz42", twoAlex);
    expect(d?.kind).toBe("withhold");
    if (d?.kind !== "withhold") return;
    expect(d.reason.people.map((p) => p.id)).toEqual(["P-1021", "P-1099"]);
    expect(personProposalText(d)).toContain("none is picked");
  });

  it("flags a handle no CRM first name opens rather than silently proposing it", () => {
    const d = decide("Zephyr bot77");
    expect(d?.kind).toBe("propose");
    if (d?.kind !== "propose") return;
    expect(d.looksLikeHandle).toBe(true);
    expect(personProposalText(d)).toContain("check Notion before creating a record");
  });

  it("returns null for every outcome that is not unknown", () => {
    expect(decidePersonProposal(resolveAttendee(attendee("Alex Greenwood"), PEOPLE), PEOPLE)).toBeNull();
    expect(decidePersonProposal(resolveAttendee(attendee("Alex", false), PEOPLE), PEOPLE)).toBeNull();
  });

  it("ignores a three-token value with a digit — that shape is not proven by this rung", () => {
    const d = decide("Dix the dev08");
    expect(d?.kind).toBe("propose");
  });
});
