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
  DOD_MET_STEP,
  PLACE_A_CALL_STEP,
} from "@/lib/calls/readinessResponse";
import { repairPresenceFromEnv, repairReadiness } from "@/lib/calls/repairReadiness";
import { callEvidence, type EvidenceSection } from "@/lib/calls/callEvidence";

const config = (over: Partial<CallChainConfig> = {}): CallChainConfig => ({
  twilioAuthToken: false,
  twilioCallerId: false,
  deepgramKey: false,
  anthropicKey: false,
  ...over,
});

const AT = "2026-07-26T19:00:00.000Z";
// inc.43: an EMPTY repair presence by default — the state prod is actually in, and the
// one that would tempt the response into promoting CRON_SECRET to the next step.
const NO_REPAIR_ENV = repairReadiness(new Set<string>());
// inc.46: NO CALL HAS EVER RUN is the default — prod's actual state, and the one the
// response must not confuse with an unreadable store.
const NO_CALLS: EvidenceSection = {
  state: "read",
  evidence: callEvidence({ filed: 0, transcribed: 0, summarised: 0 }),
};
const respond = (over: Partial<CallChainConfig> = {}) =>
  callReadinessResponse(callChainReadiness(config(over)), AT, NO_REPAIR_ENV, NO_CALLS);

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
    const r = callReadinessResponse(readiness, AT, NO_REPAIR_ENV, NO_CALLS);
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
      callReadinessResponse(
        callChainReadiness(callChainConfigFromEnv(secrets)),
        AT,
        repairReadiness(repairPresenceFromEnv(secrets)),
        NO_CALLS,
      ),
    );
    for (const value of Object.values(secrets)) {
      expect(body).not.toContain(value as string);
      // not even a leading fragment — a "safe" prefix is still key material
      expect(body).not.toContain((value as string).slice(0, 8));
    }
    // the NAMES are the ask and must survive
    expect(body).toContain("TWILIO_AUTH_TOKEN");
  });

  it("reports the repair doors WITHOUT ever making one the next step", () => {
    // inc.43, rule 3 extended. A repair door is about a backlog; on a deployment where no
    // call has ever run there is no backlog, so CRON_SECRET must never displace the one
    // step that changes what the NEXT call does.
    const blocked = respond();
    expect(blocked.repair.missing).toContain("CRON_SECRET");
    expect(blocked.nextStep).toMatch(/TWILIO_AUTH_TOKEN/);
    expect(blocked.nextStep).not.toMatch(/CRON_SECRET/);

    // ...and not even when the live chain is fully armed and the doors are the only gap.
    const armed = callReadinessResponse(
      callChainReadiness(config({
        twilioAuthToken: true,
        twilioCallerId: true,
        deepgramKey: true,
        anthropicKey: true,
      })),
      AT,
      NO_REPAIR_ENV,
      NO_CALLS,
    );
    expect(armed.nextStep).toBe(PLACE_A_CALL_STEP);
    expect(armed.repair.doors.every((d) => d.state === "inert")).toBe(true);
    expect(armed.repair.repaired).toBe(false);
  });

  it("keeps the repair section OUT of the chain's own verdict and missing list", () => {
    // inc.43 rule 1: two questions, two answers. An unset CRON_SECRET blocks no call.
    const r = callReadinessResponse(
      callChainReadiness(config({
        twilioAuthToken: true,
        deepgramKey: true,
        anthropicKey: true,
      })),
      AT,
      NO_REPAIR_ENV,
      NO_CALLS,
    );
    expect(r.verdict).toBe("configured");
    expect(r.missing).toEqual([]);
    expect(r.reached).toBe("summary");
    expect(r.repair.missing.length).toBeGreaterThan(0);
  });

  it("the log line is counts and states — never the report's prose or a key name value", () => {
    const log = callReadinessLog(respond({ twilioAuthToken: true }));
    expect(log).toEqual({
      evt: "calls.readiness",
      verdict: "partial",
      reached: "timeline",
      missing: 2,
      warnings: 1,
      repairDoorsOpen: 0,
      repairMissing: 5,
      // inc.46: `unreadable` would appear here as its own reach, never as `none` — a grep
      // for an unused chain must not match a store that could not be read.
      evidenceReach: "none",
      evidenceProven: false,
    });
    expect(JSON.stringify(log)).not.toContain("redeploy");
  });
});

describe("callReadinessResponse — evidence may end the ask, and nothing else may (inc.46)", () => {
  const ARMED = config({
    twilioAuthToken: true,
    twilioCallerId: true,
    deepgramKey: true,
    anthropicKey: true,
  });
  const withEvidence = (evidence: EvidenceSection, cfg = ARMED) =>
    callReadinessResponse(callChainReadiness(cfg), AT, NO_REPAIR_ENV, evidence);
  const read = (
    counts: { filed: number; transcribed: number; summarised: number },
  ): EvidenceSection => ({ state: "read", evidence: callEvidence(counts) });

  it("stops asking for a call once one has actually reached a summary", () => {
    // For 45 increments the armed branch could only repeat "place a call", because the
    // report had no way to know one already had been — including to a Rob who had.
    const r = withEvidence(read({ filed: 1, transcribed: 1, summarised: 1 }));
    expect(r.nextStep).toBe(DOD_MET_STEP);
    // ...and it still names the proof rather than declaring completion.
    expect(r.nextStep).toMatch(/summary/i);
  });

  it("keeps asking when the store could not be read", () => {
    // `unreadable` must never be worth more than silence. Anything else lets a broken
    // service key tick the DoD.
    const r = withEvidence({ state: "unreadable", reason: "SUPABASE_URL not set" });
    expect(r.nextStep).toBe(PLACE_A_CALL_STEP);
  });

  it("refuses the claim when the counts contradict themselves", () => {
    // A summary over a call with no words is the fabricated-summary shape this feature
    // exists to refuse — it must not be the thing that ends the ask.
    const r = withEvidence(read({ filed: 1, transcribed: 0, summarised: 1 }));
    expect(r.nextStep).toBe(PLACE_A_CALL_STEP);
    expect(r.evidence.state === "read" && r.evidence.evidence.contradictions.length).toBeTruthy();
  });

  it("never lets an old proven call outrank a key the chain is missing NOW", () => {
    // Rule 3 holds above evidence: a chain missing DEEPGRAM_API_KEY is not made whole by a
    // call that ran before the key was removed.
    const r = withEvidence(
      read({ filed: 3, transcribed: 3, summarised: 3 }),
      config({ twilioAuthToken: true, twilioCallerId: true, anthropicKey: true }),
    );
    expect(r.nextStep).toMatch(/DEEPGRAM_API_KEY/);
  });

  it("leaves the env half's `proven: false` exactly as inc.21 typed it", () => {
    // The chain report's own `proven` is env-only by construction; evidence lives in its
    // own section and may never leak into it.
    const r = withEvidence(read({ filed: 1, transcribed: 1, summarised: 1 }));
    expect(r.proven).toBe(false);
    expect(r.evidence).toEqual({ state: "read", evidence: expect.objectContaining({ proven: true }) });
  });
});
