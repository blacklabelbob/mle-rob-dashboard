import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TRANSCRIPT_STATUSES,
  normalizeSegments,
  segmentAtMs,
  segmentRejection,
  transcriptActivityId,
  transcriptKey,
  transcriptRowRejection,
  type CallTranscript,
  type TranscriptSegment,
} from "../calls/transcriptSegments";

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0021_call_transcripts.sql"),
  "utf8",
);

/** Parsed, not eyeballed — the entityAccess/readModelSql precedent. */
function checkList(anchor: string): string[] {
  const start = SQL.indexOf(anchor);
  if (start < 0) throw new Error(`anchor not found: ${anchor}`);
  const open = SQL.indexOf("(", start + anchor.length);
  const close = SQL.indexOf(")", open);
  return SQL.slice(open + 1, close)
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

const seg = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  idx: 0,
  startMs: 0,
  endMs: 1000,
  text: "hello",
  ...over,
});

describe("0021 migration ↔ TS unions", () => {
  it("status CHECK matches TRANSCRIPT_STATUSES rank-for-rank", () => {
    expect(checkList("check (status in")).toEqual([...TRANSCRIPT_STATUSES]);
  });

  it("keeps both tables behind RLS — the anon key is in the client bundle", () => {
    expect(SQL).toContain("alter table call_transcripts enable row level security");
    expect(SQL).toContain("alter table call_transcript_segments enable row level security");
  });

  it("keys a transcript by recording_sid and a segment by (transcript_id, idx)", () => {
    expect(SQL).toMatch(/recording_sid text not null unique/);
    expect(SQL).toMatch(
      /create unique index if not exists call_transcript_segments_idx_uniq\s+on call_transcript_segments \(transcript_id, idx\)/,
    );
  });

  it("never grants call content to the read-model role", () => {
    // Statements only — the header prose says the word "granted" on purpose.
    const statements = SQL.split("\n").filter((l) => /^\s*grant\b/i.test(l));
    expect(statements).toEqual([]);
  });

  it("indexes both playback order and moment search", () => {
    expect(SQL).toContain("(transcript_id, start_ms)");
    expect(SQL).toContain("using gin (to_tsvector('simple', text))");
  });
});

describe("transcript identity", () => {
  it("derives from the recording sid and refuses a blank one", () => {
    expect(transcriptKey("  RE123 ")).toBe("RE123");
    expect(transcriptKey("   ")).toBeNull();
    expect(transcriptKey(undefined)).toBeNull();
  });

  it("agrees with recordingActivity's activity id", () => {
    expect(transcriptActivityId("RE123")).toBe("dialer-RE123");
    expect(transcriptActivityId("")).toBeNull();
  });
});

describe("segmentRejection mirrors the 0021 CHECKs", () => {
  it("accepts a well-formed segment", () => {
    expect(segmentRejection(seg())).toBeNull();
  });

  it("rejects an end before the start", () => {
    expect(segmentRejection(seg({ startMs: 900, endMs: 800 }))).toBe("span");
  });

  it("allows a zero-length token — providers emit them", () => {
    expect(segmentRejection(seg({ startMs: 500, endMs: 500 }))).toBeNull();
  });

  it("rejects blank text, negative offsets, and non-integer offsets", () => {
    expect(segmentRejection(seg({ text: "   " }))).toBe("text");
    expect(segmentRejection(seg({ startMs: -1 }))).toBe("start_ms");
    expect(segmentRejection(seg({ startMs: 1.5, endMs: 2 }))).toBe("start_ms");
    expect(segmentRejection(seg({ idx: -1 }))).toBe("idx");
  });

  it("bounds confidence to 0..1", () => {
    expect(segmentRejection(seg({ confidence: 0 }))).toBeNull();
    expect(segmentRejection(seg({ confidence: 1 }))).toBeNull();
    expect(segmentRejection(seg({ confidence: 1.01 }))).toBe("confidence");
    expect(segmentRejection(seg({ confidence: Number.NaN }))).toBe("confidence");
  });
});

describe("normalizeSegments", () => {
  it("reassigns idx from time order rather than trusting the payload", () => {
    const out = normalizeSegments([
      seg({ idx: 7, startMs: 2000, endMs: 3000, text: "second" }),
      seg({ idx: 7, startMs: 0, endMs: 1000, text: "first" }),
    ]);
    // Both arrived as idx 7 — trusting it would collide on the unique index.
    expect(out.segments.map((s) => [s.idx, s.text])).toEqual([
      [0, "first"],
      [1, "second"],
    ]);
  });

  it("drops one bad segment without losing the good ones, and says which", () => {
    const out = normalizeSegments([
      seg({ idx: 0, text: "keep" }),
      seg({ idx: 1, startMs: 5, endMs: 1, text: "bad" }),
      seg({ idx: 2, startMs: 2000, endMs: 2500, text: "keep too" }),
    ]);
    expect(out.segments).toHaveLength(2);
    expect(out.rejected).toEqual([{ idx: 1, reason: "span" }]);
  });

  it("is deterministic — the same payload twice produces identical rows", () => {
    const input = [
      seg({ idx: 3, startMs: 100, endMs: 200, text: " a " }),
      seg({ idx: 1, startMs: 100, endMs: 150, text: "b", speaker: " 0 " }),
    ];
    const a = normalizeSegments(input);
    const b = normalizeSegments(input);
    expect(a).toEqual(b);
    expect(a.segments[0]).toEqual({ idx: 0, startMs: 100, endMs: 150, text: "b", speaker: "0" });
  });

  it("omits an absent confidence rather than asserting 1", () => {
    const out = normalizeSegments([seg()]);
    expect(out.segments[0].confidence).toBeUndefined();
  });
});

describe("segmentAtMs (playback sync)", () => {
  const segments = normalizeSegments([
    seg({ idx: 0, startMs: 0, endMs: 1000, text: "one" }),
    seg({ idx: 1, startMs: 2000, endMs: 3000, text: "two" }),
  ]).segments;

  it("is half-open so a boundary ms belongs to exactly one segment", () => {
    expect(segmentAtMs(segments, 999)?.text).toBe("one");
    expect(segmentAtMs(segments, 1000)).toBeNull();
    expect(segmentAtMs(segments, 2000)?.text).toBe("two");
  });

  it("returns null in a gap — silence is not the previous speaker still talking", () => {
    expect(segmentAtMs(segments, 1500)).toBeNull();
  });

  it("refuses a negative or non-finite offset", () => {
    expect(segmentAtMs(segments, -1)).toBeNull();
    expect(segmentAtMs(segments, Number.NaN)).toBeNull();
  });

  it("matches a zero-length token exactly", () => {
    const zero = [{ idx: 0, startMs: 500, endMs: 500, text: "uh" }];
    expect(segmentAtMs(zero, 500)?.text).toBe("uh");
    expect(segmentAtMs(zero, 501)).toBeNull();
  });
});

describe("transcriptRowRejection mirrors call_transcripts_status_error", () => {
  const base: CallTranscript = {
    recordingSid: "RE123",
    status: "pending",
    provider: "deepgram",
  };

  it("accepts a pending row with no error", () => {
    expect(transcriptRowRejection(base)).toBeNull();
  });

  it("refuses a failure with no reason", () => {
    expect(transcriptRowRejection({ ...base, status: "failed" })).toBe("error");
    expect(transcriptRowRejection({ ...base, status: "failed", error: "  " })).toBe("error");
    expect(transcriptRowRejection({ ...base, status: "failed", error: "429" })).toBeNull();
  });

  it("refuses a completed row that also carries an error", () => {
    expect(transcriptRowRejection({ ...base, status: "complete", error: "429" })).toBe("error");
  });

  it("refuses a blank sid, an unknown status, and a negative duration", () => {
    expect(transcriptRowRejection({ ...base, recordingSid: " " })).toBe("recording_sid");
    expect(
      transcriptRowRejection({ ...base, status: "done" as unknown as CallTranscript["status"] }),
    ).toBe("status");
    expect(transcriptRowRejection({ ...base, durationMs: -1 })).toBe("duration_ms");
    expect(transcriptRowRejection({ ...base, durationMs: 0 })).toBeNull();
  });
});
