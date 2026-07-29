// Q71 Phase 4 items 2-4: the plan/verify verdicts, graded without Supabase.
//
// Every fixture below is INVENTED. The 13 real exports are gitignored precisely because they
// carry real names, so a suite pasted from them would commit the thing Q71 exists to remove
// and `guard:pii` would be right to fail it. Speaker names here are single letters.

import { describe, expect, it } from "vitest";
import { planTranscriptLoad, verifyLoad, type LoadPlan } from "../calls/transcriptLoadPlan";

function sentence(start: number, end: number, text: string, speaker = "A") {
  return { start_time: start, end_time: end, raw_text: text, speaker_name: speaker };
}

const TWO = {
  id: "01TEST0000000000000000001",
  sentences: [sentence(0, 1.5, "first"), sentence(1.5, 3, "second", "B")],
};
const ONE = { id: "01TEST0000000000000000002", sentences: [sentence(0, 2, "only")] };

describe("planTranscriptLoad", () => {
  it("counts disk sentences and writable segments per file", () => {
    const plan = planTranscriptLoad([
      { source: "a.json", data: TWO },
      { source: "b.json", data: ONE },
    ]);
    expect(plan.loadable).toBe(2);
    expect(plan.skipped).toBe(0);
    expect(plan.segments).toBe(3);
    expect(plan.entries[0]).toMatchObject({ source: "a.json", sentences: 2, segments: 2 });
    expect(plan.entries[0].recordingSid).toBe("fireflies-01TEST0000000000000000001");
  });

  it("skips a file with no id instead of loading it under a fresh key", () => {
    // The whole idempotency story rests on the key being derived from the file. A file
    // without one cannot be re-run safely, so it must not be run at all.
    const plan = planTranscriptLoad([{ source: "bad.json", data: { sentences: [sentence(0, 1, "x")] } }]);
    expect(plan.entries[0]).toMatchObject({ skipped: "no id", recordingSid: null, segments: 0 });
    expect(plan.loadable).toBe(0);
    expect(plan.skipped).toBe(1);
    expect(plan.segments).toBe(0);
  });

  it("survives an unreadable file (null data) as a skip, not a throw", () => {
    const plan = planTranscriptLoad([{ source: "corrupt.json", data: null }]);
    expect(plan.entries[0].skipped).toBe("no id");
    expect(plan.loadable).toBe(0);
  });

  it("reports sentences that normalizeSegments refused, rather than hiding the gap", () => {
    // A sentence with no text is unstorable; the plan must show 2 -> 1 so the shortfall is
    // visible BEFORE the write, not discovered as a count mismatch afterwards.
    const plan = planTranscriptLoad([
      { source: "c.json", data: { id: "01TEST0000000000000000003", sentences: [sentence(0, 1, "kept"), sentence(1, 2, "   ")] } },
    ]);
    expect(plan.entries[0].sentences).toBe(2);
    expect(plan.entries[0].segments).toBe(1);
    expect(plan.entries[0].rejected).toBe(1);
    expect(plan.rejected).toBe(1);
  });

  it("keeps an empty meeting loadable with zero segments", () => {
    // Matches the mapper's DECISION 5: emptiness is a fact about the meeting, visible in
    // the count — not a reason to refuse the transcript row.
    const plan = planTranscriptLoad([{ source: "d.json", data: { id: "01TEST0000000000000000004", sentences: [] } }]);
    expect(plan.loadable).toBe(1);
    expect(plan.entries[0].segments).toBe(0);
  });
});

describe("verifyLoad", () => {
  const plan: LoadPlan = planTranscriptLoad([
    { source: "a.json", data: TWO },
    { source: "b.json", data: ONE },
  ]);

  it("reports N/N match when the database agrees", () => {
    const report = verifyLoad(plan, [
      { recordingSid: "fireflies-01TEST0000000000000000001", segments: 2 },
      { recordingSid: "fireflies-01TEST0000000000000000002", segments: 1 },
    ]);
    expect(report.ok).toBe(true);
    expect(report.summary).toBe("2/2 match");
  });

  it("distinguishes a missing row from a short one", () => {
    const report = verifyLoad(plan, [
      { recordingSid: "fireflies-01TEST0000000000000000001", segments: null },
      { recordingSid: "fireflies-01TEST0000000000000000002", segments: 0 },
    ]);
    expect(report.ok).toBe(false);
    expect(report.rows[0].detail).toBe("no transcript row");
    // 0 found where 1 was expected is a LOAD that lost rows — a different failure from a
    // load that never happened, and it must not be reported as the same thing.
    expect(report.rows[1].detail).toBe("expected 1, found 0");
    expect(report.summary).toBe("0/2 match");
  });

  it("treats a never-queried sid as absent, never as zero segments", () => {
    const report = verifyLoad(plan, [{ recordingSid: "fireflies-01TEST0000000000000000001", segments: 2 }]);
    expect(report.rows[1]).toMatchObject({ actual: null, ok: false, detail: "no transcript row" });
  });

  it("does not count skipped files against the load", () => {
    const withSkip = planTranscriptLoad([
      { source: "a.json", data: TWO },
      { source: "bad.json", data: { sentences: [] } },
    ]);
    const report = verifyLoad(withSkip, [{ recordingSid: "fireflies-01TEST0000000000000000001", segments: 2 }]);
    expect(report.total).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("refuses to call an empty plan a pass", () => {
    // 0/0 is the shape a broken directory read takes. A green check there would hide the
    // one failure mode this verifier exists to catch.
    const report = verifyLoad(planTranscriptLoad([]), []);
    expect(report.ok).toBe(false);
    expect(report.summary).toBe("0/0 match");
  });

  it("is non-vacuous: the fixtures really do exercise differing counts", () => {
    expect(plan.entries.map((e) => e.segments)).toEqual([2, 1]);
  });
});
