// Q68 (c) inc.37 — the pass that joins plan + evidence + run. Every rule in backfillPass.ts
// is pinned here, and the money-shaped ones (rule 1, rule 2) are asserted as NO CALLS MADE,
// not as a returned shape: the shape is what a wrong implementation gets right by accident.
import { describe, expect, it, vi } from "vitest";
import {
  backfillCandidates,
  backfillPassLog,
  backfillSids,
  runBackfillPass,
  type BackfillPassDeps,
} from "@/lib/calls/backfillPass";
import type { CallPipelineResult } from "@/lib/calls/callPipeline";
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

const stored = (segments: number): CallPipelineResult => ({
  transcript: {
    kind: "stored",
    status: "complete",
    transcriptId: "t1",
    segments,
    words: [],
  } as unknown as CallPipelineResult["transcript"],
  summary: { kind: "skipped", reason: "disabled" } as unknown as CallPipelineResult["summary"],
});

function deps(
  activities: Activity[],
  states: Record<string, BackfillState> = {}
): BackfillPassDeps & {
  listActivities: ReturnType<typeof vi.fn>;
  loadStates: ReturnType<typeof vi.fn>;
  loadActivity: ReturnType<typeof vi.fn>;
  runPipeline: ReturnType<typeof vi.fn>;
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
    runPipeline: vi.fn(async () => stored(4)),
  } as never;
}

describe("backfillCandidates", () => {
  it("keeps dialer calls and drops everything else", () => {
    const rows = [
      call("RE1"),
      call("RE2", { id: "manual-1", source: "manual" }),
      call("RE3", { id: "note-1", type: "note" }),
    ];
    expect(backfillCandidates(rows).map((c) => c.recordingSid)).toEqual(["RE1"]);
  });
});

describe("backfillSids (rule 4)", () => {
  it("drops blank sids, dedupes, and preserves arrival order", () => {
    const rows = [call("RE2"), call("RE1", { id: "a" }), call("RE1", { id: "b" }), call("  ", { id: "c" })];
    expect(backfillSids(backfillCandidates(rows))).toEqual(["RE2", "RE1"]);
  });
});

describe("runBackfillPass", () => {
  it("rule 2: an unconfigured pass reads NOTHING — not the activities, not 0021", async () => {
    const d = deps([call("RE1")]);
    const res = await runBackfillPass(d, {
      missingConfig: ["DEEPGRAM_API_KEY"],
      execute: true,
    });

    expect(res).toEqual({ kind: "not-configured", missing: ["DEEPGRAM_API_KEY"] });
    expect(d.listActivities).not.toHaveBeenCalled();
    expect(d.loadStates).not.toHaveBeenCalled();
    expect(d.runPipeline).not.toHaveBeenCalled();
  });

  it("rule 1: execute:false plans without contacting a provider", async () => {
    const d = deps([call("RE1")]);
    const res = await runBackfillPass(d, { missingConfig: [], execute: false });

    expect(res.kind).toBe("planned");
    if (res.kind !== "planned" || res.plan.kind !== "planned") throw new Error("expected a plan");
    expect(res.plan.runs).toHaveLength(1);
    expect(d.loadStates).toHaveBeenCalledWith(["RE1"]);
    expect(d.runPipeline).not.toHaveBeenCalled();
    expect(d.loadActivity).not.toHaveBeenCalled();
  });

  it("executes only the calls that still owe words, newest first", async () => {
    const rows = [
      call("RE_OLD", { occurredAt: "2026-07-01T10:00:00.000Z" }),
      call("RE_DONE"),
      call("RE_NEW", { occurredAt: "2026-07-27T18:00:00.000Z" }),
    ];
    const d = deps(rows, { RE_DONE: { status: "complete", segmentCount: 9 } });

    const res = await runBackfillPass(d, { missingConfig: [], execute: true });

    expect(res.kind).toBe("executed");
    if (res.kind !== "executed") throw new Error("expected execution");
    expect(d.runPipeline.mock.calls.map((c) => (c[1] as { recordingSid: string }).recordingSid)).toEqual([
      "RE_NEW",
      "RE_OLD",
    ]);
    // Rule 3: what was declined survives the run.
    if (res.plan.kind !== "planned") throw new Error("expected a plan");
    expect(res.plan.skipped).toEqual([
      { activityId: "dialer-RE_DONE", recordingSid: "RE_DONE", reason: "already-transcribed" },
    ]);
    expect(res.outcome.kind).toBe("executed");
  });

  it("rule 1/3: a plan with nothing to run is `planned`, never a paid `executed`", async () => {
    const d = deps([call("RE1")], { RE1: { status: "complete", segmentCount: 3 } });
    const res = await runBackfillPass(d, { missingConfig: [], execute: true });

    expect(res.kind).toBe("planned");
    expect(d.runPipeline).not.toHaveBeenCalled();
    if (res.kind !== "planned" || res.plan.kind !== "planned") throw new Error("expected a plan");
    expect(res.plan.skipped.map((s) => s.reason)).toEqual(["already-transcribed"]);
  });

  it("rule 4: no real sid means 0021 is never asked", async () => {
    const d = deps([call("", { id: "dialer-blank", sourceContext: {} })]);
    const res = await runBackfillPass(d, { missingConfig: [], execute: true });

    expect(d.loadStates).not.toHaveBeenCalled();
    if (res.kind !== "planned" || res.plan.kind !== "planned") throw new Error("expected a plan");
    expect(res.plan.skipped.map((s) => s.reason)).toEqual(["no-recording-sid"]);
  });

  it("rule 5: a failed evidence read throws — it never becomes an empty map", async () => {
    const d = deps([call("RE1")]);
    d.loadStates.mockRejectedValueOnce(new Error("call_transcripts backfill read: boom"));

    await expect(runBackfillPass(d, { missingConfig: [], execute: true })).rejects.toThrow(
      /backfill read/
    );
    expect(d.runPipeline).not.toHaveBeenCalled();
  });

  it("rule 5: one run's failure does not end the pass", async () => {
    const rows = [
      call("RE1", { occurredAt: "2026-07-27T12:00:00.000Z" }),
      call("RE2", { occurredAt: "2026-07-27T11:00:00.000Z" }),
    ];
    const d = deps(rows);
    d.runPipeline.mockRejectedValueOnce(new Error("deepgram 429"));

    const res = await runBackfillPass(d, { missingConfig: [], execute: true });
    if (res.kind !== "executed" || res.outcome.kind !== "executed") throw new Error("expected run");
    expect(res.outcome.outcomes.map((o) => o.kind)).toEqual(["failed", "ran"]);
  });

  it("honours a cap and reports what it left behind", async () => {
    const rows = [call("RE1"), call("RE2", { occurredAt: "2026-07-26T10:00:00.000Z" })];
    const d = deps(rows);

    const res = await runBackfillPass(d, { missingConfig: [], execute: true, limit: 1 });
    if (res.kind !== "executed" || res.plan.kind !== "planned") throw new Error("expected run");
    expect(res.plan.runs).toHaveLength(1);
    expect(res.plan.remaining).toBe(1);
    expect(d.runPipeline).toHaveBeenCalledTimes(1);
  });
});

describe("backfillPassLog (rule 6)", () => {
  it("carries counts and reasons, never words", async () => {
    const d = deps([call("RE1")]);
    const res = await runBackfillPass(d, { missingConfig: [], execute: true });
    const log = backfillPassLog(res);

    expect(JSON.stringify(log)).not.toMatch(/twilio\.com|words|text/);
    expect(log).toMatchObject({ kind: "executed", run: { ran: 1, stored: 1, segments: 4 } });
  });

  it("names the missing keys on an unconfigured pass", () => {
    expect(
      backfillPassLog({ kind: "not-configured", missing: ["DEEPGRAM_API_KEY"] })
    ).toEqual({ kind: "not-configured", missing: ["DEEPGRAM_API_KEY"] });
  });
});
