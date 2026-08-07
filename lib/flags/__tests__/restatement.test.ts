import { describe, expect, it } from "vitest";
import {
  ambiguousRestatements,
  findRestatements,
  subjectsOf,
  type LedgerFlagRow,
} from "../restatement";

const row = (o: Partial<LedgerFlagRow> & { id: number }): LedgerFlagRow => ({
  status: "open",
  dedupeKey: null,
  entityName: "Meeting archive",
  title: "",
  detail: "",
  ...o,
});

/** The two prod rows this module was measured against, trimmed to the sentences that matter. */
const KEYED_213 = row({
  id: 213,
  dedupeKey: "meeting-archive/person-proposals",
  title: "2 meeting attendee(s) to propose · 1 that must NOT become a record",
  detail:
    "The CRM holds nobody named “Joseph Green” — propose the person. Caleb Green [P-1018] shares the surname. " +
    "The CRM holds nobody named “Ryan Groth” — propose the person. " +
    "“Dix thedev08” is a display handle — “dix” opens Dixith Magadiev [P-1010]. Do NOT create a person.",
});
const UNKEYED_219 = row({
  id: 219,
  title: "Only ONE of the two unmatched meeting attendees should become a person — the other is P-1010",
  detail:
    'CREATE — "Joseph Green". Caleb Green [P-1018] shares the surname and is a DIFFERENT person. ' +
    'DO NOT CREATE — "Dix thedev08". This is Dixith Magadiev [P-1010]s Notion display handle.',
});

describe("subjectsOf", () => {
  it("reads record ids case-normalised and quoted names case-folded", () => {
    expect(subjectsOf(UNKEYED_219)).toEqual(
      expect.arrayContaining(["P-1010", "P-1018", "joseph green", "dix thedev08"])
    );
  });

  it("treats curly and straight quotes as the same subject", () => {
    const a = subjectsOf(row({ id: 1, detail: "“Joseph  Green”" }));
    const b = subjectsOf(row({ id: 2, detail: '"joseph green"' }));
    expect(a).toEqual(b);
  });

  it("finds nothing in prose that names nobody", () => {
    expect(subjectsOf(row({ id: 1, detail: "Nine rows are blocked on an empty column." }))).toEqual([]);
  });
});

describe("findRestatements", () => {
  it("supersedes the hand-filed row by the keyed one — the measured prod pair", () => {
    const found = findRestatements([KEYED_213, UNKEYED_219]);
    expect(found).toHaveLength(1);
    expect(found[0].restatedId).toBe(219);
    expect(found[0].survivorId).toBe(213);
    expect(found[0].survivorKey).toBe("meeting-archive/person-proposals");
    expect(found[0].sharedSubjects).toContain("joseph green");
  });

  it("leaves an unkeyed row alone when it names a subject the keyed row does not", () => {
    const carriesNews = row({ id: 220, detail: '"Joseph Green" and "Marcus Vale" both need records.' });
    expect(findRestatements([KEYED_213, carriesNews])).toEqual([]);
  });

  it("never supersedes a row that names nobody — the empty set is not a match", () => {
    const prose = row({ id: 221, detail: "Three routes came back empty." });
    expect(findRestatements([KEYED_213, prose])).toEqual([]);
  });

  it("ignores a keyed row on a different entity", () => {
    const elsewhere = { ...KEYED_213, entityName: "Flag ledger" };
    expect(findRestatements([elsewhere, UNKEYED_219])).toEqual([]);
  });

  it("does not touch resolved rows on either side", () => {
    expect(findRestatements([{ ...KEYED_213, status: "resolved" }, UNKEYED_219])).toEqual([]);
    expect(findRestatements([KEYED_213, { ...UNKEYED_219, status: "resolved" }])).toEqual([]);
  });

  it("never supersedes a keyed row with another keyed row", () => {
    const otherKeyed = { ...UNKEYED_219, dedupeKey: "meeting-archive/write-blockers" };
    expect(findRestatements([KEYED_213, otherKeyed])).toEqual([]);
  });

  it("refuses when two keyed rows both contain the subjects, and reports the ambiguity", () => {
    const twin = { ...KEYED_213, id: 214, dedupeKey: "meeting-archive/other" };
    expect(findRestatements([KEYED_213, twin, UNKEYED_219])).toEqual([]);
    expect(ambiguousRestatements([KEYED_213, twin, UNKEYED_219])).toEqual([
      { restatedId: 219, survivorIds: [213, 214] },
    ]);
  });

  // The prod trio the first live run offered to close: three different findings about C-2019,
  // sharing the company id and nothing else. See `isQuotedName` in the module.
  it("refuses a match carried by a record id alone — that is the entity, not the finding", () => {
    const keyed = row({
      id: 176,
      dedupeKey: "status-drift-C-2019",
      entityName: "Omega Title",
      title: "C-2019 reads unlit after the 2026-07-28 meeting",
      detail: "Its seven people are missing from the file book. “Omega Title” is the org.",
    });
    const different = row({
      id: 192,
      entityName: "Omega Title",
      title: "C-2019 asserts one Omega domain; the archive names TWO",
      detail: "The archive calls it a coin-flip.",
    });
    expect(findRestatements([keyed, different])).toEqual([]);
    expect(ambiguousRestatements([keyed, different])).toEqual([]);
  });

  it("returns nothing on an empty ledger", () => {
    expect(findRestatements([])).toEqual([]);
    expect(ambiguousRestatements([])).toEqual([]);
  });
});
