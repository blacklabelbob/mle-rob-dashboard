import { describe, expect, it } from "vitest";
import {
  callChainConfigFromEnv,
  callChainReadiness,
  type CallChainConfig,
} from "@/lib/calls/callReadiness";

const config = (over: Partial<CallChainConfig> = {}): CallChainConfig => ({
  twilioAuthToken: false,
  twilioCallerId: false,
  deepgramKey: false,
  anthropicKey: false,
  ...over,
});

const ALL = config({
  twilioAuthToken: true,
  twilioCallerId: true,
  deepgramKey: true,
  anthropicKey: true,
});

describe("callChainReadiness — how far a real call gets", () => {
  it("today's prod (no keys) reaches NOTHING, not a wordless timeline", () => {
    const r = callChainReadiness(config());
    expect(r.reached).toBe("nothing");
    expect(r.verdict).toBe("closed");
    expect(r.headline).toMatch(/503/);
  });

  it("the four reaches never collapse as keys land in order", () => {
    expect(callChainReadiness(config({ twilioAuthToken: true })).reached).toBe(
      "timeline",
    );
    expect(
      callChainReadiness(config({ twilioAuthToken: true, deepgramKey: true })).reached,
    ).toBe("words");
    expect(callChainReadiness(ALL).reached).toBe("summary");
  });

  it("a key set behind a closed webhook is `armed` but still reaches nothing", () => {
    // State is env presence; reach is the cascade. Conflating them either hides a
    // key Rob already added or claims a chain nobody can enter is working.
    const r = callChainReadiness(config({ deepgramKey: true, anthropicKey: true }));
    expect(r.reached).toBe("nothing");
    expect(r.stages.find((s) => s.stage === "transcription")?.state).toBe("armed");
    expect(r.missing).toEqual(["TWILIO_AUTH_TOKEN"]);
  });

  it("`missing` is ordered by the moment each key changes an outcome", () => {
    expect(callChainReadiness(config()).missing).toEqual([
      "TWILIO_AUTH_TOKEN",
      "DEEPGRAM_API_KEY",
      "ANTHROPIC_API_KEY",
    ]);
  });

  it("CALLER_ID is a warning, never a blocker — calls still arrive without it", () => {
    const r = callChainReadiness(
      config({ twilioAuthToken: true, deepgramKey: true, anthropicKey: true }),
    );
    expect(r.missing).toEqual([]);
    expect(r.verdict).toBe("configured");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/TWILIO_CALLER_ID/);
    expect(callChainReadiness(ALL).warnings).toEqual([]);
  });

  it("BOTH narrations of a dormant CALLER_ID state the refusal — neither describes a filing", () => {
    // inc.15 gave the resolver `our-lines-unknown` (nothing files) and restated
    // the `warnings` string to match — but the `filing` stage's own `effect` kept
    // describing the wrong-contact filing that had just been removed, six lines
    // below a comment claiming otherwise. Two voices narrate this one key and
    // nothing pinned either, so a 3394-green run shipped the contradiction.
    const r = callChainReadiness(
      config({ twilioAuthToken: true, deepgramKey: true, anthropicKey: true }),
    );
    const filing = r.stages.find((s) => s.stage === "filing");
    const narrations = [filing?.effect, ...r.warnings];
    expect(narrations).toHaveLength(2);
    for (const line of narrations) {
      expect(line).toBeTruthy();
      expect(line).toMatch(/refus/i);
      expect(line).toMatch(/no call files/i);
      // The two wordings this has been wrong in, kept as named regressions.
      expect(line).not.toMatch(/a call can file/i);
      expect(line).not.toMatch(/files on that person/i);
    }
    // The armed side still promises the subtraction the refusal stands in for.
    const armed = callChainReadiness(ALL).stages.find((s) => s.stage === "filing");
    expect(armed?.effect).toMatch(/subtracted before matching/i);
  });

  it("`configured` is never evidence a call has run", () => {
    const r = callChainReadiness(ALL);
    expect(r.proven).toBe(false);
    expect(r.headline).toMatch(/No call has run/i);
  });

  it("no stage effect blames a provider for a switched-off key", () => {
    // inc.14's rule turned on ourselves: "transcription failed" when the truth is
    // "Deepgram is off" is the sentence that teaches a reader to distrust the CRM.
    for (const stage of callChainReadiness(config()).stages) {
      expect(stage.effect).not.toMatch(/failed|error|broken/i);
    }
  });

  it("reads presence from env and carries no key material out", () => {
    const c = callChainConfigFromEnv({
      TWILIO_AUTH_TOKEN: "shhh-secret",
      DEEPGRAM_API_KEY: "",
    } as NodeJS.ProcessEnv);
    expect(c).toEqual({
      twilioAuthToken: true,
      twilioCallerId: false,
      deepgramKey: false,
      anthropicKey: false,
    });
    expect(JSON.stringify(callChainReadiness(c))).not.toContain("shhh-secret");
  });
});
