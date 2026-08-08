// Q86 inc.45 — the david-cates read, tested against the REAL registry, the REAL transcript and the
// REAL modules rather than fixtures. Third and last sibling of josephOntimeRead.test.ts.
//
// This transcript is the odd one of the three: it is the only one the linker resolves outright, so
// it is the only one that isolates what blocks filing when identity is NOT in dispute. Four things
// are pinned so a later edit cannot quietly re-tell the story:
//
//   1. The link is `linked` on two independently written strings, with nothing left unexplained.
//   2. A clean link is still not permission to write — the refusal is `no-org`, because David's
//      company has no record. That is the finding, and it must not be "fixed" by inventing an org.
//   3. Supplying an org AND a proven day is what drafts it — nothing else.
//   4. The read stays read-only: no money field is named, and the political stretch of the call is
//      excluded from intel.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { boundCallDate } from "../transcriptCallWindow";
import { planTranscriptActivity } from "../transcriptActivityDraft";
import { linkTranscriptToRecord, type RegistryRecord } from "../transcriptRecordLink";

const READ_PATH = path.join(
  process.cwd(),
  "MLE Internal Meetings",
  "transcript-reads",
  "david-cates-2026-08-08.json",
);
const TRANSCRIPT_PATH = path.join(os.homedir(), "Projects", "MyLocalEverything", "transcripts", "david-cates.txt");

const read = JSON.parse(readFileSync(READ_PATH, "utf8"));

const registry = (): RegistryRecord[] => {
  const book = JSON.parse(readFileSync(path.join(process.cwd(), "data", "network.local.json"), "utf8"));
  return (book.people ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id),
    name: String(p.name),
    entityKind: (p.entityKind as "person" | "company") ?? "person",
    legacySlug: (p.legacySlug as string | null) ?? null,
  }));
};

const intel = read.intel
  .filter((i: { sourceRef: string }) => i.sourceRef.startsWith("david-cates.txt:"))
  .map((i: { kind: string; text: string; sourceRef: string }) => ({
    kind: i.kind,
    text: i.text,
    sourceRef: i.sourceRef,
  }));

describe("the live david-cates read", () => {
  it("carries addressable intel — every transcript-sourced entry lands on a line of the file", () => {
    expect(read.transcriptRef).toBe("david-cates.txt");
    expect(intel.length).toBeGreaterThan(0);
    for (const item of intel) {
      expect(item.text.trim().length).toBeGreaterThan(0);
      expect(item.sourceRef).toMatch(/^david-cates\.txt:\d+$/);
    }
  });

  it("names no money, quoted, signed or paid FIELD anywhere in the read", () => {
    const blob = JSON.stringify(read).toLowerCase();
    for (const forbidden of ["quoted_amount", "signed_at", "paid_at", "amount_paid"]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it("links cleanly against the real registry — two strings agree, nothing left unexplained", () => {
    const body = readFileSync(TRANSCRIPT_PATH, "utf8");
    const link = linkTranscriptToRecord(
      { ref: "david-cates.txt", title: "Call with David Cates", body },
      registry(),
    );
    expect(link.status).toBe("linked");
    expect(link.record?.id).toBe("P-1020");
    expect(link.signals.nameMatched).toBe("david cates");
    expect(link.signals.slugMatched).toBe(true);
    expect(link.unexplainedTitleWords).toEqual([]);
    // The read must say the same thing the module says, or one of them is lying.
    expect(read.recordLink.status).toBe(link.status);
    expect(read.recordLink.signals.slugMatched).toBe(link.signals.slugMatched);
  });

  it("a CLEAN LINK IS STILL NOT PERMISSION TO WRITE — it refuses no-org, because the company has no record", () => {
    const body = readFileSync(TRANSCRIPT_PATH, "utf8");
    const link = linkTranscriptToRecord(
      { ref: "david-cates.txt", title: "Call with David Cates", body },
      registry(),
    );
    const result = planTranscriptActivity({
      link,
      orgId: null,
      personId: "P-1020",
      occurredOn: "2026-07-09",
      intel,
    });
    expect(result.drafted).toBe(false);
    if (!result.drafted) expect(result.refusal.kind).toBe("no-org");
    expect(read.whyItStillCannotBeFiled.primary.refusal).toBe("no-org");
  });

  it("drafts only when an org AND a proven day are BOTH supplied", () => {
    const body = readFileSync(TRANSCRIPT_PATH, "utf8");
    const link = linkTranscriptToRecord(
      { ref: "david-cates.txt", title: "Call with David Cates", body },
      registry(),
    );
    const noDay = planTranscriptActivity({ link, orgId: "C-0000", personId: "P-1020", occurredOn: null, intel });
    expect(noDay.drafted).toBe(false);
    if (!noDay.drafted) expect(noDay.refusal.kind).toBe("no-day");

    const both = planTranscriptActivity({
      link,
      orgId: "C-0000",
      personId: "P-1020",
      occurredOn: "2026-07-09",
      intel,
    });
    expect(both.drafted).toBe(true);
    if (both.drafted) {
      expect(both.draft.id).toBe("A-TR-2026-07-09-DAVID-CATES");
      expect(both.draft.personId).toBe("P-1020");
      expect(both.draft.bookProtected).toBe(false);
      // Nothing to carry: this is the one transcript whose title and record do not disagree.
      expect(both.draft.sourceContext.titleWordsRecordCannotAccountFor).toBeUndefined();
    }
  });

  it("bounds the day to four candidates under a hard upload ceiling, and resolves nothing", () => {
    const window = boundCallDate({ ref: "david-cates.txt", uploadedOn: "2026-07-09" });
    expect(window.latestPossible).toBe("2026-07-09");
    expect(window.resolved).toBe(false);
    expect(window.day).toBeNull();
    expect(window.candidates).toEqual(read.callDate.candidates);
    expect(read.callDate.resolved).toBe(false);
  });

  it("records that the weekday evidence BREAKS the window module rather than working around it", () => {
    // "Monday" here is NEXT Monday, across a weekend both speakers name. Fed in as a same-week
    // hint the module empties the window and says the evidence contradicts itself. It refuses
    // instead of guessing — right direction, real limitation, and the read says so out loud.
    const window = boundCallDate({
      ref: "david-cates.txt",
      uploadedOn: "2026-07-09",
      futureWeekdays: ["monday"],
    });
    expect(window.candidates).toEqual([]);
    expect(window.resolved).toBe(false);
    expect(read.callDate._theWeekdayEvidenceBROKEtheModule_andThatIsRecordedNotHidden).toContain("NEXT Monday");
  });

  it("keeps the private political stretch of the call out of intel entirely", () => {
    const blob = JSON.stringify(intel).toLowerCase();
    for (const word of ["zionist", "israel", "massey", "talmud", "evangelical"]) {
      expect(blob).not.toContain(word);
    }
    expect(read.notIntel_butOperationallyImportant.politicalContent).toContain("redaction");
  });
});
