// Q68 (c) inc.39 — the summary-only backfill plan. Every rule in summaryBackfill.ts is pinned here.
import { describe, expect, it } from "vitest";
import {
  planSummaryBackfill,
  summaryBackfillLog,
  summaryBackfillReason,
  summaryCandidate,
  type SummaryCandidate,
} from "@/lib/calls/summaryBackfill";
import type { BackfillState } from "@/lib/calls/transcriptBackfill";
import type { Activity } from "@/lib/types";

const cand = (over: Partial<SummaryCandidate> = {}): SummaryCandidate => ({
  activityId: "dialer-RE1",
  recordingSid: "RE1",
  summary: undefined,
  occurredAt: "2026-07-27T10:00:00.000Z",
  ...over,
});

const states = (entries: Record<string, BackfillState>) => new Map(Object.entries(entries));
const done = (segmentCount = 9): BackfillState => ({ status: "complete", segmentCount });

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

describe("rule 1 — unconfigured is a shape, not an empty plan", () => {
  it("returns not-configured with the missing key names", () => {
    const plan = planSummaryBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: done() }),
      missingConfig: ["ANTHROPIC_API_KEY"],
    });
    expect(plan.kind).toBe("not-configured");
    if (plan.kind !== "not-configured") throw new Error("unreachable");
    expect(plan.missing).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("does not report an unconfigured pass as 'nothing to summarise'", () => {
    const log = summaryBackfillLog(
      planSummaryBackfill({
        candidates: [cand()],
        transcripts: states({ RE1: done() }),
        missingConfig: ["ANTHROPIC_API_KEY"],
      })
    );
    expect(log.kind).toBe("not-configured");
    expect(log.runs).toBeUndefined();
  });
});

describe("rule 2 — an existing summary is never re-asked", () => {
  it("skips a call that already carries summary prose", () => {
    const plan = planSummaryBackfill({
      candidates: [cand({ summary: "Discussed the roof scope and pricing." })],
      transcripts: states({ RE1: done() }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("already-summarised");
  });

  it("treats a whitespace-only summary as owed — it reads as summarised and says nothing", () => {
    const plan = planSummaryBackfill({
      candidates: [cand({ summary: "   " })],
      transcripts: states({ RE1: done() }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(1);
  });

  it("answers already-summarised even when the transcript row is gone", () => {
    // Reporting never-transcribed here would send an operator repairing a finished call.
    expect(summaryBackfillReason("a real summary", undefined)).toEqual({
      ok: false,
      reason: "already-summarised",
    });
  });
});

describe("rule 3 — only a complete transcript WITH words is owed a summary", () => {
  it("plans a complete transcript with segments, carrying the count", () => {
    const plan = planSummaryBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: done(12) }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toEqual([{ activityId: "dialer-RE1", recordingSid: "RE1", segments: 12 }]);
  });

  it("hands a call with no transcript row to the transcript backfill, by name", () => {
    const plan = planSummaryBackfill({ candidates: [cand()], transcripts: states({}) });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.skipped[0].reason).toBe("never-transcribed");
  });

  it("leaves a pending transcript for a later pass", () => {
    const plan = planSummaryBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "pending", segmentCount: 0 } }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.skipped[0].reason).toBe("transcript-in-flight");
  });

  it("distinguishes a failed transcript from a silent call", () => {
    const failed = planSummaryBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: { status: "failed", segmentCount: 0 } }),
    });
    const silent = planSummaryBackfill({
      candidates: [cand()],
      transcripts: states({ RE1: done(0) }),
    });
    if (failed.kind !== "planned" || silent.kind !== "planned") throw new Error("unreachable");
    expect(failed.skipped[0].reason).toBe("transcript-failed");
    expect(silent.skipped[0].reason).toBe("no-segments");
    // Neither may be sent to a model: one has no words, the other had no speech.
    expect([...failed.runs, ...silent.runs]).toHaveLength(0);
  });
});

describe("rule 4 — the cap means what it means", () => {
  const three = [
    cand({ activityId: "a1", recordingSid: "RE1", occurredAt: "2026-07-27T12:00:00.000Z" }),
    cand({ activityId: "a2", recordingSid: "RE2", occurredAt: "2026-07-27T11:00:00.000Z" }),
    cand({ activityId: "a3", recordingSid: "RE3", occurredAt: "2026-07-27T10:00:00.000Z" }),
  ];
  const all = states({ RE1: done(), RE2: done(), RE3: done() });

  it("omitted limit runs everything and leaves nothing remaining", () => {
    const plan = planSummaryBackfill({ candidates: three, transcripts: all });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(3);
    expect(plan.remaining).toBe(0);
  });

  it("a positive cap reports what it left behind", () => {
    const plan = planSummaryBackfill({ candidates: three, transcripts: all, limit: 1 });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(1);
    expect(plan.remaining).toBe(2);
  });

  it("limit 0 is a real cap — it plans nothing and still reports the backlog", () => {
    const plan = planSummaryBackfill({ candidates: three, transcripts: all, limit: 0 });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(0);
    expect(plan.remaining).toBe(3);
  });

  it("remaining counts only ELIGIBLE calls, never the skipped ones", () => {
    const plan = planSummaryBackfill({
      candidates: [...three, cand({ activityId: "a4", recordingSid: "RE4" })],
      transcripts: all, // RE4 has no transcript row -> skipped, not remaining
      limit: 1,
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.remaining).toBe(2);
  });
});

describe("rule 5 — newest first, deterministically", () => {
  it("spends a cap on the most recent calls", () => {
    const plan = planSummaryBackfill({
      candidates: [
        cand({ activityId: "old", recordingSid: "REold", occurredAt: "2026-03-01T10:00:00.000Z" }),
        cand({ activityId: "new", recordingSid: "REnew", occurredAt: "2026-07-27T10:00:00.000Z" }),
      ],
      transcripts: states({ REold: done(), REnew: done() }),
      limit: 1,
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs[0].activityId).toBe("new");
  });

  it("breaks a timestamp tie identically on every pass", () => {
    const tied = [
      cand({ activityId: "b", recordingSid: "REb" }),
      cand({ activityId: "a", recordingSid: "REa" }),
    ];
    const transcripts = states({ REa: done(), REb: done() });
    const first = planSummaryBackfill({ candidates: tied, transcripts, limit: 1 });
    const second = planSummaryBackfill({ candidates: [...tied].reverse(), transcripts, limit: 1 });
    if (first.kind !== "planned" || second.kind !== "planned") throw new Error("unreachable");
    expect(first.runs[0].activityId).toBe("a");
    expect(second.runs[0].activityId).toBe("a");
  });
});

describe("rule 6 — one recording sid is planned once", () => {
  it("plans the first row for a sid and names the duplicate", () => {
    const plan = planSummaryBackfill({
      candidates: [
        cand({ activityId: "a1", recordingSid: "RE1" }),
        cand({ activityId: "a2", recordingSid: "RE1" }),
      ],
      transcripts: states({ RE1: done() }),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("duplicate-recording-sid");
  });

  it("a call with no recording sid is skipped, never planned with an empty sid", () => {
    const plan = planSummaryBackfill({
      candidates: [cand({ recordingSid: "  " })],
      transcripts: states({}),
    });
    if (plan.kind !== "planned") throw new Error("unreachable");
    expect(plan.runs).toHaveLength(0);
    expect(plan.skipped[0]).toEqual({
      activityId: "dialer-RE1",
      recordingSid: null,
      reason: "no-recording-sid",
    });
  });
});

describe("rule 7 — the log carries counts, ids and reasons, never words", () => {
  it("tallies skips by reason and totals the segments about to be sent", () => {
    const log = summaryBackfillLog(
      planSummaryBackfill({
        candidates: [
          cand({ activityId: "a1", recordingSid: "RE1" }),
          cand({ activityId: "a2", recordingSid: "RE2", summary: "already done" }),
          cand({ activityId: "a3", recordingSid: "RE3" }),
        ],
        transcripts: states({ RE1: done(4), RE2: done(), RE3: done(0) }),
      })
    );
    expect(log).toEqual({
      kind: "planned",
      runs: 1,
      segments: 4,
      remaining: 0,
      skipped: { "already-summarised": 1, "no-segments": 1 },
    });
  });

  it("never carries summary prose out of the plan", () => {
    const serialized = JSON.stringify(
      summaryBackfillLog(
        planSummaryBackfill({
          candidates: [cand({ summary: "SECRET customer prose" })],
          transcripts: states({ RE1: done() }),
        })
      )
    );
    expect(serialized).not.toContain("SECRET");
  });
});

describe("summaryCandidate — only recorded dialer calls qualify", () => {
  it("reduces a dialer call to its id, sid, summary and timestamp", () => {
    expect(summaryCandidate(activity({ summary: "hi" }))).toEqual({
      activityId: "dialer-RE1",
      recordingSid: "RE1",
      summary: "hi",
      occurredAt: "2026-07-27T10:00:00.000Z",
    });
  });

  it("rejects a manually logged call — it has no words behind it", () => {
    expect(summaryCandidate(activity({ source: "manual" }))).toBeNull();
    expect(summaryCandidate(activity({ type: "email" }))).toBeNull();
  });

  it("keeps 'a recorded call missing its sid' as a candidate, not a rejection", () => {
    const c = summaryCandidate(activity({ sourceContext: {} }));
    expect(c?.recordingSid).toBeNull();
  });
});
