/**
 * Q85 inc.5 — the archive read carries attendees.
 *
 * Every fixture below is a REAL row read off prod Notion this increment, not an invented one.
 * The point of the module is which of them may be acted on, so the tests are written as that
 * question: who resolves, who is only a question, and who must never leave our own side.
 */

import { describe, expect, it } from "vitest";
import {
  readArchiveAttendees,
  resolvableCounterparties,
  summarizeAttendeeCoverage,
} from "../archiveAttendees";

describe("readArchiveAttendees", () => {
  it("reads a real multi-attendee row and keeps our people on our side", () => {
    // Prod: "Gulf Coast RE KICKOFF 2026-07-22"
    const attendees = readArchiveAttendees({
      nonMleAttendees: "Alex Greenwood, Chris Acheson, Shasta",
      mleAttendees: ["Rob Acheson", "Will DeVito"],
    });

    expect(attendees.filter((a) => a.side === "internal").map((a) => a.name)).toEqual([
      "Rob Acheson",
      "Will DeVito",
    ]);
    expect(attendees.filter((a) => a.side === "counterparty").map((a) => a.name)).toEqual([
      "Alex Greenwood",
      "Chris Acheson",
      "Shasta",
    ]);
  });

  it("marks a one-token name as not identifying — it is evidence, not a match", () => {
    // Prod carries all of these bare first names, several visibly truncated.
    for (const name of ["Alex", "Chai", "Shasta", "Dani", "Michael"]) {
      const [attendee] = readArchiveAttendees({ contactName: name });
      expect(attendee.name).toBe(name);
      expect(attendee.identifying).toBe(false);
    }
    expect(readArchiveAttendees({ contactName: "Alex Greenwood" })[0].identifying).toBe(true);
  });

  it("does not split a two-word person into two people", () => {
    const attendees = readArchiveAttendees({ contactName: "Caleb Green" });
    expect(attendees).toHaveLength(1);
    expect(attendees[0].name).toBe("Caleb Green");
  });

  it("dedupes a human named in two columns", () => {
    // Prod: "Rob & Dix | MLE & Skin Cancer Detection AI" carries Dixith in both columns.
    const attendees = readArchiveAttendees({
      contactName: "Dixith",
      nonMleAttendees: "Dixith",
      mleAttendees: ["Rob Acheson"],
    });
    expect(attendees.filter((a) => a.side === "counterparty")).toHaveLength(1);
    expect(attendees[1].source).toBe("Contact Name");
  });

  it("moves one of ours typed into the counterparty box back to internal, never the reverse", () => {
    const attendees = readArchiveAttendees({
      nonMleAttendees: "Rob Acheson, Alex Greenwood",
      mleAttendees: ["Rob Acheson"],
    });
    const rob = attendees.find((a) => a.name === "Rob Acheson");
    expect(rob?.side).toBe("internal");
    expect(attendees.find((a) => a.name === "Alex Greenwood")?.side).toBe("counterparty");
  });

  it("carries the source column so a reader can fix the field it was typed into", () => {
    const attendees = readArchiveAttendees({ contactName: "Trent Brands", salesRep: ["Rob Acheson"] });
    expect(attendees.map((a) => [a.name, a.source])).toEqual([
      ["Rob Acheson", "Sales Rep"],
      ["Trent Brands", "Contact Name"],
    ]);
  });

  it("splits on the separators these columns actually use, and not on a bare space", () => {
    const attendees = readArchiveAttendees({ nonMleAttendees: "Dani, Michael; Ann Ruiz / Bo Yang and Cy Vane" });
    expect(attendees.map((a) => a.name)).toEqual(["Dani", "Michael", "Ann Ruiz", "Bo Yang", "Cy Vane"]);
  });

  it("returns nothing for an empty row rather than an empty-string attendee", () => {
    expect(readArchiveAttendees({})).toEqual([]);
    expect(readArchiveAttendees({ contactName: "  ", nonMleAttendees: ", ,", mleAttendees: [""] })).toEqual([]);
  });
});

describe("resolvableCounterparties", () => {
  it("keeps only the other side, named well enough to be one human", () => {
    const attendees = readArchiveAttendees({
      contactName: "Alex",
      nonMleAttendees: "Alex Greenwood, Chris Acheson",
      mleAttendees: ["Rob Acheson"],
    });
    expect(resolvableCounterparties(attendees).map((a) => a.name)).toEqual([
      "Alex Greenwood",
      "Chris Acheson",
    ]);
  });

  it("resolves nobody from a row whose only counterparty is a first name", () => {
    const attendees = readArchiveAttendees({ contactName: "Chai", mleAttendees: ["Rob Acheson"] });
    expect(resolvableCounterparties(attendees)).toEqual([]);
  });
});

describe("summarizeAttendeeCoverage", () => {
  it("separates rows a resolver can act on from rows that only need a surname typed in", () => {
    const coverage = summarizeAttendeeCoverage([
      { nonMleAttendees: "Alex Greenwood, Chris Acheson", mleAttendees: ["Rob Acheson"] },
      { contactName: "Chai" },
      { mleAttendees: ["Rob Acheson"] }, // ours only — nobody to attach
      {}, // silent
    ]);
    expect(coverage).toEqual({
      withAnyAttendee: 3,
      withCounterparty: 2,
      withResolvableCounterparty: 1,
      counterpartyNotIdentifying: 1,
      total: 4,
    });
  });
});
