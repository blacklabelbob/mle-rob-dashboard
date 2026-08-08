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

  it("summarizeRuledDocs on the committed evidence: docs are counted by FILE, rows by RECORD", () => {
    const root = join(process.cwd(), "MLE Internal Meetings");
    const snap = JSON.parse(readFileSync(join(root, "drive-snapshot-2026-08-07.json"), "utf8"));
    const rulings = JSON.parse(readFileSync(join(root, "drive-read-confirmations.json"), "utf8"));
    // One located record per (doc, event) pair — how `sourceRecordsFromAttachments` feeds this.
    const records = snap.docs.flatMap((d: DriveDoc) =>
      (d.calendarEventIds ?? []).map((evt) => located(d.id, { calendarEventId: evt })),
    );
    const summary = summarizeRuledDocs(fromDrive(records, snap.docs, rulings.confirmations));

    // THE ASSERTION IS THE ARITHMETIC, NOT THE TOTAL OF THE DAY. inc.16's own test pinned
    // "2 docs, 3 rows" and inc.17 turned it red by RULING ANOTHER DOC — going red for success
    // is the exact fault inc.16 replaced a test for, and re-typing the new totals would just
    // re-arm it for inc.18. What must never drift is the distinction that inflated the report:
    // `docsRuled` counts DISTINCT FILES, `rowsMoved` counts RECORDS, and a doc on two invites
    // is one of the first and two of the second. Both sides are recomputed from the committed
    // evidence, so a new ruling moves them together and only a regression separates them.
    const ruledIds = new Set<string>(
      rulings.confirmations
        .map((c: { fileId: string }) => c.fileId)
        .filter((id: string) => snap.docs.some((d: DriveDoc) => d.id === id)),
    );
    const expectedRows = snap.docs
      .filter((d: DriveDoc) => ruledIds.has(d.id))
      .reduce((n: number, d: DriveDoc) => n + (d.calendarEventIds ?? []).length, 0);
    expect(summary.docsRuled).toBe(ruledIds.size);
    expect(summary.rowsMoved).toBe(expectedRows);

    // The CG Roofing doc is the fan-out that made the two numbers differ in the first place:
    // ruled once, it sits on two 2026-06-16 invites. Assert the fan-out still EXISTS — a fixture
    // that cannot reach the branch is green about nothing (inc.16's other lesson) — and that it
    // is counted once as a doc and twice as rows.
    const fanOut = snap.docs.filter(
      (d: DriveDoc) => ruledIds.has(d.id) && (d.calendarEventIds ?? []).length > 1,
    );
    expect(fanOut.length).toBeGreaterThan(0);
    expect(summary.rowsMoved).toBeGreaterThan(summary.docsRuled);

    // Verdicts partition the ruled set: every ruled doc is coverage or it is not, never both.
    expect(summary.transcriptDocs.length + summary.notCoverageDocs.length).toBe(ruledIds.size);
    expect(summary.transcriptDocs).toContain("1479bPU0Jn1QrMomzSdwpWHrx5lFXTvDP0_W0ppJVd_Y");
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
  /**
   * Q86 inc.18 — the mirror of the assertion below, and the one that costs coverage when it fails.
   *
   * Every ruling before this one pointed the same way: the two big docs (41,827 and 67,517 bytes)
   * both held transcripts, and the only non-coverage ruling was the 3,186-byte apology. Read
   * together they say "big means transcript", which is a rule nobody wrote and everybody would
   * start assuming. `1R3Dh6W7…` is 14,199 bytes of genuinely rich Gemini notes — 10 Aligned
   * decisions, 20 next steps, 40 Details bullets — and not one word of it is speech.
   *
   * So the pin is on the direction that hurts: a doc ruled `summary-only` stays OUT of coverage no
   * matter how far above the unread floor it measures. Size may never promote a ruling.
   */
  it("a big `summary-only` doc is never coverage — size cannot promote a ruling", () => {
    const notCoverage = rulings.confirmations.filter(
      (c: DriveReadConfirmation) => c.verdict === "summary-only",
    );
    expect(notCoverage.length).toBeGreaterThan(0);

    for (const c of notCoverage) {
      const doc = snap.docs.find((d: DriveDoc) => d.id === c.fileId);
      expect(doc).toBeTruthy();
      const harvest = fromDrive(
        [{ id: doc.id, source: "gemini" } as unknown as SourceRecord],
        snap.docs,
        rulings.confirmations,
      );
      expect(harvest.records[0].hasTranscript).toBe(false);
      expect(harvest.confirmedTranscripts).not.toContain(doc.id);
      // ...and it is ruled, so it must not be re-queued as an unread body either.
      expect(harvest.bodyFindings.map((f) => f.fileId)).not.toContain(doc.id);
    }

    // The point only lands if at least one of them is genuinely large.
    const biggest = Math.max(
      ...notCoverage.map(
        (c: DriveReadConfirmation) =>
          snap.docs.find((d: DriveDoc) => d.id === c.fileId)?.bytes ?? 0,
      ),
    );
    expect(biggest).toBeGreaterThan(DRIVE_BODY_UNREAD_BYTES);
  });

  /**
   * RULED MEANS RULED, IN BOTH DIRECTIONS — the general form of the pin above (Q86 inc.19).
   *
   * inc.18 asserted that a `summary-only` doc leaves the unread queue. That is the important half,
   * but it is only one verdict of three, and the reciprocal was never stated at all: nothing said
   * that a doc sitting in `bodyFindings` is genuinely unruled. Both halves matter for the same
   * reason — `bodyFindings` is the list a human is sent to go and READ, and this edge is now five
   * docs deep with the majority coming back with no speech in them. A ruled doc leaking back into
   * that list sends someone to re-open a file that is already settled; an unruled doc missing from
   * it loses the only prompt anyone will ever get to open it.
   *
   * So the invariant is disjointness on the real snapshot, computed both ways rather than asserted
   * once: no ruled file appears in `bodyFindings`, and no file in `bodyFindings` carries a ruling.
   * It holds for every verdict, and it does not move when the next doc is read — unlike the ratio,
   * which is evidence for a reader and would be a trap in a test.
   */
  it("the ruled set and the unread queue are disjoint — no verdict re-queues, no queued doc is ruled", () => {
    const harvest = fromDrive(
      snap.docs.map((d: DriveDoc) => ({ id: d.id, source: "gemini" }) as unknown as SourceRecord),
      snap.docs,
      rulings.confirmations,
    );

    const ruledIds = new Set(rulings.confirmations.map((c: DriveReadConfirmation) => c.fileId));
    const queuedIds = new Set(harvest.bodyFindings.map((f) => f.fileId));
    expect(ruledIds.size).toBeGreaterThan(0);

    for (const id of ruledIds) expect(queuedIds.has(id)).toBe(false);
    for (const id of queuedIds) expect(ruledIds.has(id)).toBe(false);

    // Every measured doc is on exactly one side of the line or is below the read floor — so the
    // two sets plus the boilerplate floor account for the whole snapshot, with nothing stranded.
    const belowFloor = snap.docs
      .filter((d: DriveDoc) => (d.bytes ?? 0) < DRIVE_BODY_UNREAD_BYTES && !ruledIds.has(d.id))
      .map((d: DriveDoc) => d.id);
    expect(ruledIds.size + queuedIds.size + belowFloor.length).toBe(snap.docs.length);
  });

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
