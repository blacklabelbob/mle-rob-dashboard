// Q68 (c) inc.40 — the summary-backfill runner. Every rule in summaryRunner.ts is pinned here.
import { describe, expect, it, vi } from "vitest";
import {
  runSummaryBackfill,
  summaryRunLog,
  type SummaryRunnerDeps,
} from "@/lib/calls/summaryRunner";
import type { SummaryBackfillPlan, SummaryRun } from "@/lib/calls/summaryBackfill";
import type { SummarizeResult } from "@/lib/calls/summarizeCall";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";
import type { Activity } from "@/lib/types";

const activity = (id = "dialer-RE1"): Activity => ({
  id,
  personId: "p1",
  type: "call",
  source: "dialer",
  sourceContext: { recordingSid: id.replace("dialer-", "") },
  recordingUrl: "https://api.twilio.com/RE1",
  bookProtected: false,
  occurredAt: "2026-07-27T10:00:00.000Z",
  createdAt: "2026-07-27T10:00:01.000Z",
});

const run = (over: Partial<SummaryRun> = {}): SummaryRun => ({
  activityId: "dialer-RE1",
  recordingSid: "RE1",
  segments: 3,
  ...over,
});

const planned = (runs: SummaryRun[], remaining = 0): SummaryBackfillPlan => ({
  kind: "planned",
  runs,
  skipped: [],
  remaining,
});

const segs = (n: number): TranscriptSegment[] =>
  Array.from({ length: n }, (_, i) => ({
    idx: i,
    startMs: i * 1000,
    endMs: i * 1000 + 900,
    text: `line ${i}`,
  }));

const written = (): SummarizeResult => ({
  kind: "written",
  activity: activity(),
  actionItems: 2,
  buyingSignals: 1,
  truncated: false,
});

const deps = (over: Partial<SummaryRunnerDeps> = {}): SummaryRunnerDeps => ({
  loadActivity: vi.fn(async () => activity()),
  loadSegments: vi.fn(async () => segs(3)),
  summarize: vi.fn(async () => written()),
  ...over,
});

describe("runSummaryBackfill", () => {
  it("rule 1: a not-configured plan asks for nothing and keeps its shape", async () => {
    const d = deps();
    const out = await runSummaryBackfill(d, {
      kind: "not-configured",
      missing: ["ANTHROPIC_API_KEY"],
    });
    expect(out).toEqual({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] });
    expect(d.summarize).not.toHaveBeenCalled();
    expect(d.loadActivity).not.toHaveBeenCalled();
    // The log keeps the shape too — never `ran: 0`, which reads as a pass that worked.
    expect(summaryRunLog(out)).toEqual({
      kind: "not-configured",
      missing: ["ANTHROPIC_API_KEY"],
    });
  });

  it("rule 2: runs are sequential — never two model calls in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const d = deps({
      summarize: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return written();
      }),
    });
    await runSummaryBackfill(
      d,
      planned([
        run({ activityId: "a1", recordingSid: "RE1" }),
        run({ activityId: "a2", recordingSid: "RE2" }),
        run({ activityId: "a3", recordingSid: "RE3" }),
      ])
    );
    expect(maxInFlight).toBe(1);
    expect(d.summarize).toHaveBeenCalledTimes(3);
  });

  it("rule 3: one run's throw does not end the pass", async () => {
    const d = deps({
      summarize: vi.fn(async (a: Activity) => {
        if (a.id === "a2") throw new Error("anthropic 529");
        return written();
      }),
      loadActivity: vi.fn(async (id: string) => ({ ...activity(), id })),
    });
    const out = await runSummaryBackfill(
      d,
      planned([
        run({ activityId: "a1", recordingSid: "RE1" }),
        run({ activityId: "a2", recordingSid: "RE2" }),
        run({ activityId: "a3", recordingSid: "RE3" }),
      ])
    );
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes.map((o) => o.kind)).toEqual(["ran", "failed", "ran"]);
    expect(out.outcomes[1]).toMatchObject({ recordingSid: "RE2", error: "anthropic 529" });
  });

  it("rule 4: a vanished activity is its own outcome, and nothing is asked for it", async () => {
    const d = deps({ loadActivity: vi.fn(async () => null) });
    const out = await runSummaryBackfill(d, planned([run()]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0]).toEqual({
      kind: "activity-missing",
      recordingSid: "RE1",
      activityId: "dialer-RE1",
    });
    expect(d.loadSegments).not.toHaveBeenCalled();
    expect(d.summarize).not.toHaveBeenCalled();
  });

  it("rule 4: an unreadable activity store is a failure, NOT a vanished activity", async () => {
    const d = deps({
      loadActivity: vi.fn(async () => {
        throw new Error("connection terminated");
      }),
    });
    const out = await runSummaryBackfill(d, planned([run()]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0]).toMatchObject({ kind: "failed", error: "connection terminated" });
  });

  it("rule 5: vanished words are their own outcome — a model is NEVER asked for zero segments", async () => {
    const d = deps({ loadSegments: vi.fn(async () => []) });
    const out = await runSummaryBackfill(d, planned([run({ segments: 12 })]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0]).toEqual({
      kind: "segments-missing",
      recordingSid: "RE1",
      activityId: "dialer-RE1",
    });
    expect(d.summarize).not.toHaveBeenCalled();
  });

  it("rule 5: an unreadable transcript store is a failure, NOT missing words", async () => {
    const d = deps({
      loadSegments: vi.fn(async () => {
        throw new Error("0021 unavailable");
      }),
    });
    const out = await runSummaryBackfill(d, planned([run()]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0]).toMatchObject({ kind: "failed", error: "0021 unavailable" });
    expect(d.summarize).not.toHaveBeenCalled();
  });

  it("rule 6: a disabled or rejected ask counts as ran, never as written", async () => {
    const d = deps({
      loadActivity: vi.fn(async (id: string) => ({ ...activity(), id })),
      summarize: vi.fn(async (a: Activity): Promise<SummarizeResult> => {
        if (a.id === "a1") return { kind: "disabled" };
        if (a.id === "a2") return { kind: "rejected", reason: "unparseable" };
        return written();
      }),
    });
    const out = await runSummaryBackfill(
      d,
      planned([
        run({ activityId: "a1", recordingSid: "RE1" }),
        run({ activityId: "a2", recordingSid: "RE2" }),
        run({ activityId: "a3", recordingSid: "RE3" }),
      ])
    );
    const log = summaryRunLog(out);
    expect(log).toMatchObject({
      ran: 3,
      written: 1,
      summaryKinds: { disabled: 1, rejected: 1, written: 1 },
    });
  });

  it("rule 7: the words are re-read per recording, never taken from the plan's count", async () => {
    const d = deps({ loadSegments: vi.fn(async () => segs(5)) });
    // The plan says 2 — the store says 5. What is sent, and reported, is what the store holds.
    const out = await runSummaryBackfill(d, planned([run({ segments: 2 })]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(d.loadSegments).toHaveBeenCalledWith("RE1");
    expect(out.outcomes[0]).toMatchObject({ kind: "ran", segments: 5 });
    expect((d.summarize as ReturnType<typeof vi.fn>).mock.calls[0][1]).toHaveLength(5);
  });

  it("carries the plan's remaining through, so a capped pass says a second one is owed", async () => {
    const out = await runSummaryBackfill(deps(), planned([run()], 7));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.remaining).toBe(7);
    expect(summaryRunLog(out)).toMatchObject({ remaining: 7 });
  });

  it("an empty plan executes cleanly — zero is a real answer here", async () => {
    const d = deps();
    const out = await runSummaryBackfill(d, planned([]));
    expect(summaryRunLog(out)).toMatchObject({ kind: "executed", ran: 0, written: 0, failed: 0 });
    expect(d.summarize).not.toHaveBeenCalled();
  });

  it("rule 8: the log carries counts, never a word of the summary or the transcript", async () => {
    const d = deps({
      loadActivity: vi.fn(async (id: string) => ({ ...activity(), id })),
      summarize: vi.fn(async (a: Activity): Promise<SummarizeResult> => {
        if (a.id === "a2") throw new Error("model choked on: customer said they want a new roof");
        return written();
      }),
      loadSegments: vi.fn(async () => [
        { idx: 0, startMs: 0, endMs: 900, text: "we need the roof replaced by August" },
      ]),
    });
    const out = await runSummaryBackfill(
      d,
      planned([
        run({ activityId: "a1", recordingSid: "RE1" }),
        run({ activityId: "a2", recordingSid: "RE2" }),
      ])
    );
    const text = JSON.stringify(summaryRunLog(out));
    expect(text).not.toContain("roof");
    expect(text).not.toContain("customer said");
    expect(summaryRunLog(out)).toMatchObject({ ran: 1, written: 1, failed: 1, segments: 1 });
  });

  it("a written summary reports its counts, never its items", async () => {
    const out = await runSummaryBackfill(deps(), planned([run()]));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0]).toEqual({
      kind: "ran",
      recordingSid: "RE1",
      activityId: "dialer-RE1",
      summary: "written",
      segments: 3,
      actionItems: 2,
      buyingSignals: 1,
    });
  });
});
