import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { drainReport, drainSummary, type DriveFile } from "@/lib/meetings/driveDrain";

const doc = (id: string, title: string, bytes: number): DriveFile => ({
  id,
  title,
  mimeType: "application/vnd.google-apps.document",
  bytes,
});
const audio = (id: string, title: string): DriveFile => ({
  id,
  title,
  mimeType: "audio/x-m4a",
  bytes: 51_119_085,
});

describe("drainReport — 'moved' comes from the /Processed listing and nowhere else", () => {
  it("does NOT call a file drained because a ruling says it was carried into the CRM", () => {
    const f = doc("d1", "Manual Notes from 7/28 Call with Omega", 1024);
    const r = drainReport([f], [], [{ fileId: "d1", note: "read and filed as an activity" }]);

    expect(r.drained).toHaveLength(0);
    expect(r.verdicts[0].kind).toBe("eligible");
    expect(r.eligible).toHaveLength(1);
    expect(r.verdicts[0].why).toContain("still in /Unprocessed");
  });

  it("calls a file drained on the /Processed listing alone, with no ruling anywhere", () => {
    const f = doc("d1", "Some transcript", 57_529);
    const r = drainReport([], [f], []);

    expect(r.drained).toHaveLength(1);
    expect(r.eligible).toHaveLength(0);
  });

  it("treats a file listed in BOTH folders as multi-parented, not as a completed move", () => {
    const f = doc("d1", "Some transcript", 57_529);
    const r = drainReport([f], [f], []);

    expect(r.verdicts[0].kind).toBe("drained");
    expect(r.verdicts[0].why).toContain("unparenting");
  });
});

describe("drainReport — the refusals", () => {
  it("does not apply the DoD (f) byte floor to a native Google Doc", () => {
    // 1024 is far below TRANSCRIPT_MIN_BYTES (512 is the floor; a stub is 26 bytes) — but for a
    // native Doc that number is not text length, so the module must refuse to rule on it.
    const r = drainReport([doc("d1", "Manual Notes from call with Dixith", 1024)], [], []);

    expect(r.verdicts[0].kind).toBe("needs-a-read");
    expect(r.verdicts[0].why).toContain("not the length of its text");
  });

  it("classifies a recording as needing transcription — never as a stub, never as coverage", () => {
    const r = drainReport([audio("a1", "Call with John Burns.m4a")], [], []);

    expect(r.verdicts[0].kind).toBe("needs-transcription");
    expect(r.verdicts[0].why).toContain("not a placeholder");
    expect(r.verdicts[0].why).toContain("must not be counted as coverage");
  });

  it("never links a file to a ruling by title", () => {
    const r = drainReport(
      [doc("d1", "Call with David Cates.m4a", 1024)],
      [],
      [{ fileId: "SOME-OTHER-ID", note: "Call with David Cates.m4a" }],
    );

    expect(r.verdicts[0].kind).toBe("needs-a-read");
    expect(r.eligible).toHaveLength(0);
    expect(r.orphanedRulings.map((o) => o.fileId)).toEqual(["SOME-OTHER-ID"]);
  });

  it("reports a ruling whose file is in neither folder rather than dropping it", () => {
    const r = drainReport([], [], [{ fileId: "ghost" }]);
    expect(r.orphanedRulings).toHaveLength(1);
  });
});

describe("drainSummary — a bare 0 must not read as a rounding error", () => {
  it("says the drain has never run when /Processed is empty", () => {
    expect(drainSummary(6, 0, 0)).toContain("never run once");
  });

  it("drops that clause the moment anything has landed", () => {
    expect(drainSummary(5, 1, 0)).not.toContain("never run once");
  });

  it("distinguishes a reading backlog from a moving one", () => {
    expect(drainSummary(6, 0, 0)).toContain("reading backlog, not a moving one");
    expect(drainSummary(6, 0, 2)).toContain("2 ruled captured and still owed a move");
  });
});

describe("the measured 2026-08-08 snapshot — asserted against the real file, not a fixture", () => {
  const snap = JSON.parse(
    readFileSync(
      join(process.cwd(), "MLE Internal Meetings", "drive-drain-2026-08-08.json"),
      "utf8",
    ),
  );

  it("corrects the BUILD-QUEUE's standing count: 6 in /Unprocessed, 0 in /Processed", () => {
    expect(snap.unprocessed).toHaveLength(6);
    expect(snap.processed).toHaveLength(0);
  });

  it("holds no .txt of any size, so the 'three 26-byte stubs' line no longer describes it", () => {
    const txt = snap.unprocessed.filter((f: DriveFile) => f.mimeType === "text/plain");
    expect(txt).toHaveLength(0);
  });

  it("rules the live folder: 3 recordings owed transcription, 3 docs owed a read, 0 movable", () => {
    const r = drainReport(snap.unprocessed, snap.processed, []);

    expect(r.needsTranscription).toHaveLength(3);
    expect(r.needsARead).toHaveLength(3);
    expect(r.eligible).toHaveLength(0);
    expect(r.drained).toHaveLength(0);
    expect(r.summary).toContain("6 in /Unprocessed · 0 in /Processed");
    expect(r.summary).toContain("never run once");
  });
});
