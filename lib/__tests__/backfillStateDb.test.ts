// BUILD-QUEUE Q68 (c) inc.36 — the 0021 binding behind inc.35's evidence map.
//
// These assert the request SHAPES (what is selected, what is filtered, how many round trips)
// and the failure shapes, because every lie this file refuses looks like a plausible plan:
// an empty map re-transcribes the backlog, a zero count relabels a finished call.

import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  fetchSegmentCounts,
  fetchTranscriptStateRows,
  loadBackfillStates,
  type BackfillStateClient,
} from "@/lib/calls/backfillStateDb";
import { BACKFILL_TRANSCRIPT_COLUMNS } from "@/lib/calls/backfillState";
import { planBackfill } from "@/lib/calls/transcriptBackfill";

type Call = {
  table: string;
  columns: string;
  options?: unknown;
  filters: { op: string; column: string; value: unknown }[];
};

type Answer =
  | { rows: unknown[] }
  | { count: number | null }
  | { error: string };

/**
 * A client that records every request and replays scripted answers in order.
 *
 * Scripted per table so a test can say "the transcript read works, the count fails" without
 * counting requests by hand.
 */
function fakeClient(script: Record<string, Answer[]>) {
  const calls: Call[] = [];
  const queues: Record<string, Answer[]> = {};
  for (const [table, answers] of Object.entries(script)) queues[table] = [...answers];

  function next(table: string): Answer {
    const a = queues[table]?.shift();
    if (!a) throw new Error(`unscripted request to ${table}`);
    return a;
  }

  const client = {
    from(table: string) {
      return {
        select(columns: string, options?: unknown) {
          const call: Call = { table, columns, options, filters: [] };
          calls.push(call);
          const builder = {
            in(column: string, value: readonly string[]) {
              call.filters.push({ op: "in", column, value: [...value] });
              return builder;
            },
            eq(column: string, value: unknown) {
              call.filters.push({ op: "eq", column, value });
              return builder;
            },
            then(resolve: (v: unknown) => unknown) {
              const a = next(table);
              const err = "error" in a ? ({ message: a.error } as PostgrestError) : null;
              const data = "rows" in a ? a.rows : null;
              const count = "count" in a ? a.count : null;
              return Promise.resolve(resolve({ data, count, error: err }));
            },
          };
          return builder;
        },
      };
    },
  };

  return { client: client as unknown as BackfillStateClient, calls };
}

const SID_A = "RE00000000000000000000000000000001";
const SID_B = "RE00000000000000000000000000000002";

describe("fetchTranscriptStateRows", () => {
  it("asks for exactly inc.35's three columns and filters on recording_sid", async () => {
    const { client, calls } = fakeClient({
      call_transcripts: [{ rows: [{ id: "t1", recording_sid: SID_A, status: "complete" }] }],
    });

    const rows = await fetchTranscriptStateRows(client, [SID_A]);

    expect(rows).toHaveLength(1);
    expect(calls[0].table).toBe("call_transcripts");
    expect(calls[0].columns).toBe(BACKFILL_TRANSCRIPT_COLUMNS);
    // Pinned: no words on this read either.
    expect(calls[0].columns).not.toContain("text");
    expect(calls[0].filters).toEqual([{ op: "in", column: "recording_sid", value: [SID_A] }]);
  });

  it("chunks a long sid list and preserves order across chunks", async () => {
    const sids = Array.from({ length: 250 }, (_, i) => `RE${String(i).padStart(32, "0")}`);
    const { client, calls } = fakeClient({
      call_transcripts: [{ rows: [] }, { rows: [] }, { rows: [] }],
    });

    await fetchTranscriptStateRows(client, sids);

    expect(calls).toHaveLength(3);
    expect(calls.map((c) => (c.filters[0].value as string[]).length)).toEqual([100, 100, 50]);
    expect((calls[0].filters[0].value as string[])[0]).toBe(sids[0]);
    expect((calls[2].filters[0].value as string[]).at(-1)).toBe(sids[249]);
  });

  it("throws on a read error rather than returning no rows (rule 1)", async () => {
    const { client } = fakeClient({ call_transcripts: [{ error: "permission denied" }] });
    await expect(fetchTranscriptStateRows(client, [SID_A])).rejects.toThrow(/permission denied/);
  });
});

describe("fetchSegmentCounts", () => {
  it("counts with head:true and ships no rows (rule 2)", async () => {
    const { client, calls } = fakeClient({ call_transcript_segments: [{ count: 42 }] });

    const counts = await fetchSegmentCounts(client, ["t1"]);

    expect(counts.get("t1")).toBe(42);
    expect(calls[0].options).toEqual({ count: "exact", head: true });
    expect(calls[0].filters).toEqual([{ op: "eq", column: "transcript_id", value: "t1" }]);
  });

  it("throws when the count is absent instead of reading it as zero (rule 3)", async () => {
    const { client } = fakeClient({ call_transcript_segments: [{ count: null }] });
    await expect(fetchSegmentCounts(client, ["t1"])).rejects.toThrow(/no count returned/);
  });

  it("keeps a real zero as zero", async () => {
    const { client } = fakeClient({ call_transcript_segments: [{ count: 0 }] });
    const counts = await fetchSegmentCounts(client, ["t1"]);
    expect(counts.get("t1")).toBe(0);
  });

  it("throws on a count error (rule 1)", async () => {
    const { client } = fakeClient({ call_transcript_segments: [{ error: "boom" }] });
    await expect(fetchSegmentCounts(client, ["t1"])).rejects.toThrow(/boom/);
  });
});

describe("loadBackfillStates", () => {
  it("makes no request at all for an empty sid list (rule 5)", async () => {
    const { client, calls } = fakeClient({});
    const states = await loadBackfillStates(client, []);
    expect(states.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("skips the count pass when 0021 holds no transcript for any sid", async () => {
    const { client, calls } = fakeClient({ call_transcripts: [{ rows: [] }] });
    const states = await loadBackfillStates(client, [SID_A]);
    expect(states.size).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("builds the evidence map planBackfill consumes", async () => {
    const { client } = fakeClient({
      call_transcripts: [
        {
          rows: [
            { id: "t1", recording_sid: SID_A, status: "complete" },
            { id: "t2", recording_sid: SID_B, status: "complete" },
          ],
        },
      ],
      call_transcript_segments: [{ count: 12 }, { count: 0 }],
    });

    const states = await loadBackfillStates(client, [SID_A, SID_B]);

    expect(states.get(SID_A)).toEqual({ status: "complete", segmentCount: 12 });
    // Rule 3 of inc.35, carried through a real read: an empty complete transcript is
    // `complete-but-empty`, never a missing entry.
    expect(states.get(SID_B)).toEqual({ status: "complete", segmentCount: 0 });
  });

  it("counts one transcript once even when a sid repeats", async () => {
    const { client, calls } = fakeClient({
      call_transcripts: [{ rows: [{ id: "t1", recording_sid: SID_A, status: "complete" }] }],
      call_transcript_segments: [{ count: 5 }],
    });

    await loadBackfillStates(client, [SID_A, SID_A]);

    const counted = calls.filter((c) => c.table === "call_transcript_segments");
    expect(counted).toHaveLength(1);
  });

  it("feeds planBackfill a plan that skips the done call and re-runs the empty one", async () => {
    const { client } = fakeClient({
      call_transcripts: [
        {
          rows: [
            { id: "t1", recording_sid: SID_A, status: "complete" },
            { id: "t2", recording_sid: SID_B, status: "complete" },
          ],
        },
      ],
      call_transcript_segments: [{ count: 9 }, { count: 0 }],
    });

    const states = await loadBackfillStates(client, [SID_A, SID_B]);
    const plan = planBackfill({
      candidates: [
        {
          activityId: "a1",
          recordingSid: SID_A,
          recordingUrl: "https://x/a1",
          occurredAt: "2026-07-27T10:00:00.000Z",
        },
        {
          activityId: "a2",
          recordingSid: SID_B,
          recordingUrl: "https://x/a2",
          occurredAt: "2026-07-27T11:00:00.000Z",
        },
      ],
      transcripts: states,
      limit: 10,
    });

    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.runs.map((r) => r.recordingSid)).toEqual([SID_B]);
    expect(plan.runs[0].reason).toBe("complete-but-empty");
    expect(plan.skipped.map((s) => s.recordingSid)).toEqual([SID_A]);
  });
});
