// Q68 (c) inc.33 — the backfill plan. Every rule in transcriptBackfill.ts is pinned here.
import { describe, expect, it } from "vitest";
import {
  backfillCandidate,
  backfillPlanLog,
  backfillReason,
  planBackfill,
  type BackfillCandidate,
  type BackfillState,
} from "@/lib/calls/transcriptBackfill";
import type { Activity } from "@/lib/types";

const cand = (over: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  activityId: "dialer-RE1",
  recordingSid: "RE1",
  recordingUrl: "https://api.twilio.com/RE1",
  occurredAt: "2026-07-27T10:00:00.000Z",
  ...over,
});

const states = (entries: Record<string, BackfillState>) => new Map(Object.entries(entries));

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "dialer-RE1",
  personId: "p1",
  type: "call",
  source: "dialer",
  sourceContext: { recordingSid: "RE1" },
  recordingUrl: "https://api.twilio.com/RE1",
  bookProtected: false,
  occurredAt: "2026-07-27T10:00:00.000Z",
  createdAt: "2026-07-27T10:00:01.000Z",
  ...over,
});

describe("planBackfill — rule 1: unconfigured is not 'nothing to do'", () => {
  it("returns not-configured with the missing names, never an empty run list", () => {
    const plan = planBackfill({
      candidates: [cand()],
      transcripts: states({}),
      missingConfig: ["DEEPGRAM_API_KEY"],
    });
    expect(plan.kind).toBe("not-configured");
    if (plan.kind !== "not-configured") throw new Error("unreachable");
    expect(plan.missing).toEqual(["DEEPGRAM_API_KEY"]);
    // The shape itself is the guarantee: an unconfigured plan cannot carry runs.
    expect("runs" in plan).toBe(false);
  });

  it("an empty missingConfig is configured", () => {
    const plan = planBackfill({ candidates: [cand()], transcripts: states({}), missingConfig: [] });
    expect(plan.kind).toBe("planned");
  });
});

describe("planBackfill — what still owes words", () => {
  it("never transcribed → runs", () => {
    const plan = planBackfill({ candidates: [cand()], transcripts: states({}) });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([
      {
        activityId: "dialer-RE1",
        recordingSid: "RE1",
        recordingUrl: "https://api.twilio.com/RE1",
        reason: "never-transcribed",
      },
    ]);
    expect(plan.remaining).toBe(0);
  });

  it("failed → runs (the whole point of a backfill)", () => {
    const plan = planBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "failed", segmentCount: 0 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs[0].reason).toBe("failed");
  });

  it("rule 3: complete WITH ZERO segments is not done — 'transcribed, said nothing' re-runs", () => {
    const plan = planBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "complete", segmentCount: 0 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs[0].reason).toBe("complete-but-empty");
    expect(plan.skipped).toEqual([]);
  });

  it("complete with words is skipped, not re-billed", () => {
    const plan = planBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "complete", segmentCount: 12 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([]);
    expect(plan.skipped[0].reason).toBe("already-transcribed");
  });

  it("rule 4: pending is skipped as in-flight, never raced", () => {
    const plan = planBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "pending", segmentCount: 0 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([]);
    expect(plan.skipped[0].reason).toBe("in-flight");
  });
});

describe("planBackfill — rule 2: no invented identity, no empty media", () => {
  it("a call with no recording sid is declined by name", () => {
    const plan = planBackfill({
      candidates: [cand({ recordingSid: "  " })],
      transcripts: states({}),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([]);
    expect(plan.skipped[0]).toEqual({
      activityId: "dialer-RE1",
      recordingSid: null,
      reason: "no-recording-sid",
    });
  });

  it("a call with no media url is declined by name", () => {
    const plan = planBackfill({
      candidates: [cand({ recordingUrl: null })],
      transcripts: states({}),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.skipped[0].reason).toBe("no-recording-url");
  });

  it("an already-transcribed call with a lost url reads as done, not as a missing url", () => {
    const plan = planBackfill({
      candidates: [cand({ recordingUrl: null })],
      transcripts: states({ RE1: { status: "complete", segmentCount: 3 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.skipped[0].reason).toBe("already-transcribed");
  });
});

describe("planBackfill — rule 5: one sid runs once per pass", () => {
  it("the later duplicate is declined rather than queued beside its twin", () => {
    const plan = planBackfill({
      candidates: [
        cand({ activityId: "a", occurredAt: "2026-07-27T10:00:00.000Z" }),
        cand({ activityId: "b", occurredAt: "2026-07-27T09:00:00.000Z" }),
      ],
      transcripts: states({}),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs.map((r) => r.activityId)).toEqual(["a"]);
    expect(plan.skipped).toEqual([
      { activityId: "b", recordingSid: "RE1", reason: "duplicate-recording-sid" },
    ]);
  });
});

describe("planBackfill — ordering and rule 6: a cap is reported", () => {
  it("newest first, tie-broken by id so a capped pass is stable across runs", () => {
    const plan = planBackfill({
      candidates: [
        cand({ activityId: "old", recordingSid: "RE-old", recordingUrl: "u", occurredAt: "2026-01-01T00:00:00.000Z" }),
        cand({ activityId: "zz", recordingSid: "RE-zz", recordingUrl: "u", occurredAt: "2026-07-27T10:00:00.000Z" }),
        cand({ activityId: "aa", recordingSid: "RE-aa", recordingUrl: "u", occurredAt: "2026-07-27T10:00:00.000Z" }),
      ],
      transcripts: states({}),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs.map((r) => r.activityId)).toEqual(["aa", "zz", "old"]);
  });

  it("a limit leaves the rest counted, never silently dropped", () => {
    const plan = planBackfill({
      candidates: [
        cand({ activityId: "a", recordingSid: "RE-a", occurredAt: "2026-07-27T12:00:00.000Z" }),
        cand({ activityId: "b", recordingSid: "RE-b", occurredAt: "2026-07-27T11:00:00.000Z" }),
        cand({ activityId: "c", recordingSid: "RE-c", occurredAt: "2026-07-27T10:00:00.000Z" }),
      ],
      transcripts: states({}),
      limit: 2,
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs.map((r) => r.activityId)).toEqual(["a", "b"]);
    expect(plan.remaining).toBe(1);
  });

  it("limit 0 is a real cap — nothing runs and everything eligible is still counted", () => {
    const plan = planBackfill({ candidates: [cand()], transcripts: states({}), limit: 0 });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([]);
    expect(plan.remaining).toBe(1);
  });

  it("skips never count toward remaining — only work a later pass could do", () => {
    const plan = planBackfill({
      candidates: [cand({ activityId: "x", recordingSid: null })],
      transcripts: states({}),
      limit: 0,
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.remaining).toBe(0);
  });
});

describe("backfillCandidate", () => {
  it("reads sid and url off a dialer call", () => {
    expect(backfillCandidate(activity())).toEqual({
      activityId: "dialer-RE1",
      recordingSid: "RE1",
      recordingUrl: "https://api.twilio.com/RE1",
      occurredAt: "2026-07-27T10:00:00.000Z",
    });
  });

  it("a manually logged call is not a candidate at all — not a skip", () => {
    expect(backfillCandidate(activity({ source: "manual" }))).toBeNull();
    expect(backfillCandidate(activity({ type: "note" }))).toBeNull();
  });

  it("a dialer call whose sid went missing IS a candidate, so the skip list can name it", () => {
    const c = backfillCandidate(activity({ sourceContext: {} }));
    expect(c).not.toBeNull();
    expect(c?.recordingSid).toBeNull();
  });

  it("a non-string sid is not coerced into an id", () => {
    const c = backfillCandidate(activity({ sourceContext: { recordingSid: 42 } }));
    expect(c?.recordingSid).toBeNull();
  });
});

describe("backfillReason", () => {
  it("is the single home of the status→owes-words judgement", () => {
    expect(backfillReason(undefined)).toBe("never-transcribed");
    expect(backfillReason({ status: "failed", segmentCount: 9 })).toBe("failed");
    expect(backfillReason({ status: "pending", segmentCount: 0 })).toBe("in-flight");
    expect(backfillReason({ status: "complete", segmentCount: 0 })).toBe("complete-but-empty");
    expect(backfillReason({ status: "complete", segmentCount: 1 })).toBe("done");
  });
});

describe("backfillPlanLog", () => {
  it("counts and reasons only — no urls, no ids of words", () => {
    const plan = planBackfill({
      candidates: [
        cand({ activityId: "a", recordingSid: "RE-a" }),
        cand({ activityId: "b", recordingSid: null }),
      ],
      transcripts: states({}),
    });
    const log = backfillPlanLog(plan);
    expect(log).toEqual({
      kind: "planned",
      runs: 1,
      byReason: { "never-transcribed": 1 },
      skipped: 1,
      skipsByReason: { "no-recording-sid": 1 },
      remaining: 0,
    });
    expect(JSON.stringify(log)).not.toContain("api.twilio.com");
  });

  it("an unconfigured plan logs what is missing", () => {
    const log = backfillPlanLog(
      planBackfill({ candidates: [], transcripts: states({}), missingConfig: ["DEEPGRAM_API_KEY"] })
    );
    expect(log).toEqual({ kind: "not-configured", missing: ["DEEPGRAM_API_KEY"] });
  });
});
