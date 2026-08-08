import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DRIVE_BODY_UNREAD_BYTES,
  fromDrive,
  indexDriveDocs,
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

  it("no committed ruling claims coverage yet — nothing has been read end to end but the empty one", () => {
    expect(rulings.confirmations.filter((c: DriveReadConfirmation) => c.verdict === "transcript")).toEqual([]);
  });
});
