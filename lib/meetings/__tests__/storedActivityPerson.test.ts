import { describe, expect, it } from "vitest";

import { attendeeFieldsFromStored, decideStoredPerson } from "../storedActivityPerson";
import type { CrmPerson } from "../activityPlan";

/** The real prod list, trimmed to the records these cases turn on. */
const PEOPLE: CrmPerson[] = [
  { id: "P-1001", name: "Rob Acheson", orgId: "" },
  { id: "P-1004", name: "Daniella Roach", orgId: "C-2003" },
  { id: "P-1008", name: "Will DeVito", orgId: "" },
  { id: "P-1009", name: "Michael Jaenvega", orgId: "C-2005" },
  { id: "P-1022", name: "Alex Greenwood", orgId: "C-2018" },
  { id: "P-1024", name: "Mike Stiber", orgId: "C-2019" },
];

describe("attendeeFieldsFromStored", () => {
  it("leaves an absent column absent rather than empty — 'the archive said nobody' is a different claim from 'our row did not keep it'", () => {
    expect(attendeeFieldsFromStored({ attendeesMle: ["Rob Acheson"] })).toEqual({ mleAttendees: ["Rob Acheson"] });
    expect(attendeeFieldsFromStored(null)).toEqual({});
    expect(attendeeFieldsFromStored({ attendeesOther: [] })).toEqual({});
  });

  it("rejoins the stored counterparty array into the comma form the splitter was written for", () => {
    expect(attendeeFieldsFromStored({ attendeesOther: ["Alex Greenwood", "Chris Acheson"] }).nonMleAttendees).toBe(
      "Alex Greenwood, Chris Acheson"
    );
  });
});

describe("decideStoredPerson", () => {
  it("never re-decides a row that already carries an attribution", () => {
    const d = decideStoredPerson(
      { id: "A-1", orgId: "C-2018", personId: "P-1022", sourceContext: { attendeesOther: ["Mike Stiber"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "already-attached" });
    expect(d.kind === "refused" && d.detail).toContain("P-1022");
  });

  // The three Gulf Coast / Omega rows on prod, verbatim: internal names only.
  it("reports our own storage gap as ours when the row kept only MLE-side names", () => {
    const d = decideStoredPerson(
      { id: "A-MTG-2026-07-28-OMEGA", orgId: "C-2019", personId: null, sourceContext: { attendeesMle: ["Rob Acheson", "Will DeVito"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "no-counterparties-stored" });
    expect(d.kind === "refused" && d.detail).toContain("Rob Acheson, Will DeVito");
  });

  it("says so plainly when the row kept no attendee names at all", () => {
    const d = decideStoredPerson({ id: "A-2", orgId: "C-2019", personId: null, sourceContext: {} }, PEOPLE);
    expect(d).toMatchObject({ kind: "refused", reason: "no-counterparties-stored" });
    expect(d.kind === "refused" && d.detail).toContain("no attendee names at all");
  });

  // A-MTG-2026-07-30-MARTINFIERRO on prod, verbatim.
  it("separates a too-thin archive field from a person the CRM is missing", () => {
    const d = decideStoredPerson(
      { id: "A-MTG-2026-07-30-MARTINFIERRO", orgId: "C-2005", personId: null, sourceContext: { attendeesMle: ["Rob Acheson", "Will DeVito"], attendeesOther: ["Dani", "Michael"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "not-identifying" });
    // The refusal must NOT read as "propose these people" — proposing "Dani" creates a wrong record.
    expect(d.kind === "refused" && d.detail).not.toContain("person proposal");
  });

  it("asks for a proposal only when an identifying name genuinely hits nobody", () => {
    const d = decideStoredPerson(
      { id: "A-3", orgId: "C-2019", personId: null, sourceContext: { attendeesOther: ["Joseph Green"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "unresolved" });
    expect(d.kind === "refused" && d.detail).toContain("person proposal");
  });

  it("attaches when exactly one stored counterparty resolves at the row's own org", () => {
    const d = decideStoredPerson(
      { id: "A-4", orgId: "C-2019", personId: null, sourceContext: { attendeesMle: ["Rob Acheson"], attendeesOther: ["Mike Stiber"] } },
      PEOPLE
    );
    expect(d).toEqual({ kind: "attach", activityId: "A-4", personId: "P-1024", personName: "Mike Stiber", orgId: "C-2019" });
  });

  it("refuses an exact name match that belongs to another company — the org on the row is the fact", () => {
    const d = decideStoredPerson(
      { id: "A-5", orgId: "C-2005", personId: null, sourceContext: { attendeesOther: ["Daniella Roach"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "cross-org" });
    expect(d.kind === "refused" && d.detail).toContain("C-2003");
  });

  it("picks none when two counterparties resolve, because person_id holds one", () => {
    const d = decideStoredPerson(
      { id: "A-6", orgId: "C-2019", personId: null, sourceContext: { attendeesOther: ["Mike Stiber", "Alex Greenwood"] } },
      PEOPLE
    );
    expect(d).toMatchObject({ kind: "refused", reason: "many" });
  });

  it("is pure — the same row and people decide the same way every call", () => {
    const row = { id: "A-7", orgId: "C-2019", personId: null, sourceContext: { attendeesOther: ["Mike Stiber"] } };
    expect(decideStoredPerson(row, PEOPLE)).toEqual(decideStoredPerson(row, PEOPLE));
  });
});
