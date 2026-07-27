// Q68 (c) inc.41 — the pass that joins the summary plan to its executor. Every rule in
// summaryPass.ts is pinned here, and the money-shaped ones (rule 1, rule 2) are asserted as
// NO CALLS MADE, not as a returned shape: the shape is what a wrong implementation gets
// right by accident.
import { describe, expect, it, vi } from "vitest";
import {
  runSummaryPass,
  summaryCandidates,
  summaryPassLog,
  type SummaryPassDeps,
} from "@/lib/calls/summaryPass";
import type { SummarizeResult } from "@/lib/calls/summarizeCall";
import type { TranscriptSegment } from "@/lib/calls/transcriptSegments";
import type { BackfillState } from "@/lib/calls/transcriptBackfill";
import type { Activity } from "@/lib/types";

const call = (sid: string, over: Partial<Activity> = {}): Activity => ({
  id: `dialer-${sid}`,
  personId: "p1",
  type: "call",
  source: "dialer",
  sourceContext: { recordingSid: sid },
  recordingUrl: `https://api.twilio.com/${sid}`,
  bookProtected: false,
  occurredAt: "2026-07-27T10:00:00.000Z",
  createdAt: "2026-07-27T10:00:01.000Z",
  ...over,
});

const segs = (n: number): TranscriptSegment[] =>
  Array.from({ length: n }, (_, i) => ({
    speaker: i % 2 === 0 ? "rep" : "contact",
    text: `line ${i}`,
    startMs: i * 1000,
    endMs: i * 1000 + 900,
  })) as unknown as TranscriptSegment[];

const written = (): SummarizeResult =>
  ({ kind: "written", actionItems: 2, buyingSignals: 1 }) as unknown as SummarizeResult;

const complete = (segmentCount: number): BackfillState => ({
  status: "complete" as BackfillState["status"],
  segmentCount,
});

function deps(
  activities: Activity[],
  states: Record<string, BackfillState> = {}
): SummaryPassDeps & {
  listActivities: ReturnType<typeof vi.fn>;
  loadStates: ReturnType<typeof vi.fn>;
  loadActivity: ReturnType<typeof vi.fn>;
  loadSegments: ReturnType<typeof vi.fn>;
  summarize: ReturnType<typeof vi.fn>;
} {
  return {
    listActivities: vi.fn(async () => activities),
    loadStates: vi.fn(async (sids: readonly string[]) => {
      const map = new Map<string, BackfillState>();
      for (const sid of sids) {
        const s = states[sid];
        if (s) map.set(sid, s);
      }
      return map as ReadonlyMap<string, BackfillState>;
    }),
    loadActivity: vi.fn(async (id: string) => activities.find((a) => a.id === id) ?? null),
    loadSegments: vi.fn(async () => segs(3)),
    summarize: vi.fn(async () => written()),
  } as never;
}

describe("summaryCandidates", () => {
  it("keeps dialer calls and drops everything else", () => {
    const rows = [
      call("RE1"),
      call("RE2", { id: "manual-1", source: "manual" }),
      call("RE3", { id: "note-1", type: "note" }),
    ];
    expect(summaryCandidates(rows).map((c) => c.activityId)).toEqual(["dialer-RE1"]);
  });
});

describe("runSummaryPass — rule 2: an unconfigured pass asks the database nothing", () => {
  it("short-circuits before the activity read", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    const result = await runSummaryPass(d, {
      missingConfig: ["ANTHROPIC_API_KEY"],
      execute: true,
    });

    expect(result).toEqual({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] });
    expect(d.listActivities).not.toHaveBeenCalled();
    expect(d.loadStates).not.toHaveBeenCalled();
    expect(d.summarize).not.toHaveBeenCalled();
  });
});

describe("runSummaryPass — rule 1: execution is never a default", () => {
  it("plans without asking the model when execute is false", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    const result = await runSummaryPass(d, { missingConfig: [], execute: false });

    expect(result.kind).toBe("planned");
    if (result.kind !== "planned") throw new Error("unreachable");
    expect(result.plan.kind).toBe("planned");
    if (result.plan.kind !== "planned") throw new Error("unreachable");
    expect(result.plan.runs.map((r) => r.recordingSid)).toEqual(["RE1"]);
    expect(d.summarize).not.toHaveBeenCalled();
    expect(d.loadSegments).not.toHaveBeenCalled();
  });

  it("spends only when execute is true", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    const result = await runSummaryPass(d, { missingConfig: [], execute: true });

    expect(result.kind).toBe("executed");
    if (result.kind !== "executed") throw new Error("unreachable");
    expect(d.summarize).toHaveBeenCalledTimes(1);
    expect(result.outcome.kind).toBe("executed");
  });
});

describe("runSummaryPass — rule 3: the plan survives execution", () => {
  it("carries the skip reasons alongside the outcomes", async () => {
    const rows = [
      call("RE1"), // owed
      call("RE2", { id: "dialer-RE2", summary: "already done" }), // already-summarised
      call("RE3", { id: "dialer-RE3" }), // never-transcribed
    ];
    const d = deps(rows, { RE1: complete(4), RE2: complete(2) });
    const result = await runSummaryPass(d, { missingConfig: [], execute: true });

    if (result.kind !== "executed") throw new Error("expected executed");
    if (result.plan.kind !== "planned") throw new Error("expected planned");
    expect(result.plan.skipped.map((s) => s.reason).sort()).toEqual([
      "already-summarised",
      "never-transcribed",
    ]);
  });

  it("does not call an execution 'executed' when the plan has nothing to run", async () => {
    const d = deps([call("RE1", { summary: "done" })], { RE1: complete(4) });
    const result = await runSummaryPass(d, { missingConfig: [], execute: true });

    expect(result.kind).toBe("planned");
    expect(d.summarize).not.toHaveBeenCalled();
  });
});

describe("runSummaryPass — rule 4: 0021 is asked only about sids that exist, each once", () => {
  it("drops blanks, collapses duplicates, and skips the read entirely when nothing is left", async () => {
    const rows = [
      call("RE1"),
      call("RE1", { id: "dialer-dup" }),
      call("", { id: "dialer-nosid", sourceContext: {} }),
    ];
    const d = deps(rows, { RE1: complete(4) });
    await runSummaryPass(d, { missingConfig: [], execute: false });
    expect(d.loadStates).toHaveBeenCalledWith(["RE1"]);

    const empty = deps([call("", { id: "dialer-nosid", sourceContext: {} })]);
    await runSummaryPass(empty, { missingConfig: [], execute: false });
    expect(empty.loadStates).not.toHaveBeenCalled();
  });
});

describe("runSummaryPass — rule 5: nothing is caught here", () => {
  it("lets a failed activity read throw", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    d.listActivities.mockRejectedValueOnce(new Error("store down"));
    await expect(runSummaryPass(d, { missingConfig: [], execute: true })).rejects.toThrow(
      "store down"
    );
  });

  it("lets a failed 0021 read throw", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    d.loadStates.mockRejectedValueOnce(new Error("0021 down"));
    await expect(runSummaryPass(d, { missingConfig: [], execute: true })).rejects.toThrow(
      "0021 down"
    );
  });

  it("still contains a per-run failure one layer down", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    d.summarize.mockRejectedValueOnce(new Error("anthropic 529"));
    const result = await runSummaryPass(d, { missingConfig: [], execute: true });

    if (result.kind !== "executed") throw new Error("expected executed");
    if (result.outcome.kind !== "executed") throw new Error("expected executed outcome");
    expect(result.outcome.outcomes[0].kind).toBe("failed");
  });
});

describe("runSummaryPass — the limit is carried, not re-invented", () => {
  it("caps the runs and reports the remainder", async () => {
    const rows = [
      call("RE1", { occurredAt: "2026-07-27T12:00:00.000Z" }),
      call("RE2", { id: "dialer-RE2", occurredAt: "2026-07-27T11:00:00.000Z" }),
    ];
    const d = deps(rows, { RE1: complete(4), RE2: complete(2) });
    const result = await runSummaryPass(d, { missingConfig: [], execute: true, limit: 1 });

    if (result.kind !== "executed") throw new Error("expected executed");
    if (result.outcome.kind !== "executed") throw new Error("expected executed outcome");
    // Newest first (inc.39 rule 5): RE1 ran, RE2 waits.
    expect(result.outcome.outcomes.map((o) => o.recordingSid)).toEqual(["RE1"]);
    expect(result.outcome.remaining).toBe(1);
    expect(d.summarize).toHaveBeenCalledTimes(1);
  });
});

describe("summaryPassLog — rule 6: counts and reasons, never words", () => {
  it("projects an unconfigured pass as its own shape", () => {
    expect(summaryPassLog({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] })).toEqual({
      kind: "not-configured",
      missing: ["ANTHROPIC_API_KEY"],
    });
  });

  it("carries no summary prose out of an executed pass", async () => {
    const d = deps([call("RE1")], { RE1: complete(4) });
    d.summarize.mockResolvedValueOnce({
      kind: "written",
      actionItems: 1,
      buyingSignals: 0,
      summary: "the customer wants a new roof by Friday",
    } as unknown as SummarizeResult);
    const result = await runSummaryPass(d, { missingConfig: [], execute: true });

    const log = summaryPassLog(result);
    expect(JSON.stringify(log)).not.toContain("new roof");
    expect(log).toMatchObject({ kind: "executed" });
    expect((log.run as Record<string, unknown>).written).toBe(1);
    expect((log.plan as Record<string, unknown>).kind).toBe("planned");
  });
});
