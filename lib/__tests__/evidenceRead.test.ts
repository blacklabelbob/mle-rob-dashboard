// BUILD-QUEUE Q68 inc.46 — the read half of the evidence report.
//
// What is worth pinning here is NOT that counting works. It is the three ways this layer
// could quietly report a call chain as unused when it is actually unreadable, truncated, or
// half-transcribed — every one of them an undercount, and an undercount on this endpoint is
// the report telling Rob to go place a call he has already placed.

import { describe, expect, it } from "vitest";
import {
  activityIdsFromSids,
  allTranscribedSids,
  evidenceSection,
  readCallEvidence,
  supabaseEvidenceSource,
  type EvidenceSource,
} from "@/lib/calls/evidenceRead";
import type { Activity } from "@/lib/types";

const call = (id: string, summary?: string): Activity =>
  ({
    id,
    type: "call",
    source: "dialer",
    occurredAt: "2026-07-28T12:00:00.000Z",
    ...(summary === undefined ? {} : { summary }),
  }) as Activity;

const source = (
  activities: Activity[],
  pages: string[][],
): EvidenceSource & { calls: number } => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    listCallActivities: async () => activities,
    fetchTranscribedSids: async () => pages[calls++] ?? [],
  };
};

describe("activityIdsFromSids — the join that 0021 does not store", () => {
  it("re-derives `dialer-<sid>`, the id recordingActivity writes", () => {
    // 0021 has no activity column; this derivation IS the foreign key. If it ever drifts
    // from `callActivityId`, every real transcript is counted as missing and the report
    // reads `timeline` forever on a chain that transcribes fine.
    expect([...activityIdsFromSids(["RE1", " RE2 "])]).toEqual(["dialer-RE1", "dialer-RE2"]);
  });

  it("drops blank sids rather than minting a `dialer-` id that matches nothing", () => {
    expect(activityIdsFromSids(["", "   "]).size).toBe(0);
  });
});

describe("allTranscribedSids — a truncated read is never a small one", () => {
  it("keeps paging past the cap instead of stopping at the first full page", () => {
    // PostgREST caps a response. An unpaged read stops counting silently, and the shortfall
    // reads as "fewer calls were transcribed" — evidence invented by omission.
    const src = source([], [["A", "B"], ["B", "C"], []]);
    return expect(allTranscribedSids(src, 2)).resolves.toEqual(["A", "B", "C"]);
  });

  it("stops on a short page without spending a request to prove it", async () => {
    const src = source([], [["A"], ["ZZ"]]);
    await expect(allTranscribedSids(src, 2)).resolves.toEqual(["A"]);
    expect(src.calls).toBe(1);
  });

  it("cannot loop forever on a backend that answers the same page", async () => {
    // `gte` re-serves the cursor row by design, so "no new ids" is the only safe stop.
    const stuck: EvidenceSource = {
      listCallActivities: async () => [],
      fetchTranscribedSids: async () => ["A", "A"],
    };
    await expect(allTranscribedSids(stuck, 2)).resolves.toEqual(["A"]);
  });
});

describe("readCallEvidence — the store's own answer, not the last increment's", () => {
  it("counts only what the transcript table actually completed", async () => {
    const ev = await readCallEvidence(
      source([call("dialer-A", "summary"), call("dialer-B"), call("dialer-C")], [["A", "B"]]),
    );
    expect(ev.counts).toEqual({ filed: 3, transcribed: 2, summarised: 1 });
    expect(ev.reach).toBe("summary");
    expect(ev.proven).toBe(true);
  });

  it("reports prod's real state — nothing filed — as `none`, not as an error", async () => {
    const ev = await readCallEvidence(source([], [[]]));
    expect(ev.reach).toBe("none");
    expect(ev.proven).toBe(false);
  });
});

describe("evidenceSection — an unreadable store is its own state", () => {
  it("degrades to `unreadable` and NEVER to `none`", async () => {
    // The whole point: a prod missing SUPABASE_SERVICE_ROLE_KEY cannot count calls, and
    // answering that with "no call has ever been filed" is this feature asserting the DoD's
    // own question as fact on zero evidence.
    const broken: EvidenceSource = {
      listCallActivities: async () => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
      },
      fetchTranscribedSids: async () => [],
    };
    const section = await evidenceSection(broken);
    expect(section.state).toBe("unreadable");
    if (section.state !== "unreadable") throw new Error("unreachable");
    expect(section.reason).toContain("SUPABASE_SERVICE_ROLE_KEY not set");
    expect(section.reason).not.toMatch(/no call has ever/i);
  });

  it("wraps a successful read without touching the verdict", async () => {
    const section = await evidenceSection(source([call("dialer-A")], [[]]));
    expect(section).toEqual({
      state: "read",
      evidence: expect.objectContaining({ reach: "timeline", proven: false }),
    });
  });
});

describe("supabaseEvidenceSource — the query is the guarantee", () => {
  const client = (rows: unknown[]) => {
    const seen: Record<string, unknown> = {};
    const builder = {
      select(columns: string) {
        seen.columns = columns;
        return builder;
      },
      eq(col: string, val: unknown) {
        seen[`eq:${col}`] = val;
        return builder;
      },
      gte(col: string, val: unknown) {
        seen[`gte:${col}`] = val;
        return builder;
      },
      order(col: string, opts: { ascending: boolean }) {
        seen.order = `${col}:${opts.ascending}`;
        return builder;
      },
      limit(n: number) {
        seen.limit = n;
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return {
      seen,
      client: { from: (t: string) => ((seen.table = t), builder) },
    };
  };

  it("filters to COMPLETE transcripts and orders server-side", async () => {
    // `failed` is a transcription that was ATTEMPTED, not words that exist — counting it
    // would advance the report to `words` on the exact evidence that Deepgram refused. And
    // the keyset cursor is only sound if the server, not the query plan, decides the order.
    const { seen, client: c } = client([{ recording_sid: "RE1" }]);
    const src = supabaseEvidenceSource(
      () => c as never,
      async () => [],
    );
    await expect(src.fetchTranscribedSids("RE0", 500)).resolves.toEqual(["RE1"]);
    expect(seen.table).toBe("call_transcripts");
    expect(seen["eq:status"]).toBe("complete");
    expect(seen["gte:recording_sid"]).toBe("RE0");
    expect(seen.order).toBe("recording_sid:true");
    expect(seen.limit).toBe(500);
  });

  it("builds the client LAZILY so a missing key lands inside the catch", async () => {
    // Eager construction would throw at the call site, 500ing the whole arming report on
    // the one deployment it exists to explain.
    let built = 0;
    const src = supabaseEvidenceSource(
      () => {
        built++;
        throw new Error("call transcripts: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
      },
      async () => [],
    );
    expect(built).toBe(0);
    const section = await evidenceSection(src);
    expect(section.state).toBe("unreadable");
  });

  it("throws on a query error instead of returning an empty page", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: null, error: { message: "timeout" } }),
              }),
            }),
          }),
        }),
      }),
    };
    const src = supabaseEvidenceSource(
      () => failing as never,
      async () => [],
    );
    await expect(src.fetchTranscribedSids("", 500)).rejects.toThrow(/timeout/);
  });
});
