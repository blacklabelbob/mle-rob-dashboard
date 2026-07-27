// Q68 (c) inc.34 — the backfill runner. Every rule in backfillRunner.ts is pinned here.
import { describe, expect, it, vi } from "vitest";
import {
  backfillErrorText,
  backfillRunLog,
  runBackfill,
  type BackfillRunnerDeps,
} from "@/lib/calls/backfillRunner";
import type { CallPipelineResult } from "@/lib/calls/callPipeline";
import type { BackfillPlan, BackfillRun } from "@/lib/calls/transcriptBackfill";
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

const run = (over: Partial<BackfillRun> = {}): BackfillRun => ({
  activityId: "dialer-RE1",
  recordingSid: "RE1",
  recordingUrl: "https://api.twilio.com/RE1",
  reason: "never-transcribed",
  ...over,
});

const planned = (runs: BackfillRun[], remaining = 0): BackfillPlan => ({
  kind: "planned",
  runs,
  skipped: [],
  remaining,
});

const stored = (segments: number): CallPipelineResult => ({
  transcript: {
    kind: "stored",
    status: "complete",
    transcriptId: "t1",
    segments,
    words: [],
  } as unknown as CallPipelineResult["transcript"],
  summary: { kind: "written", activity: activity(), actionItems: 2, buyingSignals: 1, truncated: false },
});

const disabled: CallPipelineResult = {
  transcript: { kind: "disabled" },
  summary: { kind: "disabled" },
};

const deps = (over: Partial<BackfillRunnerDeps> = {}): BackfillRunnerDeps => ({
  loadActivity: async (id) => activity(id),
  runPipeline: async () => stored(9),
  ...over,
});

describe("rule 1 — a not-configured plan executes nothing and says so", () => {
  it("returns the not-configured shape, never an executed pass with 0 runs", async () => {
    const runPipeline = vi.fn();
    const out = await runBackfill(deps({ runPipeline }), {
      kind: "not-configured",
      missing: ["DEEPGRAM_API_KEY"],
    });

    expect(out.kind).toBe("not-configured");
    expect(out).toMatchObject({ missing: ["DEEPGRAM_API_KEY"] });
    expect(runPipeline).not.toHaveBeenCalled();
    // The shape is what keeps a dead loop from reading as a clean pass.
    expect("outcomes" in out).toBe(false);
  });

  it("its log carries the missing env names, not a zero count", () => {
    expect(backfillRunLog({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] })).toEqual({
      kind: "not-configured",
      missing: ["ANTHROPIC_API_KEY"],
    });
  });
});

describe("rule 2 — runs are sequential, never fanned out", () => {
  it("never has two pipeline calls in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const runPipeline = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return stored(3);
    });

    await runBackfill(
      deps({ runPipeline }),
      planned([run(), run({ activityId: "dialer-RE2", recordingSid: "RE2" }), run({ activityId: "dialer-RE3", recordingSid: "RE3" })])
    );

    expect(runPipeline).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it("preserves the plan's newest-first order in the outcomes", async () => {
    const out = await runBackfill(
      deps(),
      planned([run({ recordingSid: "RE9", activityId: "dialer-RE9" }), run({ recordingSid: "RE1" })])
    );
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes.map((o) => o.recordingSid)).toEqual(["RE9", "RE1"]);
  });
});

describe("rule 3 — one run's failure does not end the pass", () => {
  it("records the failure against its own sid and keeps going", async () => {
    const runPipeline = vi.fn(async (_a: Activity, r: BackfillRun) => {
      if (r.recordingSid === "RE1") throw new Error("twilio media responded 404");
      return stored(4);
    });

    const out = await runBackfill(
      deps({ runPipeline }),
      planned([run(), run({ activityId: "dialer-RE2", recordingSid: "RE2" })])
    );
    if (out.kind !== "executed") throw new Error("expected executed");

    expect(out.outcomes[0]).toMatchObject({ kind: "failed", recordingSid: "RE1" });
    expect(out.outcomes[1]).toMatchObject({ kind: "ran", recordingSid: "RE2", segments: 4 });
    // The oldest broken call must not be able to block every newer one, on every pass.
    expect(runPipeline).toHaveBeenCalledTimes(2);
  });

  it("a rejected promise never escapes runBackfill", async () => {
    const out = await runBackfill(
      deps({ runPipeline: async () => Promise.reject(new Error("boom")) }),
      planned([run()])
    );
    expect(out.kind).toBe("executed");
  });
});

describe("rule 4 — an activity that is gone is not a failure", () => {
  it("reports activity-missing and requests nothing for it", async () => {
    const runPipeline = vi.fn(async () => stored(2));
    const out = await runBackfill(
      deps({ loadActivity: async () => null, runPipeline }),
      planned([run()])
    );
    if (out.kind !== "executed") throw new Error("expected executed");

    expect(out.outcomes[0]).toEqual({
      kind: "activity-missing",
      recordingSid: "RE1",
      activityId: "dialer-RE1",
    });
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("an unreadable store is a FAILURE, not a missing activity", async () => {
    const out = await runBackfill(
      deps({
        loadActivity: async () => {
          throw new Error("storage unavailable");
        },
      }),
      planned([run()])
    );
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.outcomes[0].kind).toBe("failed");
  });

  it("re-reads the activity rather than trusting the plan's snapshot", async () => {
    const loadActivity = vi.fn(async (id: string) => activity(id));
    const runPipeline = vi.fn(async (a: Activity) => {
      expect(a.id).toBe("dialer-RE7");
      return stored(1);
    });
    await runBackfill(
      deps({ loadActivity, runPipeline }),
      planned([run({ activityId: "dialer-RE7", recordingSid: "RE7" })])
    );
    expect(loadActivity).toHaveBeenCalledWith("dialer-RE7");
  });
});

describe("rule 5 — a run that stored nothing is not a success", () => {
  it("counts a disabled run as ran but never as stored", async () => {
    const out = await runBackfill(deps({ runPipeline: async () => disabled }), planned([run()]));
    if (out.kind !== "executed") throw new Error("expected executed");

    expect(out.outcomes[0]).toMatchObject({ kind: "ran", transcript: "disabled", segments: 0 });
    const log = backfillRunLog(out);
    expect(log).toMatchObject({ ran: 1, stored: 0, segments: 0 });
  });

  it("separates ran from stored across a mixed pass", async () => {
    const out = await runBackfill(
      deps({
        runPipeline: async (_a, r) => (r.recordingSid === "RE1" ? stored(6) : disabled),
      }),
      planned([run(), run({ activityId: "dialer-RE2", recordingSid: "RE2" })], 4)
    );
    if (out.kind !== "executed") throw new Error("expected executed");

    expect(backfillRunLog(out)).toMatchObject({
      kind: "executed",
      ran: 2,
      stored: 1,
      segments: 6,
      failed: 0,
      activityMissing: 0,
      transcriptKinds: { stored: 1, disabled: 1 },
      remaining: 4,
    });
  });

  it("carries the plan's remaining through so a capped pass cannot read as finished", async () => {
    const out = await runBackfill(deps(), planned([run()], 11));
    if (out.kind !== "executed") throw new Error("expected executed");
    expect(out.remaining).toBe(11);
    expect(backfillRunLog(out)).toMatchObject({ remaining: 11 });
  });
});

describe("rule 6 — the log carries counts, sids and reasons, never words", () => {
  it("never emits transcript text or summary prose", async () => {
    const out = await runBackfill(
      deps({
        runPipeline: async () => ({
          transcript: {
            kind: "stored",
            status: "complete",
            transcriptId: "t1",
            segments: 1,
            words: [{ idx: 0, startMs: 0, endMs: 10, text: "my roof is leaking badly", speaker: "0" }],
          } as unknown as CallPipelineResult["transcript"],
          summary: {
            kind: "written",
            activity: { ...activity(), summary: "Customer wants a new roof" } as Activity,
            actionItems: 1,
            buyingSignals: 1,
            truncated: false,
          },
        }),
      }),
      planned([run()])
    );
    if (out.kind !== "executed") throw new Error("expected executed");

    const text = JSON.stringify(backfillRunLog(out));
    expect(text).not.toContain("roof");
    expect(text).not.toContain("leaking");
    expect(text).toContain("segments");
  });

  it("truncates an error message and never stringifies a non-Error's contents", () => {
    expect(backfillErrorText(new Error("x".repeat(400)))).toHaveLength(201);
    expect(backfillErrorText({ body: "verbatim customer speech" })).toBe("object");
    expect(backfillErrorText(new Error("  "))).toBe("Error");
  });

  it("counts failures and missing activities without carrying their error text into totals", async () => {
    const out = await runBackfill(
      deps({
        loadActivity: async (id) => (id === "dialer-RE2" ? null : activity(id)),
        runPipeline: async () => {
          throw new Error("deepgram 429");
        },
      }),
      planned([run(), run({ activityId: "dialer-RE2", recordingSid: "RE2" })])
    );
    if (out.kind !== "executed") throw new Error("expected executed");

    expect(backfillRunLog(out)).toMatchObject({ ran: 0, failed: 1, activityMissing: 1 });
  });
});
