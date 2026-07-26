import { describe, expect, it } from "vitest";
import { mapDeepgramResponse, type DeepgramMapping } from "../calls/deepgram";
import {
  persistTranscript,
  segmentRows,
  transcriptRow,
  writesSegments,
  type SegmentRow,
  type TranscriptDb,
  type TranscriptRow,
} from "../calls/transcriptStore";
import type { CallTranscript } from "../calls/transcriptSegments";

const SID = "REtest0000000000000000000000000001";

function base(over: Partial<CallTranscript> = {}): CallTranscript {
  return { recordingSid: SID, status: "complete", provider: "deepgram", ...over };
}

/** Records the call order so the upsert-then-prune rule is provable, not asserted. */
function fakeDb(id = "t-1") {
  const calls: string[] = [];
  let upserted: SegmentRow[] = [];
  let prunedFrom: number | null = null;
  const db: TranscriptDb = {
    async upsertTranscript(row: TranscriptRow) {
      calls.push(`upsertTranscript:${row.recording_sid}`);
      return id;
    },
    async upsertSegments(rows) {
      calls.push(`upsertSegments:${rows.length}`);
      upserted = rows;
    },
    async pruneSegments(_tid, fromIdx) {
      calls.push(`pruneSegments:${fromIdx}`);
      prunedFrom = fromIdx;
    },
  };
  return {
    db,
    calls,
    get upserted() {
      return upserted;
    },
    get prunedFrom() {
      return prunedFrom;
    },
  };
}

function mapping(over: Partial<CallTranscript> = {}, segs = 2): DeepgramMapping {
  const m = mapDeepgramResponse(SID, {
    results: {
      utterances: Array.from({ length: segs }, (_, i) => ({
        start: i,
        end: i + 1,
        transcript: `line ${i}`,
        speaker: 0,
      })),
    },
  } as never);
  return { ...m!, transcript: { ...m!.transcript, ...over } };
}

describe("transcriptRow — 0021's column names, in one place", () => {
  it("uses the migration's snake_case names", () => {
    const row = transcriptRow(base({ activityId: `dialer-${SID}`, durationMs: 1234 }));
    expect(Object.keys(row).sort()).toEqual([
      "activity_id",
      "duration_ms",
      "error",
      "language",
      "model",
      "provider",
      "recording_sid",
      "status",
    ]);
  });

  it("writes explicit nulls, never omitted keys — an omitted column keeps the PREVIOUS run's value", () => {
    const row = transcriptRow(base());
    expect(row.model).toBeNull();
    expect(row.language).toBeNull();
    expect(row.duration_ms).toBeNull();
    expect(row.error).toBeNull();
    expect(row.activity_id).toBeNull();
    expect("model" in row).toBe(true);
  });

  it("bumps updated_at only when given one — the file stays clock-free", () => {
    expect(transcriptRow(base()).updated_at).toBeUndefined();
    expect(transcriptRow(base(), "2026-07-26T00:00:00Z").updated_at).toBe("2026-07-26T00:00:00Z");
  });

  it("duration 0 survives as 0, never collapsed to null", () => {
    expect(transcriptRow(base({ durationMs: 0 })).duration_ms).toBe(0);
  });

  it("trims, and blank optionals become null rather than empty strings 0021 would reject", () => {
    const row = transcriptRow(base({ model: "  nova-2  ", language: "   " }));
    expect(row.model).toBe("nova-2");
    expect(row.language).toBeNull();
  });
});

describe("segmentRows", () => {
  it("uses 0021's segment column names", () => {
    const rows = segmentRows("t-1", [{ idx: 0, startMs: 0, endMs: 10, text: "hi", speaker: "0" }]);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "confidence",
      "end_ms",
      "idx",
      "speaker",
      "start_ms",
      "text",
      "transcript_id",
    ]);
  });

  it("keeps confidence 0 and speaker '0' — both are real values, not absences", () => {
    const rows = segmentRows("t-1", [
      { idx: 0, startMs: 0, endMs: 1, text: "a", speaker: "0", confidence: 0 },
    ]);
    expect(rows[0].confidence).toBe(0);
    expect(rows[0].speaker).toBe("0");
  });

  it("missing confidence is null, never defaulted to 1", () => {
    expect(segmentRows("t-1", [{ idx: 0, startMs: 0, endMs: 1, text: "a" }])[0].confidence).toBeNull();
  });

  it("carries idx through untouched — normalizeSegments already owns it", () => {
    const rows = segmentRows("t-1", [
      { idx: 0, startMs: 0, endMs: 1, text: "a" },
      { idx: 1, startMs: 1, endMs: 2, text: "b" },
    ]);
    expect(rows.map((r) => r.idx)).toEqual([0, 1]);
  });
});

describe("writesSegments — only a complete transcript carries words", () => {
  it.each(["pending", "failed"] as const)("%s writes no segments", (status) => {
    const t = status === "failed" ? base({ status, error: "boom" }) : base({ status });
    expect(writesSegments(t)).toBe(false);
  });

  it("complete does", () => {
    expect(writesSegments(base())).toBe(true);
  });
});

describe("persistTranscript", () => {
  it("upserts the transcript, then the segments, then prunes — in that order", async () => {
    const f = fakeDb();
    const res = await persistTranscript(f.db, mapping());
    expect(res).toEqual({ kind: "written", transcriptId: "t-1", segments: 2, pruned: true });
    expect(f.calls).toEqual([
      `upsertTranscript:${SID}`,
      "upsertSegments:2",
      "pruneSegments:2",
    ]);
  });

  it("prunes at the NEW count so a shorter re-run cannot leave a stale tail", async () => {
    const f = fakeDb();
    await persistTranscript(f.db, mapping({}, 3));
    expect(f.prunedFrom).toBe(3);
  });

  it("still prunes when the new run has zero segments — silence must not keep old words", async () => {
    const f = fakeDb();
    const m = mapping();
    const res = await persistTranscript(f.db, { ...m, segments: [] });
    expect(res).toEqual({ kind: "written", transcriptId: "t-1", segments: 0, pruned: true });
    expect(f.calls).toEqual([`upsertTranscript:${SID}`, "pruneSegments:0"]);
  });

  it("a failed transcript writes its row and clears every segment", async () => {
    const f = fakeDb();
    const m = mapping();
    const res = await persistTranscript(f.db, {
      ...m,
      transcript: { ...m.transcript, status: "failed", error: "provider 500" },
    });
    expect(res).toEqual({ kind: "written", transcriptId: "t-1", segments: 0, pruned: true });
    expect(f.calls).toEqual([`upsertTranscript:${SID}`, "pruneSegments:0"]);
    expect(f.upserted).toEqual([]);
  });

  it("refuses a failed transcript with no reason BEFORE touching the database", async () => {
    const f = fakeDb();
    const m = mapping();
    const res = await persistTranscript(f.db, {
      ...m,
      transcript: { ...m.transcript, status: "failed" },
    });
    expect(res).toEqual({ kind: "rejected", reason: "error" });
    expect(f.calls).toEqual([]);
  });

  it("refuses a complete transcript carrying an error — two claims about one call", async () => {
    const f = fakeDb();
    const m = mapping();
    const res = await persistTranscript(f.db, {
      ...m,
      transcript: { ...m.transcript, error: "boom" },
    });
    expect(res).toEqual({ kind: "rejected", reason: "error" });
    expect(f.calls).toEqual([]);
  });

  it("refuses a blank recording sid without writing anything", async () => {
    const f = fakeDb();
    const m = mapping();
    const res = await persistTranscript(f.db, {
      ...m,
      transcript: { ...m.transcript, recordingSid: "   " },
    });
    expect(res).toEqual({ kind: "rejected", reason: "recording_sid" });
    expect(f.calls).toEqual([]);
  });

  it("a db that returns no id is rejected rather than used to key segments", async () => {
    const f = fakeDb("");
    const res = await persistTranscript(f.db, mapping());
    expect(res).toEqual({ kind: "rejected", reason: "transcript_id" });
    expect(f.calls).toEqual([`upsertTranscript:${SID}`]);
  });

  it("keys every segment to the id the upsert returned", async () => {
    const f = fakeDb("abc-123");
    await persistTranscript(f.db, mapping());
    expect(f.upserted.every((r) => r.transcript_id === "abc-123")).toBe(true);
  });

  it("is idempotent — the same mapping twice produces byte-identical rows", async () => {
    const a = fakeDb();
    const b = fakeDb();
    await persistTranscript(a.db, mapping(), "2026-07-26T00:00:00Z");
    await persistTranscript(b.db, mapping(), "2026-07-26T00:00:00Z");
    expect(a.upserted).toEqual(b.upserted);
    expect(a.calls).toEqual(b.calls);
  });

  it("lets a database error surface instead of reporting a write that did not happen", async () => {
    const db: TranscriptDb = {
      async upsertTranscript() {
        throw new Error("23505");
      },
      async upsertSegments() {},
      async pruneSegments() {},
    };
    await expect(persistTranscript(db, mapping())).rejects.toThrow("23505");
  });
});
