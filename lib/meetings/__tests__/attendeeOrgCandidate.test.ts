/**
 * Q85 inc.15 — the candidate source for the 9 empty-cell rows.
 *
 * Fixtures are copied out of `data/network.local.json`, not invented: P-1009 Michael Jaenvega →
 * C-2005 Martin Fierro Restaurant, P-1013 Joe Fleming → C-2013 Vive Health, P-1012 Giovanni
 * Spazioso → C-2014 De Cecco USA. Real ids, real spellings, real org attachments.
 */

import { describe, expect, it } from "vitest";
import { readArchiveAttendees } from "../archiveAttendees";
import { resolveRowAttendees } from "../attendeePerson";
import { candidateOrgFromAttendees } from "../attendeeOrgCandidate";
import type { CrmOrg, CrmPerson } from "../activityPlan";

const ORGS: CrmOrg[] = [
  { id: "C-2005", name: "Martin Fierro Restaurant" },
  { id: "C-2013", name: "Vive Health" },
  { id: "C-2014", name: "De Cecco USA" },
];

const PEOPLE: CrmPerson[] = [
  { id: "P-1009", name: "Michael Jaenvega", orgId: "C-2005" },
  { id: "P-1013", name: "Joe Fleming", orgId: "C-2013" },
  { id: "P-1012", name: "Giovanni Spazioso", orgId: "C-2014" },
];

/** Resolve the way a caller for a candidate MUST: no org passed in. */
function candidateFor(fields: Parameters<typeof readArchiveAttendees>[0], people = PEOPLE) {
  return candidateOrgFromAttendees(
    resolveRowAttendees(readArchiveAttendees(fields), people),
    ORGS
  );
}

describe("candidateOrgFromAttendees", () => {
  it("names the company of the one person the archive named and the CRM holds", () => {
    const result = candidateFor({ contactName: "Michael Jaenvega", mleAttendees: ["Rob"] });

    expect(result.outcome).toBe("candidate");
    expect(result.orgId).toBe("C-2005");
    expect(result.orgName).toBe("Martin Fierro Restaurant");
    expect(result.evidence).toEqual([
      {
        personId: "P-1009",
        personName: "Michael Jaenvega",
        attendeeName: "Michael Jaenvega",
        source: "Contact Name",
        orgId: "C-2005",
      },
    ]);
    expect(result.nextStep).toContain("P-1009");
  });

  it("agrees with itself when two people from the same company are both named", () => {
    const people = [...PEOPLE, { id: "P-9001", name: "Ana Ruiz", orgId: "C-2005" }];
    const result = candidateFor(
      { nonMleAttendees: "Michael Jaenvega, Ana Ruiz" },
      people
    );

    expect(result.outcome).toBe("candidate");
    expect(result.orgId).toBe("C-2005");
    expect(result.evidence.map((e) => e.personId)).toEqual(["P-1009", "P-9001"]);
  });

  it("REFUSES to pick when the matched people work at two different companies", () => {
    const result = candidateFor({ nonMleAttendees: "Joe Fleming, Giovanni Spazioso" });

    expect(result.outcome).toBe("ambiguous-orgs");
    expect(result.orgId).toBeUndefined();
    expect(result.competingOrgIds).toEqual(["C-2013", "C-2014"]);
    // Both are carried — a human picking between them needs the list, not the count.
    expect(result.evidence.map((e) => e.personId).sort()).toEqual(["P-1012", "P-1013"]);
  });

  it("never lets an AMBIGUOUS person contribute an org", () => {
    // Two CRM people share a name: the person is a question, so their org is a question too.
    const people = [
      { id: "P-8001", name: "Joe Fleming", orgId: "C-2013" },
      { id: "P-8002", name: "Joe Fleming", orgId: "C-2014" },
    ];
    const result = candidateFor({ contactName: "Joe Fleming" }, people);

    expect(result.outcome).toBe("no-matched-person");
    expect(result.evidence).toEqual([]);
  });

  it("never lets an INTERNAL attendee name the counterparty", () => {
    // Rob is in the CRM and is on both sides of every meeting. `MLE Attendees` is our column.
    const people = [...PEOPLE, { id: "P-1001", name: "Rob Acheson", orgId: "C-2014" }];
    const result = candidateFor(
      { mleAttendees: ["Rob Acheson"], salesRep: ["Rob Acheson"] },
      people
    );

    expect(result.outcome).toBe("no-counterparty");
    expect(result.orgId).toBeUndefined();
  });

  it("says no-counterparty when all four attendee columns are empty", () => {
    expect(candidateFor({}).outcome).toBe("no-counterparty");
  });

  it("asks for a person, not a company, when nobody named resolves", () => {
    const result = candidateFor({ nonMleAttendees: "Dana Whitfield, Owen Marsh" });

    expect(result.outcome).toBe("no-matched-person");
    expect(result.nextStep).toContain("Create the person first");
    expect(result.nextStep).toContain("2 counterparties");
  });

  it("points at the PERSON record when the CRM holds the human but not their employer", () => {
    const people = [{ id: "P-7001", name: "Michael Jaenvega", orgId: null }];
    const result = candidateFor({ contactName: "Michael Jaenvega" }, people);

    expect(result.outcome).toBe("person-without-org");
    expect(result.nextStep).toContain("P-7001");
  });

  it("names a stale orgId rather than letting it become a bare unknown-org downstream", () => {
    const people = [{ id: "P-7002", name: "Michael Jaenvega", orgId: "C-9999" }];
    const result = candidateFor({ contactName: "Michael Jaenvega" }, people);

    expect(result.outcome).toBe("org-not-in-crm");
    expect(result.competingOrgIds).toEqual(["C-9999"]);
    expect(result.nextStep).toContain("P-7002");
    expect(result.nextStep).toContain("the row is not the defect");
  });

  it("a one-token name cannot name a company (inc.5's identifying floor holds through)", () => {
    const people = [{ id: "P-6001", name: "Michael", orgId: "C-2005" }];
    const result = candidateFor({ contactName: "Michael" }, people);

    expect(result.outcome).toBe("no-matched-person");
  });

  it("is PURE — same inputs, same answer, and it mutates neither argument", () => {
    const fields = { contactName: "Michael Jaenvega" };
    const peopleSnapshot = JSON.stringify(PEOPLE);
    const orgsSnapshot = JSON.stringify(ORGS);

    const a = candidateFor(fields);
    const b = candidateFor(fields);

    expect(a).toEqual(b);
    expect(JSON.stringify(PEOPLE)).toBe(peopleSnapshot);
    expect(JSON.stringify(ORGS)).toBe(orgsSnapshot);
  });

  it("PINS THE CIRCULARITY RULE: passing the org into the resolver assumes the answer", () => {
    // Two Joe Flemings. Resolved with NO org (the correct call for a candidate) the name is
    // ambiguous and contributes nothing.
    const people = [
      { id: "P-8001", name: "Joe Fleming", orgId: "C-2013" },
      { id: "P-8002", name: "Joe Fleming", orgId: "C-2014" },
    ];
    const attendees = readArchiveAttendees({ contactName: "Joe Fleming" });

    expect(candidateOrgFromAttendees(resolveRowAttendees(attendees, people), ORGS).outcome).toBe(
      "no-matched-person"
    );

    // Resolved WITH an org, the resolver narrows to that org's person and this module would then
    // "discover" the org it was handed. Demonstrated so the failure mode is visible, not implied.
    const circular = candidateOrgFromAttendees(
      resolveRowAttendees(attendees, people, "C-2014"),
      ORGS
    );
    expect(circular.outcome).toBe("candidate");
    expect(circular.orgId).toBe("C-2014");
  });
});
