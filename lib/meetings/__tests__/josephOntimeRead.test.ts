// Q86 inc.44 — the joseph-ontime read, tested against the REAL file rather than fixtures.
//
// Sibling of transcriptCallWindow.test.ts, which does the same job for john-burns. Two things are
// pinned here that a later edit could quietly break:
//
//   1. The read still carries what the write boundary needs (addressable intel, an upload ceiling).
//   2. Closing the intel half does NOT move this transcript to a draft — the linker's `uncertain`
//      verdict still refuses first. That is the honest state, and asserting it is how a future
//      increment cannot claim the day is the only thing left.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { boundCallDate } from "../transcriptCallWindow";
import { planTranscriptActivity } from "../transcriptActivityDraft";
import type { TranscriptRecordLink } from "../transcriptRecordLink";

const READ_PATH = path.join(
  process.cwd(),
  "MLE Internal Meetings",
  "transcript-reads",
  "joseph-ontime-2026-08-08.json",
);

const read = JSON.parse(readFileSync(READ_PATH, "utf8"));

const intel = read.intel.map((i: { kind: string; text: string; sourceRef: string }) => ({
  kind: i.kind,
  text: i.text,
  sourceRef: i.sourceRef,
}));

describe("the live joseph-ontime read", () => {
  it("carries addressable intel — every entry lands on a line of the transcript", () => {
    expect(read.transcriptRef).toBe("joseph-ontime.txt");
    expect(read.intel.length).toBeGreaterThan(0);
    for (const item of read.intel) {
      expect(item.text.trim().length).toBeGreaterThan(0);
      expect(item.sourceRef).toMatch(/^joseph-ontime\.txt:\d+$/);
    }
  });

  it("names no money, quoted, signed or paid FIELD anywhere in the read", () => {
    const blob = JSON.stringify(read.intel).toLowerCase();
    for (const forbidden of ["quoted_amount", "signed_at", "paid_at", "amount_paid"]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it("records the human ruling on the ROOFING mislabel WITHOUT renaming anything", () => {
    expect(read.recordLink.linkedRecord).toContain("C-2016");
    expect(read.recordLink.humanRuling).toContain("SAME COMPANY");
    expect(read.recordLink.ruledBy).toContain("2026-08-08");
    expect(read.recordLink.notCorrected).toContain("NOT renamed");
    // The ruling is an input a caller may supply — never a change to the linker's rule.
    expect(read.recordLink.whatIsNOTClaimed).toContain("must not");
  });

  it("says the date is bounded to four days, weaker than john-burns, and says why", () => {
    expect(read.callDate.resolved).toBe(false);
    expect(read.callDate.latestPossible).toBe("2026-07-09");
    expect(read.callDate.candidates).toHaveLength(4);
    expect(read.callDate.narrowedBy).toContain("NOTHING INSIDE THE BODY");
  });
});

describe("boundCallDate reproduces the window from the evidence alone", () => {
  it("gives the read's four candidates with no weekday placed in the future", () => {
    const w = boundCallDate({ ref: "joseph-ontime.txt", uploadedOn: read.callDate.latestPossible });
    expect(w.candidates).toEqual(read.callDate.candidates);
    expect(w.resolved).toBe(false);
    expect(w.day).toBeNull();
    expect(w.assumptions[0]).toContain("nothing narrows the week");
  });
});

describe("what the intel half does and does NOT unblock", () => {
  const uncertainLink = {
    transcript: { ref: "joseph-ontime.txt", title: "Joseph On Time Roofing Call Recording" },
    status: "uncertain",
    record: { id: "C-2016", entityKind: "company", name: "On Time Moving & Storage", slug: "on-time-moving-storage" },
    signals: { nameMatched: "On Time", slugMatched: false },
    unexplainedTitleWords: ["roofing"],
  } as unknown as TranscriptRecordLink;

  it("still refuses NOT-LINKED even with full intel — the title dispute outranks the day", () => {
    const result = planTranscriptActivity({ link: uncertainLink, orgId: "C-2016", occurredOn: null, intel });
    expect(result.drafted).toBe(false);
    if (result.drafted) throw new Error("unreachable");
    expect(result.refusal.kind).toBe("not-linked");
  });

  it("once a human supplies the ruling, `no-intel` is gone and only the day is left", () => {
    const ruled = { ...uncertainLink, status: "linked" } as TranscriptRecordLink;
    const result = planTranscriptActivity({ link: ruled, orgId: "C-2016", occurredOn: null, intel });
    expect(result.drafted).toBe(false);
    if (result.drafted) throw new Error("unreachable");
    expect(result.refusal.kind).toBe("no-day");
  });

  it("drafts on a proven day, carrying the ROOFING discrepancy onto the row rather than fixing it", () => {
    const ruled = { ...uncertainLink, status: "linked" } as TranscriptRecordLink;
    const result = planTranscriptActivity({
      link: ruled,
      orgId: "C-2016",
      occurredOn: "2026-07-08",
      intel,
    });
    expect(result.drafted).toBe(true);
    if (!result.drafted) throw new Error("unreachable");
    expect(result.draft.orgId).toBe("C-2016");
    expect(result.draft.sourceContext.transcriptTitle).toContain("Roofing");
    expect(result.draft.sourceContext.titleWordsRecordCannotAccountFor).toEqual(["roofing"]);
    expect(result.draft.sourceContext.intel).toHaveLength(intel.length);
  });
});
