// Q68 (c) inc.6 — the concrete Supabase TranscriptDb.
//
// What is actually at risk in this file is not logic, it is FOUR STRINGS: two conflict
// targets, a table name pair, and `gte` vs `gt`. Each of them is silent when wrong — the
// code runs, the request succeeds, and the damage shows up as duplicate transcripts or a
// stranded utterance days later. So the tests assert the request that goes out, not just
// the value that comes back.

import { describe, expect, it } from "vitest";
import {
  SEGMENT_CHUNK,
  SEGMENT_CONFLICT,
  TRANSCRIPT_CONFLICT,
  supabaseTranscriptDb,
  type TranscriptClient,
} from "../calls/transcriptDb";
import { persistTranscript, type SegmentRow, type TranscriptRow } from "../calls/transcriptStore";
import type { DeepgramMapping } from "../calls/deepgram";

type Call =
  | { op: "upsert"; table: string; rows: unknown[]; onConflict?: string; selected?: string }
  | { op: "delete"; table: string; eq: [string, unknown]; gte: [string, unknown] };

function fakeClient(opts: { id?: unknown; error?: string; failOnChunk?: number } = {}) {
  const calls: Call[] = [];
  let upserts = 0;
  const client: TranscriptClient = {
    from(table: string) {
      return {
        upsert(rows: unknown, options?: { onConflict?: string }) {
          const record: Call = {
            op: "upsert",
            table,
            rows: Array.isArray(rows) ? rows : [rows],
            onConflict: options?.onConflict,
          };
          calls.push(record);
          const n = upserts++;
          const err =
            opts.failOnChunk !== undefined && n === opts.failOnChunk
              ? { message: "boom" }
              : opts.error
                ? { message: opts.error }
                : null;
          const builder = {
            select(columns: string) {
              record.selected = columns;
              return {
                async single() {
                  return { data: err ? null : { id: opts.id ?? "t-1" }, error: err };
                },
              };
            },
            // Awaiting the upsert directly is the segment path.
            then(resolve: (v: { error: { message: string } | null }) => unknown) {
              return Promise.resolve({ error: err }).then(resolve);
            },
          };
          return builder;
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              return {
                gte(gteColumn: string, gteValue: unknown) {
                  calls.push({
                    op: "delete",
                    table,
                    eq: [column, value],
                    gte: [gteColumn, gteValue],
                  });
                  return Promise.resolve({ error: opts.error ? { message: opts.error } : null });
                },
              };
            },
          };
        },
      } as unknown as ReturnType<TranscriptClient["from"]>;
    },
  };
  return { client, calls };
}

const row: TranscriptRow = {
  recording_sid: "RE1",
  activity_id: "dialer-RE1",
  status: "complete",
  provider: "deepgram",
  model: "nova-3",
  language: "en",
  duration_ms: 1000,
  error: null,
};

function segRow(idx: number): SegmentRow {
  return {
    transcript_id: "t-1",
    idx,
    start_ms: idx * 100,
    end_ms: idx * 100 + 50,
    speaker: "0",
    text: `line ${idx}`,
    confidence: 0.9,
  };
}

describe("supabaseTranscriptDb — transcript upsert", () => {
  it("targets 0021's recording_sid unique index, not the primary key", async () => {
    // Without this, a re-POSTed Twilio webhook INSERTs and dies on 23505 forever.
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).upsertTranscript(row);
    expect(calls[0]).toMatchObject({
      op: "upsert",
      table: "call_transcripts",
      onConflict: "recording_sid",
    });
    expect(TRANSCRIPT_CONFLICT).toBe("recording_sid");
  });

  it("takes the id from the write itself rather than a second lookup", async () => {
    const { client, calls } = fakeClient({ id: "abc-123" });
    expect(await supabaseTranscriptDb(client).upsertTranscript(row)).toBe("abc-123");
    expect(calls).toHaveLength(1);
    expect((calls[0] as { selected?: string }).selected).toBe("id");
  });

  it("sends the row through unchanged — inc.5 owns the shaping", async () => {
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).upsertTranscript(row);
    expect((calls[0] as { rows: unknown[] }).rows[0]).toEqual(row);
  });

  it("rethrows PostgREST's own message so a CHECK reads differently from a timeout", async () => {
    const { client } = fakeClient({ error: "new row violates check constraint" });
    await expect(supabaseTranscriptDb(client).upsertTranscript(row)).rejects.toThrow(
      /call_transcripts upsert: new row violates check constraint/
    );
  });

  it("refuses a write that returns no id instead of keying segments on nothing", async () => {
    const { client } = fakeClient({ id: "   " });
    await expect(supabaseTranscriptDb(client).upsertTranscript(row)).rejects.toThrow(/no id/);
  });

  it("refuses a non-string id", async () => {
    const { client } = fakeClient({ id: 7 });
    await expect(supabaseTranscriptDb(client).upsertTranscript(row)).rejects.toThrow(/no id/);
  });
});

describe("supabaseTranscriptDb — segments", () => {
  it("targets the (transcript_id, idx) unique index", async () => {
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).upsertSegments([segRow(0), segRow(1)]);
    expect(calls[0]).toMatchObject({
      op: "upsert",
      table: "call_transcript_segments",
      onConflict: "transcript_id,idx",
    });
    expect(SEGMENT_CONFLICT).toBe("transcript_id,idx");
  });

  it("makes no request at all for zero segments", async () => {
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).upsertSegments([]);
    expect(calls).toHaveLength(0);
  });

  it("chunks a long call and sends every row exactly once, in order", async () => {
    const rows = Array.from({ length: SEGMENT_CHUNK * 2 + 3 }, (_, i) => segRow(i));
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).upsertSegments(rows);
    expect(calls).toHaveLength(3);
    const sent = calls.flatMap((c) => (c as { rows: unknown[] }).rows);
    expect(sent).toEqual(rows);
    expect((calls[0] as { rows: unknown[] }).rows).toHaveLength(SEGMENT_CHUNK);
    expect((calls[2] as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it("stops on a failing chunk and propagates — a partial tail is preferable to a lie", async () => {
    const rows = Array.from({ length: SEGMENT_CHUNK * 2 }, (_, i) => segRow(i));
    const { client, calls } = fakeClient({ failOnChunk: 1 });
    await expect(supabaseTranscriptDb(client).upsertSegments(rows)).rejects.toThrow(
      /call_transcript_segments upsert: boom/
    );
    expect(calls).toHaveLength(2);
  });
});

describe("supabaseTranscriptDb — prune", () => {
  it("deletes at idx >= fromIdx, scoped to the one transcript", async () => {
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).pruneSegments("t-9", 5);
    expect(calls[0]).toEqual({
      op: "delete",
      table: "call_transcript_segments",
      eq: ["transcript_id", "t-9"],
      gte: ["idx", 5],
    });
  });

  it("treats fromIdx 0 as delete-all, never as a no-op", async () => {
    // This is the failed/pending path: such a transcript must keep no words.
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).pruneSegments("t-9", 0);
    expect(calls).toHaveLength(1);
    expect((calls[0] as { gte: [string, unknown] }).gte).toEqual(["idx", 0]);
  });

  it("floors a nonsense bound at 0 rather than sending it to Postgres", async () => {
    const { client, calls } = fakeClient();
    await supabaseTranscriptDb(client).pruneSegments("t-9", -3);
    expect((calls[0] as { gte: [string, unknown] }).gte).toEqual(["idx", 0]);
  });

  it("propagates a prune failure", async () => {
    const { client } = fakeClient({ error: "timeout" });
    await expect(supabaseTranscriptDb(client).pruneSegments("t-9", 0)).rejects.toThrow(
      /call_transcript_segments prune: timeout/
    );
  });
});

describe("end to end through inc.5's persistTranscript", () => {
  const mapping = (status: "complete" | "failed", n: number): DeepgramMapping =>
    ({
      transcript: {
        recordingSid: "RE1",
        activityId: "dialer-RE1",
        status,
        provider: "deepgram",
        error: status === "failed" ? "provider 400" : undefined,
      },
      segments: Array.from({ length: n }, (_, i) => ({
        idx: i,
        startMs: i * 100,
        endMs: i * 100 + 50,
        text: `line ${i}`,
        speaker: "0",
      })),
      rejected: [],
    }) as unknown as DeepgramMapping;

  it("writes the transcript, then the segments, then prunes the tail — in that order", async () => {
    const { client, calls } = fakeClient();
    const result = await persistTranscript(supabaseTranscriptDb(client), mapping("complete", 3));
    expect(result).toMatchObject({ kind: "written", transcriptId: "t-1", segments: 3 });
    expect(calls.map((c) => `${c.op}:${c.table}`)).toEqual([
      "upsert:call_transcripts",
      "upsert:call_transcript_segments",
      "delete:call_transcript_segments",
    ]);
    // The prune bound is the NEW count: idx 3+ is the superseded tail.
    expect((calls[2] as { gte: [string, unknown] }).gte).toEqual(["idx", 3]);
  });

  it("a failed transcript writes no segments and prunes everything", async () => {
    const { client, calls } = fakeClient();
    const result = await persistTranscript(supabaseTranscriptDb(client), mapping("failed", 0));
    expect(result).toMatchObject({ kind: "written", segments: 0 });
    expect(calls.map((c) => `${c.op}:${c.table}`)).toEqual([
      "upsert:call_transcripts",
      "delete:call_transcript_segments",
    ]);
    expect((calls[1] as { gte: [string, unknown] }).gte).toEqual(["idx", 0]);
  });

  it("a rejected mapping never reaches the database", async () => {
    const { client, calls } = fakeClient();
    const bad = mapping("complete", 1);
    (bad.transcript as { recordingSid: string }).recordingSid = "  ";
    expect(await persistTranscript(supabaseTranscriptDb(client), bad)).toEqual({
      kind: "rejected",
      reason: "recording_sid",
    });
    expect(calls).toHaveLength(0);
  });
});
