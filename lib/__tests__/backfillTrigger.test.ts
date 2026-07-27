// Q68 (c) inc.38 — the operator trigger's decisions. The two money-shaped rules are pinned
// against the exact inputs a hurried curl produces (`execute: "true"`, `limit: "20"`), because
// those are the ones a truthy coercion gets wrong silently and expensively.
import { describe, expect, it } from "vitest";
import {
  BACKFILL_REQUIRED_ENV,
  backfillAuthGate,
  backfillMissingConfig,
  backfillTriggerResponse,
  parseBackfillRequest,
} from "@/lib/calls/backfillTrigger";
import type { BackfillPassResult } from "@/lib/calls/backfillPass";

const ok = (over: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv => ({
  DEEPGRAM_API_KEY: "dg",
  ANTHROPIC_API_KEY: "an",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  ...over,
});

describe("backfillMissingConfig", () => {
  it("is empty when every required key is set", () => {
    expect(backfillMissingConfig(ok())).toEqual([]);
  });

  it("names both provider keys AND both Supabase halves", () => {
    expect(backfillMissingConfig({})).toEqual([...BACKFILL_REQUIRED_ENV]);
  });

  it("treats an empty string as unset — a blank key spends nothing but a round trip", () => {
    expect(backfillMissingConfig(ok({ DEEPGRAM_API_KEY: "" }))).toEqual(["DEEPGRAM_API_KEY"]);
  });

  it("does NOT require the Twilio vars — this pass never calls Twilio's API", () => {
    expect(backfillMissingConfig(ok())).not.toContain("TWILIO_AUTH_TOKEN");
    expect(backfillMissingConfig(ok())).not.toContain("TWILIO_CALLER_ID");
  });
});

describe("parseBackfillRequest — rule 1: a spend is typed true, never truthy", () => {
  it("reads silence as a dry run", () => {
    expect(parseBackfillRequest(undefined)).toEqual({ kind: "ok", request: { execute: false } });
    expect(parseBackfillRequest({})).toEqual({ kind: "ok", request: { execute: false } });
  });

  it("executes only on the literal boolean", () => {
    expect(parseBackfillRequest({ execute: true })).toEqual({
      kind: "ok",
      request: { execute: true },
    });
    expect(parseBackfillRequest({ execute: false })).toEqual({
      kind: "ok",
      request: { execute: false },
    });
  });

  it('REFUSES the string "true" rather than spending on a coercion', () => {
    expect(parseBackfillRequest({ execute: "true" })).toEqual({
      kind: "invalid",
      reason: "execute-must-be-a-boolean",
    });
  });

  it('REFUSES the string "false" rather than quietly billing the whole backlog', () => {
    expect(parseBackfillRequest({ execute: "false" })).toEqual({
      kind: "invalid",
      reason: "execute-must-be-a-boolean",
    });
  });

  it("refuses execute: 1 instead of guessing which way the caller meant it", () => {
    expect(parseBackfillRequest({ execute: 1 })).toEqual({
      kind: "invalid",
      reason: "execute-must-be-a-boolean",
    });
  });

  it("refuses a non-object body", () => {
    expect(parseBackfillRequest("execute")).toEqual({
      kind: "invalid",
      reason: "body-must-be-an-object",
    });
    expect(parseBackfillRequest([{ execute: true }])).toEqual({
      kind: "invalid",
      reason: "body-must-be-an-object",
    });
  });
});

describe("parseBackfillRequest — rule 2: a malformed cap is never an uncapped pass", () => {
  it("carries a positive integer through", () => {
    expect(parseBackfillRequest({ execute: true, limit: 20 })).toEqual({
      kind: "ok",
      request: { execute: true, limit: 20 },
    });
  });

  it("leaves limit off when it was omitted — uncapped is asked for by omission", () => {
    const parsed = parseBackfillRequest({ execute: true });
    expect(parsed.kind === "ok" && "limit" in parsed.request).toBe(false);
  });

  it('REFUSES "20" — a typo\'d cap must not become the uncapped default', () => {
    expect(parseBackfillRequest({ execute: true, limit: "20" })).toEqual({
      kind: "invalid",
      reason: "limit-must-be-a-positive-integer",
    });
  });

  it("refuses 0, a negative, a fraction and NaN", () => {
    for (const limit of [0, -5, 2.5, Number.NaN]) {
      expect(parseBackfillRequest({ execute: true, limit })).toEqual({
        kind: "invalid",
        reason: "limit-must-be-a-positive-integer",
      });
    }
  });

  it("reads an explicit null limit as omitted", () => {
    expect(parseBackfillRequest({ execute: false, limit: null })).toEqual({
      kind: "ok",
      request: { execute: false },
    });
  });
});

describe("backfillTriggerResponse", () => {
  it("answers 503 for an unconfigured pass — rule 4", () => {
    const res = backfillTriggerResponse({
      kind: "not-configured",
      missing: ["DEEPGRAM_API_KEY"],
    });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ kind: "not-configured", missing: ["DEEPGRAM_API_KEY"] });
  });

  it("answers 200 with counts and reasons — and NO recording URLs (rule 3)", () => {
    const result: BackfillPassResult = {
      kind: "planned",
      plan: {
        kind: "planned",
        runs: [
          {
            activityId: "dialer-RE1",
            recordingSid: "RE1",
            recordingUrl: "https://api.twilio.com/RE1",
            reason: "never-transcribed",
          },
        ],
        skipped: [{ activityId: "dialer-RE2", recordingSid: "RE2", reason: "already-transcribed" }],
        remaining: 3,
      },
    };
    const res = backfillTriggerResponse(result);
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("api.twilio.com");
    expect(json).not.toContain("dialer-RE1");
    expect(res.body).toEqual({
      kind: "planned",
      plan: {
        kind: "planned",
        runs: 1,
        byReason: { "never-transcribed": 1 },
        skipped: 1,
        skipsByReason: { "already-transcribed": 1 },
        remaining: 3,
      },
    });
  });
});

// inc.42 — the one door policy both spend triggers now go through.
describe("backfillAuthGate", () => {
  const yes = () => true;
  const no = () => false;

  it("is 503 inert when the deployment never armed CRON_SECRET", () => {
    expect(backfillAuthGate("Bearer x", undefined, yes)).toEqual({
      status: 503,
      body: { error: "backfill disabled: CRON_SECRET not set" },
    });
  });

  it("is 503 for an empty secret too — a blank secret is not an armed one", () => {
    expect(backfillAuthGate("Bearer x", "", yes)?.status).toBe(503);
  });

  it("is 401 for a wrong bearer, even when the secret is set", () => {
    expect(backfillAuthGate("Bearer nope", "s3cret", no)).toEqual({
      status: 401,
      body: { error: "unauthorized" },
    });
  });

  it("returns null — proceed — only for a verified bearer", () => {
    expect(backfillAuthGate("Bearer s3cret", "s3cret", yes)).toBeNull();
  });

  it("hands the verifier the header and the secret verbatim, missing header included", () => {
    const seen: Array<[string | null, string]> = [];
    backfillAuthGate(null, "s3cret", (h, s) => {
      seen.push([h, s]);
      return false;
    });
    expect(seen).toEqual([[null, "s3cret"]]);
  });
});
