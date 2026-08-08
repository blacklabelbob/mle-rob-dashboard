import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DRIVE_BODY_UNREAD_BYTES,
  fromDrive,
  indexDriveDocs,
  summarizeRuledDocs,
  type DriveDoc,
  type DriveReadConfirmation,
} from "@/lib/meetings/driveReads";
import type { SourceRecord } from "@/lib/meetings/calendarSpine";

const located = (id: string, over: Partial<SourceRecord> = {}): SourceRecord => ({
  source: "gemini",
  id,
  title: "Notes by Gemini",
  calendarEventId: `evt-${id}`,
  hasTranscript: false,
  hasVideo: false,
  ...over,
});

const doc = (id: string, over: Partial<DriveDoc> = {}): DriveDoc => ({
  id,
  title: "Notes by Gemini",
  bytes: 20_000,
  ...over,
});

const ruling = (fileId: string, verdict: DriveReadConfirmation["verdict"]): DriveReadConfirmation => ({
  fileId,
  verdict,
  note: "read end to end",
  confirmedAt: "2026-08-07",
  confirmedBy: "max",
});

describe("fromDrive — only a RULING makes a doc coverage", () => {
  it("a big unruled doc stays hasTranscript:false and becomes a finding", () => {
    const out = fromDrive([located("d1")], [doc("d1", { bytes: 67_517 })]);
    expect(out.records[0].hasTranscript).toBe(false);
    expect(out.confirmedTranscripts).toEqual([]);
    expect(out.bodyFindings).toHaveLength(1);
    expect(out.bodyFindings[0].bytes).toBe(67_517);
  });

  it("a `transcript` ruling — and ONLY that — flips hasTranscript", () => {
    const out = fromDrive([located("d1")], [doc("d1")], [ruling("d1", "transcript")]);
    expect(out.records[0].hasTranscript).toBe(true);
    expect(out.confirmedTranscripts).toEqual(["d1"]);
    expect(out.bodyFindings).toEqual([]);
  });

  it.each(["summary-only", "empty"] as const)("a `%s` ruling settles the doc without covering it", (v) => {
    const out = fromDrive([located("d1")], [doc("d1")], [ruling("d1", v)]);
    expect(out.records[0].hasTranscript).toBe(false);
    expect(out.ruledNotTranscript).toEqual(["d1"]);
    // Settled is not unread — it must not go back on the "someone please open this" list.
    expect(out.bodyFindings).toEqual([]);
  });

  it("a doc below the floor is not a finding — nobody is sent to read boilerplate", () => {
    const out = fromDrive([located("d1")], [doc("d1", { bytes: DRIVE_BODY_UNREAD_BYTES - 1 })]);
    expect(out.bodyFindings).toEqual([]);
  });
});

describe("fromDrive — what it refuses to lose", () => {
  it("passes non-Drive records through untouched", () => {
    const fireflies = located("f1", { source: "fireflies", hasTranscript: true });
    const out = fromDrive([fireflies], []);
    expect(out.records[0]).toEqual(fireflies);
    expect(out.unmeasured).toEqual([]);
  });

  it("an unmeasured located record survives unchanged and is NAMED, never dropped", () => {
    const rec = located("d-unknown");
    const out = fromDrive([rec], [doc("d1")]);
    expect(out.records).toHaveLength(1);
    expect(out.records[0]).toEqual(rec);
    expect(out.unmeasured).toEqual(["d-unknown"]);
  });

  it("keeps the calendarEventId — the certain join is never traded for a measurement", () => {
    const out = fromDrive([located("d1")], [doc("d1")], [ruling("d1", "transcript")]);
    expect(out.records[0].calendarEventId).toBe("evt-d1");
  });

  it("one doc on two events rules BOTH rows and reports the finding ONCE", () => {
    const both = [located("shared", { calendarEventId: "evt-a" }), located("shared", { calendarEventId: "evt-b" })];
    const ruled = fromDrive(both, [doc("shared")], [ruling("shared", "transcript")]);
    expect(ruled.records.map((r) => r.hasTranscript)).toEqual([true, true]);

    const unruled = fromDrive(both, [doc("shared")]);
    expect(unruled.bodyFindings).toHaveLength(1);
  });

  it("a ruling on a file the snapshot never measured is handed back, not silently ignored", () => {
    const out = fromDrive([located("d1")], [doc("d1")], [ruling("ghost", "transcript")]);
    expect(out.orphanedConfirmations.map((c) => c.fileId)).toEqual(["ghost"]);
    expect(out.confirmedTranscripts).toEqual([]);
  });

  it("summarizeRuledDocs counts DOCS READ, not the rows one doc moves", () => {
    // The exact shape that made the live report say "GEMINI DOCS ALREADY READ AND RULED (3)" over a
    // list naming two files: one two-invite doc ruled a transcript, one single-invite doc ruled empty.
    const both = [
      located("shared", { calendarEventId: "evt-a" }),
      located("shared", { calendarEventId: "evt-b" }),
      located("solo"),
    ];
    const out = fromDrive(
      both,
      [doc("shared"), doc("solo")],
      [ruling("shared", "transcript"), ruling("solo", "empty")],
    );
    // The per-record arrays are unchanged — callers that want every moved row still get every row.
    expect(out.confirmedTranscripts).toEqual(["shared", "shared"]);

    const summary = summarizeRuledDocs(out);
    expect(summary.docsRuled).toBe(2);
    expect(summary.rowsMoved).toBe(3);
    expect(summary.transcriptDocs).toEqual(["shared"]);
    expect(summary.notCoverageDocs).toEqual(["solo"]);
  });

  it("summarizeRuledDocs on the committed evidence: 2 docs read, 3 rows moved", () => {
    const root = join(process.cwd(), "MLE Internal Meetings");
    const snap = JSON.parse(readFileSync(join(root, "drive-snapshot-2026-08-07.json"), "utf8"));
    const rulings = JSON.parse(readFileSync(join(root, "drive-read-confirmations.json"), "utf8"));
    // One located record per (doc, event) pair — how `sourceRecordsFromAttachments` feeds this.
    const records = snap.docs.flatMap((d: DriveDoc) =>
      (d.calendarEventIds ?? []).map((evt) => located(d.id, { calendarEventId: evt })),
    );
    const summary = summarizeRuledDocs(fromDrive(records, snap.docs, rulings.confirmations));
    expect(summary.docsRuled).toBe(2);
    expect(summary.rowsMoved).toBe(3);
    // The CG Roofing doc is the fan-out: ruled once, it is on two 2026-06-16 invites.
    expect(summary.transcriptDocs).toEqual(["1479bPU0Jn1QrMomzSdwpWHrx5lFXTvDP0_W0ppJVd_Y"]);
  });

  it("indexDriveDocs joins by file id", () => {
    const { byFileId } = indexDriveDocs([doc("d1")], [ruling("d1", "summary-only")]);
    expect(byFileId.get("d1")?.confirmation?.verdict).toBe("summary-only");
  });
});

describe("the committed snapshot and rulings — the evidence this module cites", () => {
  const root = join(process.cwd(), "MLE Internal Meetings");
  const snap = JSON.parse(readFileSync(join(root, "drive-snapshot-2026-08-07.json"), "utf8"));
  const rulings = JSON.parse(readFileSync(join(root, "drive-read-confirmations.json"), "utf8"));

  it("holds the six Gemini docs the calendar points at", () => {
    expect(snap.docs).toHaveLength(6);
    expect(new Set(snap.docs.map((d: DriveDoc) => d.id)).size).toBe(6);
  });

  it("stores no body and no owner — metadata only", () => {
    const text = readFileSync(join(root, "drive-snapshot-2026-08-07.json"), "utf8");
    expect(text).not.toContain("@aivoicetech.io");
    expect(text).not.toContain("ouid=");
    for (const d of snap.docs) expect(d).not.toHaveProperty("body");
  });

  it("the 3,186-byte doc is ruled `empty` — the file that proves size is not a body", () => {
    const austin = snap.docs.find((d: DriveDoc) => d.bytes === 3186);
    expect(austin).toBeTruthy();
    const r = rulings.confirmations.find((c: DriveReadConfirmation) => c.fileId === austin.id);
    expect(r?.verdict).toBe("empty");
    expect(r?.confirmedBy).toBeTruthy();
    // Below the floor as well, so it could never have become a "go read this" finding either.
    expect(austin.bytes).toBeLessThan(DRIVE_BODY_UNREAD_BYTES);
  });

  it("every ruling names a doc the snapshot measured — zero orphans committed", () => {
    const { orphanedConfirmations } = indexDriveDocs(snap.docs, rulings.confirmations);
    expect(orphanedConfirmations).toEqual([]);
  });

  /**
   * REPLACES inc.15's "no committed ruling claims coverage yet" (Q86 inc.16).
   *
   * That assertion pinned a MOMENT — at the time, the only doc anyone had opened was the 3,186-byte
   * apology — and it read as an invariant. It is not one: reading the CG Roofing doc end to end and
   * ruling it `transcript` is the work this file exists to enable, and it turned a green test red by
   * SUCCEEDING. A test that goes red when the project advances is a test that will be deleted in a
   * hurry by whoever is mid-increment, and the real guarantee underneath it would go with it.
   *
   * So the guarantee is stated directly instead: a `transcript` verdict is the one value that turns
   * `hasTranscript` true and closes a meeting, and it may never be a bare word. It carries quoted
   * evidence, a date, and a named owner — so a wrong ruling is arguable and has somebody's name on it.
   */
  it("a `transcript` ruling always carries quoted evidence, a date and an owner", () => {
    const coverage = rulings.confirmations.filter(
      (c: DriveReadConfirmation) => c.verdict === "transcript",
    );
    expect(coverage.length).toBeGreaterThan(0);
    for (const c of coverage) {
      expect(c.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.confirmedBy?.trim()).toBeTruthy();
      // Quoted speech, not a summary of a summary: the note must show the doc's own words.
      expect(c.note).toMatch(/verbatim/i);
      expect(c.note.length).toBeGreaterThan(200);
    }
  });
});
