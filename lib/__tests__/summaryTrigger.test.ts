// Q68 (c) inc.42 — the summary trigger's decisions. The rule worth pinning hardest is the
// one a copy-paste of inc.38 would break silently: this pass does NOT need Deepgram, and a
// trigger that demands it answers 503 about a backlog it could have summarised.
import { describe, expect, it } from "vitest";
import {
  SUMMARY_REQUIRED_ENV,
  parseSummaryRequest,
  summaryMissingConfig,
  summaryTriggerResponse,
} from "@/lib/calls/summaryTrigger";
import { parseBackfillRequest } from "@/lib/calls/backfillTrigger";
import type { SummaryPassResult } from "@/lib/calls/summaryPass";
import type { SummaryBackfillPlan } from "@/lib/calls/summaryBackfill";

const ok = (over: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv => ({
  ANTHROPIC_API_KEY: "an",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  ...over,
});

const planned = (runs: number, remaining = 0): SummaryBackfillPlan => ({
  kind: "planned",
  runs: Array.from({ length: runs }, (_, i) => ({
    activityId: `a${i}`,
    recordingSid: `RE${i}`,
    segments: 3,
  })),
  skipped: [{ activityId: "z", recordingSid: null, reason: "no-recording-sid" }],
  remaining,
});

describe("summaryMissingConfig", () => {
  it("is empty when the model key and both Supabase halves are set", () => {
    expect(summaryMissingConfig(ok())).toEqual([]);
  });

  it("does NOT require DEEPGRAM_API_KEY — this pass owns its words already (rule 1)", () => {
    expect([...SUMMARY_REQUIRED_ENV]).not.toContain("DEEPGRAM_API_KEY");
    expect(summaryMissingConfig(ok({ DEEPGRAM_API_KEY: undefined }))).toEqual([]);
  });

  it("names the model key and both Supabase halves, in fix order", () => {
    expect(summaryMissingConfig({})).toEqual([...SUMMARY_REQUIRED_ENV]);
  });

  it("requires both Supabase halves — an unread evidence map plans the whole backlog (rule 2)", () => {
    expect(summaryMissingConfig(ok({ SUPABASE_SERVICE_ROLE_KEY: undefined }))).toEqual([
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("treats an empty string as unset", () => {
    expect(summaryMissingConfig(ok({ ANTHROPIC_API_KEY: "" }))).toEqual(["ANTHROPIC_API_KEY"]);
  });
});

describe("summaryTriggerResponse", () => {
  it("answers 503 for a pass that never ran — today's only state (rule 3)", () => {
    const result: SummaryPassResult = {
      kind: "not-configured",
      missing: ["ANTHROPIC_API_KEY"],
    };
    const res = summaryTriggerResponse(result);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ kind: "not-configured", missing: ["ANTHROPIC_API_KEY"] });
  });

  it("answers 200 for a plan and carries counts, never ids (rule 4)", () => {
    const res = summaryTriggerResponse({ kind: "planned", plan: planned(2, 5) });
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("RE0");
    expect(json).not.toContain("a0");
    expect(json).toContain("2");
  });

  it("never leaks a summary paragraph through the body (rule 4)", () => {
    const res = summaryTriggerResponse({
      kind: "executed",
      plan: planned(1),
      outcome: {
        kind: "executed",
        remaining: 0,
        outcomes: [
          {
            kind: "written",
            activityId: "a0",
            recordingSid: "RE0",
            actionItems: 2,
            buyingSignals: 1,
            truncated: false,
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/roof|discussed|customer said/i);
  });
});

describe("parseSummaryRequest", () => {
  it("IS the transcript trigger's parse — one door policy, not a copy (rule 5)", () => {
    expect(parseSummaryRequest).toBe(parseBackfillRequest);
  });

  it("still refuses a truthy execute, so the summary door cannot be curl'd into a spend", () => {
    expect(parseSummaryRequest({ execute: "true" })).toEqual({
      kind: "invalid",
      reason: "execute-must-be-a-boolean",
    });
  });
});
