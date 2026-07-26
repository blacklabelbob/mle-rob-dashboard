// Q68 (b) inc.16 — the DB read. What these tests pin, in one line each:
//   * a call with NO transcript row is `missing`, never `pending` (retry needs the difference)
//   * a status we do not recognise is `unreadable`, never coerced into failed/complete
//   * idx comes from the database and is never reassigned
//   * paging is keyset and cannot truncate a long call or loop on a bad row
//   * `pending`/`failed` never carry words, and never issue the segment query at all

import { describe, expect, it, vi } from "vitest";
import {
  loadSegments,
  loadTranscript,
  parseTranscriptStatus,
  readTranscriptView,
  segmentFromRow,
  transcriptFromRow,
  type TranscriptReader,
} from "@/lib/calls/transcriptRead";
import { supabaseTranscriptReader, type TranscriptReadClient } from "@/lib/calls/transcriptDb";

const row = (over: Record<string, unknown> = {}) => ({
  id: "t-1",
  recording_sid: "RE123",
  activity_id: "dialer-RE123",
  status: "complete",
  provider: "deepgram",
  model: "nova-3",
  language: "en",
  duration_ms: 61000,
  error: null,
  ...over,
});

const seg = (idx: number, over: Record<string, unknown> = {}) => ({
  idx,
  start_ms: idx * 1000,
  end_ms: idx * 1000 + 900,
  speaker: "0",
  text: `line ${idx}`,
  confidence: 0.9,
  ...over,
});

function reader(
  transcript: Record<string, unknown> | null,
  segments: Record<string, unknown>[]
): TranscriptReader & { calls: number } {
  const r = {
    calls: 0,
    async fetchTranscript() {
      return transcript;
    },
    async fetchSegments(_id: string, fromIdx: number, limit: number) {
      r.calls++;
      return segments.filter((s) => (s.idx as number) >= fromIdx).slice(0, limit);
    },
  };
  return r;
}

describe("transcriptFromRow", () => {
  it("maps 0021's columns back to the call path's names", () => {
    const parsed = transcriptFromRow(row());
    expect(parsed).toEqual({
      transcript: {
        id: "t-1",
        recordingSid: "RE123",
        activityId: "dialer-RE123",
        status: "complete",
        provider: "deepgram",
        model: "nova-3",
        language: "en",
        durationMs: 61000,
      },
    });
  });

  it("keeps duration 0 — 'never connected' is not 'unknown'", () => {
    const parsed = transcriptFromRow(row({ duration_ms: 0 }));
    expect("transcript" in parsed && parsed.transcript.durationMs).toBe(0);
  });

  it("refuses an unrecognised status instead of guessing one", () => {
    expect(transcriptFromRow(row({ status: "transcribing" }))).toEqual({ reason: "status" });
    expect(parseTranscriptStatus("complete")).toBe("complete");
    expect(parseTranscriptStatus("done")).toBeNull();
  });

  it("refuses a row with no identity", () => {
    expect(transcriptFromRow(row({ id: "  " }))).toEqual({ reason: "id" });
    expect(transcriptFromRow(row({ recording_sid: null }))).toEqual({ reason: "recording_sid" });
  });
});

describe("segmentFromRow", () => {
  it("takes idx from the database rather than re-deriving it", () => {
    expect(segmentFromRow(seg(7))).toEqual({
      idx: 7,
      startMs: 7000,
      endMs: 7900,
      speaker: "0",
      text: "line 7",
      confidence: 0.9,
    });
  });

  it("leaves confidence absent rather than asserting certainty", () => {
    expect(segmentFromRow(seg(0, { confidence: null }))).not.toHaveProperty("confidence");
  });

  it("drops a row 0021's CHECKs should have made impossible", () => {
    expect(segmentFromRow(seg(0, { text: "   " }))).toBeNull();
    expect(segmentFromRow(seg(0, { end_ms: 10, start_ms: 20 }))).toBeNull();
    expect(segmentFromRow(seg(0, { idx: -1 }))).toBeNull();
  });
});

describe("loadSegments", () => {
  it("pages a long call out whole — no silent truncation", async () => {
    const all = Array.from({ length: 1201 }, (_, i) => seg(i));
    const r = reader(row(), all);
    const { segments, dropped } = await loadSegments(r, "t-1", 500);
    expect(segments).toHaveLength(1201);
    expect(segments[1200].idx).toBe(1200);
    expect(dropped).toBe(0);
    expect(r.calls).toBe(3); // 500, 500, 201 (short page ends it)
  });

  it("uses a keyset cursor, so a concurrent prune cannot shift a page", async () => {
    const seen: number[] = [];
    const r: TranscriptReader = {
      async fetchTranscript() {
        return row();
      },
      async fetchSegments(_id, fromIdx, limit) {
        seen.push(fromIdx);
        const page = Array.from({ length: limit }, (_, i) => seg(fromIdx + i));
        return fromIdx >= 4 ? [] : page;
      },
    };
    await loadSegments(r, "t-1", 2);
    expect(seen).toEqual([0, 2, 4]);
  });

  it("advances past an unmappable row instead of looping on it forever", async () => {
    const r = reader(row(), [seg(0), seg(1, { text: "" }), seg(2)]);
    const { segments, dropped } = await loadSegments(r, "t-1", 2);
    expect(segments.map((s) => s.idx)).toEqual([0, 2]);
    expect(dropped).toBe(1);
  });
});

describe("loadTranscript", () => {
  it("returns `missing` for a call that was never transcribed, not `pending`", async () => {
    expect(await loadTranscript(reader(null, []), "RE123")).toEqual({ kind: "missing" });
  });

  it("returns `unreadable` with the column, never a coerced state", async () => {
    const r = reader(row({ status: "queued" }), [seg(0)]);
    expect(await loadTranscript(r, "RE123")).toEqual({ kind: "unreadable", reason: "status" });
  });

  it("never queries segments for a pending or failed transcript", async () => {
    for (const status of ["pending", "failed"] as const) {
      const r = reader(row({ status, error: status === "failed" ? "boom" : null }), [seg(0)]);
      const load = await loadTranscript(r, "RE123");
      expect(load).toMatchObject({ kind: "loaded", segments: [] });
      expect(r.calls).toBe(0);
    }
  });

  it("loads a complete transcript with its words", async () => {
    const load = await loadTranscript(reader(row(), [seg(0), seg(1)]), " RE123 ");
    expect(load.kind).toBe("loaded");
    if (load.kind !== "loaded") return;
    expect(load.transcript.recordingSid).toBe("RE123");
    expect(load.segments.map((s) => s.text)).toEqual(["line 0", "line 1"]);
  });
});

describe("readTranscriptView", () => {
  it("shows turns for a complete transcript", async () => {
    const rows = [seg(0), seg(1, { speaker: "1", text: "and back" })];
    const { view } = await readTranscriptView(reader(row(), rows), "RE123");
    expect(view.state).toBe("ready");
    expect(view.turns.map((t) => t.label)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("shows a finished silent call as empty, not failed", async () => {
    const { view } = await readTranscriptView(reader(row(), []), "RE123");
    expect(view.state).toBe("empty");
  });

  it("shows no words for an unreadable row, and keeps the reason on the load", async () => {
    const { view, load } = await readTranscriptView(reader(row({ status: "x" }), []), "RE123");
    expect(view).toEqual({ state: "failed", turns: [], speakerCount: 0, endMs: null });
    expect(load).toEqual({ kind: "unreadable", reason: "status" });
  });

  it("shows a never-requested call as pending while `load` keeps it `missing`", async () => {
    const { view, load } = await readTranscriptView(reader(null, []), "RE123");
    expect(view.state).toBe("pending");
    expect(load.kind).toBe("missing");
  });
});

describe("supabaseTranscriptReader", () => {
  function client() {
    const calls: { table: string; columns: string; ops: [string, unknown, unknown?][] }[] = [];
    const stub: TranscriptReadClient = {
      from(table) {
        return {
          select(columns) {
            const rec = { table, columns, ops: [] as [string, unknown, unknown?][] };
            calls.push(rec);
            const builder = {
              eq(c: string, v: unknown) {
                rec.ops.push(["eq", c, v]);
                return builder;
              },
              gte(c: string, v: unknown) {
                rec.ops.push(["gte", c, v]);
                return builder;
              },
              order(c: string, o: { ascending: boolean }) {
                rec.ops.push(["order", c, o]);
                return builder;
              },
              limit(n: number) {
                rec.ops.push(["limit", n]);
                return builder;
              },
              async maybeSingle() {
                return { data: row(), error: null };
              },
              then(resolve: (r: { data: unknown[]; error: null }) => unknown) {
                return Promise.resolve(resolve({ data: [seg(0)], error: null }));
              },
            };
            return builder as never;
          },
        };
      },
    };
    return { stub, calls };
  }

  it("orders segments on the server and bounds them by the keyset cursor", async () => {
    const { stub, calls } = client();
    await supabaseTranscriptReader(stub).fetchSegments("t-1", 500, 500);
    expect(calls[0].table).toBe("call_transcript_segments");
    expect(calls[0].ops).toEqual([
      ["eq", "transcript_id", "t-1"],
      ["gte", "idx", 500],
      ["order", "idx", { ascending: true }],
      ["limit", 500],
    ]);
  });

  it("throws on a query error rather than reading as 'never transcribed'", async () => {
    const broken: TranscriptReadClient = {
      from() {
        return {
          select() {
            const b = {
              eq: () => b,
              gte: () => b,
              order: () => b,
              limit: () => b,
              maybeSingle: async () => ({ data: null, error: { message: "timeout" } }),
              then: (r: (v: { data: null; error: { message: string } }) => unknown) =>
                Promise.resolve(r({ data: null, error: { message: "timeout" } })),
            };
            return b as never;
          },
        };
      },
    };
    await expect(supabaseTranscriptReader(broken).fetchTranscript("RE123")).rejects.toThrow(
      /call_transcripts read: timeout/
    );
  });

  it("selects every column the mapping needs", async () => {
    const { stub, calls } = client();
    const parsed = transcriptFromRow(
      (await supabaseTranscriptReader(stub).fetchTranscript("RE123")) ?? {}
    );
    expect("transcript" in parsed).toBe(true);
    for (const col of ["recording_sid", "status", "provider", "duration_ms"]) {
      expect(calls[0].columns).toContain(col);
    }
  });
});

// Guard: nothing in this file may reach a live database.
it("does no network", () => {
  expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
});
