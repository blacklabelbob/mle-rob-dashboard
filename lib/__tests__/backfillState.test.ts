// Q68 (c) inc.35 — the evidence read behind planBackfill. Every rule in backfillState.ts
// is pinned here, and the rules that matter are pinned THROUGH planBackfill: a state map
// that is subtly wrong reads as a plausible plan, so the tests assert the reason the plan
// ends up with, not just the map.
import { describe, expect, it } from "vitest";
import {
  BACKFILL_SEGMENT_COLUMNS,
  BACKFILL_SID_CHUNK,
  BACKFILL_TRANSCRIPT_COLUMNS,
  backfillStates,
  chunkRecordingSids,
  tallySegmentCounts,
  transcriptIdsToCount,
  transcriptStateRow,
} from "@/lib/calls/backfillState";
import { planBackfill, type BackfillCandidate } from "@/lib/calls/transcriptBackfill";

const tRow = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  recording_sid: "RE1",
  status: "complete",
  ...over,
});

const candidate = (over: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  activityId: "dialer-RE1",
  recordingSid: "RE1",
  recordingUrl: "https://api.twilio.com/RE1",
  occurredAt: "2026-07-27T10:00:00.000Z",
  ...over,
});

describe("rule 1 — count without words", () => {
  it("never asks for segment text", () => {
    // The absence of `text` IS the rule. If a later edit widens this list, this fails.
    expect(BACKFILL_SEGMENT_COLUMNS).toBe("transcript_id");
    expect(BACKFILL_SEGMENT_COLUMNS).not.toMatch(/text|speaker|confidence/);
  });

  it("asks the transcript read for exactly what the plan needs", () => {
    expect(BACKFILL_TRANSCRIPT_COLUMNS).toBe("id,recording_sid,status");
  });
});

describe("rule 2 — an unreadable row is not a transcribed call", () => {
  it("keeps a well-formed row", () => {
    expect(transcriptStateRow(tRow())).toEqual({
      transcriptId: "t1",
      recordingSid: "RE1",
      status: "complete",
    });
  });

  it("trims the sid and the id rather than keying on whitespace", () => {
    expect(transcriptStateRow(tRow({ id: " t1 ", recording_sid: " RE1 " }))).toEqual({
      transcriptId: "t1",
      recordingSid: "RE1",
      status: "complete",
    });
  });

  it.each([
    ["no id", { id: "" }],
    ["blank id", { id: "   " }],
    ["no sid", { recording_sid: null }],
    ["blank sid", { recording_sid: "  " }],
    ["a status 0021 could not have produced", { status: "transcribing" }],
    ["a missing status", { status: undefined }],
    ["a non-string status", { status: 3 }],
  ])("drops a row with %s", (_label, over) => {
    expect(transcriptStateRow(tRow(over))).toBeNull();
  });

  it("makes the dropped row read as never-transcribed, not as done", () => {
    // The trade, stated in the file: a re-run costs money, being silently marked done
    // costs a call nobody ever repairs.
    const states = backfillStates([tRow({ status: "bogus" })], []);
    expect(states.size).toBe(0);
    const plan = planBackfill({ candidates: [candidate()], transcripts: states });
    expect(plan.kind === "planned" && plan.runs[0].reason).toBe("never-transcribed");
  });
});

describe("rule 3 — zero segments is a real answer", () => {
  it("maps a transcript with no segment rows to 0, not to an absence", () => {
    const states = backfillStates([tRow()], []);
    expect(states.get("RE1")).toEqual({ status: "complete", segmentCount: 0 });
  });

  it("gives inc.33 complete-but-empty rather than never-transcribed", () => {
    const plan = planBackfill({
      candidates: [candidate()],
      transcripts: backfillStates([tRow()], []),
    });
    expect(plan.kind === "planned" && plan.runs[0].reason).toBe("complete-but-empty");
  });

  it("counts the segments a transcript does have", () => {
    const states = backfillStates([tRow()], [
      { transcript_id: "t1" },
      { transcript_id: "t1" },
      { transcript_id: "t1" },
    ]);
    expect(states.get("RE1")).toEqual({ status: "complete", segmentCount: 3 });
  });

  it("declines a complete transcript that really does have words", () => {
    const plan = planBackfill({
      candidates: [candidate()],
      transcripts: backfillStates([tRow()], [{ transcript_id: "t1" }]),
    });
    expect(plan.kind === "planned" && plan.skipped[0].reason).toBe("already-transcribed");
  });

  it("never attributes another transcript's segments", () => {
    const states = backfillStates(
      [tRow(), tRow({ id: "t2", recording_sid: "RE2" })],
      [{ transcript_id: "t2" }, { transcript_id: "t2" }]
    );
    expect(states.get("RE1")?.segmentCount).toBe(0);
    expect(states.get("RE2")?.segmentCount).toBe(2);
  });

  it("ignores a segment row with no usable transcript id", () => {
    expect(tallySegmentCounts([{ transcript_id: "" }, { transcript_id: null }, {}])).toEqual(
      new Map()
    );
  });

  it("trims a transcript id before tallying so one id is not counted as two", () => {
    expect(tallySegmentCounts([{ transcript_id: "t1" }, { transcript_id: " t1 " }])).toEqual(
      new Map([["t1", 2]])
    );
  });
});

describe("pending and failed states reach the plan intact", () => {
  it("keeps a pending transcript in-flight rather than racing it", () => {
    const plan = planBackfill({
      candidates: [candidate()],
      transcripts: backfillStates([tRow({ status: "pending" })], []),
    });
    expect(plan.kind === "planned" && plan.skipped[0].reason).toBe("in-flight");
  });

  it("re-runs a failed transcript with its own reason", () => {
    const plan = planBackfill({
      candidates: [candidate()],
      transcripts: backfillStates([tRow({ status: "failed" })], []),
    });
    expect(plan.kind === "planned" && plan.runs[0].reason).toBe("failed");
  });
});

describe("rule 4 — sids travel chunked", () => {
  it("keeps a small list in one request", () => {
    expect(chunkRecordingSids(["RE1", "RE2"])).toEqual([["RE1", "RE2"]]);
  });

  it("splits at the chunk size and preserves newest-first order across chunks", () => {
    const sids = Array.from({ length: 5 }, (_, i) => `RE${i}`);
    expect(chunkRecordingSids(sids, 2)).toEqual([
      ["RE0", "RE1"],
      ["RE2", "RE3"],
      ["RE4"],
    ]);
  });

  it("dedupes before chunking so one sid never costs two rows", () => {
    expect(chunkRecordingSids(["RE1", "RE1", " RE1 ", "RE2"])).toEqual([["RE1", "RE2"]]);
  });

  it("drops blanks rather than spending a round trip on in.(\"\")", () => {
    expect(chunkRecordingSids(["", "   ", "RE1"])).toEqual([["RE1"]]);
    expect(chunkRecordingSids([])).toEqual([]);
    expect(chunkRecordingSids(["", "  "])).toEqual([]);
  });

  it("never emits a zero-sized chunk even if asked for one", () => {
    expect(chunkRecordingSids(["RE1", "RE2"], 0)).toEqual([["RE1"], ["RE2"]]);
  });

  it("chunks at a size that fits a URL", () => {
    expect(BACKFILL_SID_CHUNK).toBe(100);
  });
});

describe("rule 5 — the first row for a sid wins and is not merged", () => {
  it("keeps the first row and ignores the impossible duplicate", () => {
    const states = backfillStates(
      [tRow({ id: "t1", status: "failed" }), tRow({ id: "t2", status: "complete" })],
      [{ transcript_id: "t2" }, { transcript_id: "t2" }]
    );
    expect(states.size).toBe(1);
    // Not `complete`, and NOT a merged segmentCount of 2 — a summed count would make a
    // broken unique index read as a healthy transcript.
    expect(states.get("RE1")).toEqual({ status: "failed", segmentCount: 0 });
  });
});

describe("transcriptIdsToCount", () => {
  it("returns the ids of usable rows, in order, deduped", () => {
    expect(
      transcriptIdsToCount([
        tRow(),
        tRow({ id: "t2", recording_sid: "RE2" }),
        tRow({ id: " t1 ", recording_sid: "RE3" }),
        tRow({ status: "nope", id: "t9" }),
      ])
    ).toEqual(["t1", "t2"]);
  });

  it("is empty when nothing was read", () => {
    expect(transcriptIdsToCount([])).toEqual([]);
  });
});
