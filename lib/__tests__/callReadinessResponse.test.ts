import { describe, expect, it } from "vitest";
import {
  callChainConfigFromEnv,
  callChainReadiness,
  type CallChainConfig,
} from "@/lib/calls/callReadiness";
import {
  callReadinessLog,
  callReadinessResponse,
  DEPLOY_SNAPSHOT_NOTE,
  PLACE_A_CALL_STEP,
} from "@/lib/calls/readinessResponse";

const config = (over: Partial<CallChainConfig> = {}): CallChainConfig => ({
  twilioAuthToken: false,
  twilioCallerId: false,
  deepgramKey: false,
  anthropicKey: false,
  ...over,
});

const AT = "2026-07-26T19:00:00.000Z";
const respond = (over: Partial<CallChainConfig> = {}) =>
  callReadinessResponse(callChainReadiness(config(over)), AT);

describe("callReadinessResponse — one next step, and no lie about where env lives", () => {
  it("carries the redeploy caveat on every answer, armed or not", () => {
    // Rule 1. The first real use of this endpoint is Rob re-checking after
    // `vercel env add`; without the caveat the honest `dormant` reads as "broken".
    for (const r of [respond(), respond({ twilioAuthToken: true, deepgramKey: true, anthropicKey: true })]) {
      expect(r.configNote).toBe(DEPLOY_SNAPSHOT_NOTE);
      expect(r.configNote).toMatch(/redeploy/i);
    }
  });

  it("quotes only the FIRST missing key — the cascade's order is the whole point", () => {
    // Rule 2. inc.21 ordered `missing` by when each key first changes an outcome.
    const r = respond();
    expect(r.missing).toEqual(["TWILIO_AUTH_TOKEN", "DEEPGRAM_API_KEY", "ANTHROPIC_API_KEY"]);
    expect(r.nextStep).toMatch(/TWILIO_AUTH_TOKEN/);
    expect(r.nextStep).not.toMatch(/DEEPGRAM_API_KEY|ANTHROPIC_API_KEY/);
  });

  it("advances the next step as keys land, in the cascade's order", () => {
    expect(respond({ twilioAuthToken: true }).nextStep).toMatch(/DEEPGRAM_API_KEY/);
    expect(respond({ twilioAuthToken: true, deepgramKey: true }).nextStep).toMatch(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("never turns the TWILIO_CALLER_ID warning into the next step", () => {
    // Rule 3. It is a correctness hazard, not a blocker — promoting it would send Rob
    // to the env dashboard when the actual next move is to place a call.
    const r = respond({ twilioAuthToken: true, deepgramKey: true, anthropicKey: true });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/TWILIO_CALLER_ID/);
    expect(r.nextStep).not.toMatch(/TWILIO_CALLER_ID/);
    expect(r.nextStep).toBe(PLACE_A_CALL_STEP);
  });

  it("a fully armed chain is told to place a call, and is still not proven", () => {
    // Rule 4. No arrangement of env vars may read as the DoD being met.
    const r = respond({
      twilioAuthToken: true,
      twilioCallerId: true,
      deepgramKey: true,
      anthropicKey: true,
    });
    expect(r.verdict).toBe("configured");
    expect(r.reached).toBe("summary");
    expect(r.proven).toBe(false);
    expect(r.nextStep).toMatch(/Place one real recorded call/);
    expect(r.nextStep).not.toMatch(/done|complete|ready to go/i);
  });

  it("passes inc.21's report through untouched — it decorates, it does not re-decide", () => {
    const readiness = callChainReadiness(config({ twilioAuthToken: true }));
    const r = callReadinessResponse(readiness, AT);
    expect(r.verdict).toBe(readiness.verdict);
    expect(r.reached).toBe(readiness.reached);
    expect(r.stages).toEqual(readiness.stages);
    expect(r.missing).toEqual(readiness.missing);
    expect(r.warnings).toEqual(readiness.warnings);
    expect(r.headline).toBe(readiness.headline);
    expect(r.checkedAt).toBe(AT);
  });

  it("no key material reaches the serialised body, even with realistic secrets in env", () => {
    const secrets = {
      TWILIO_AUTH_TOKEN: "b1946ac92492d2347c6235b4d2611184deadbeefcafe0001",
      TWILIO_CALLER_ID: "+15615550123",
      DEEPGRAM_API_KEY: "dg_9f8e7d6c5b4a39281706fedcba9876543210aaaa",
      ANTHROPIC_API_KEY: "sk-ant-api03-not-a-real-key-0123456789abcdef",
    } as unknown as NodeJS.ProcessEnv;
    const body = JSON.stringify(
      callReadinessResponse(callChainReadiness(callChainConfigFromEnv(secrets)), AT),
    );
    for (const value of Object.values(secrets)) {
      expect(body).not.toContain(value as string);
      // not even a leading fragment — a "safe" prefix is still key material
      expect(body).not.toContain((value as string).slice(0, 8));
    }
    // the NAMES are the ask and must survive
    expect(body).toContain("TWILIO_AUTH_TOKEN");
  });

  it("the log line is counts and states — never the report's prose or a key name value", () => {
    const log = callReadinessLog(respond({ twilioAuthToken: true }));
    expect(log).toEqual({
      evt: "calls.readiness",
      verdict: "partial",
      reached: "timeline",
      missing: 2,
      warnings: 1,
    });
    expect(JSON.stringify(log)).not.toContain("redeploy");
  });
});
