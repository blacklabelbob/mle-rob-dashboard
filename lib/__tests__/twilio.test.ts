import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mintVoiceToken,
  outgoingCallTwiml,
  recordingToActivity,
  twilioConfigured,
  validateTwilioSignature,
  type TwilioEnv,
} from "../twilio";

const env: TwilioEnv = {
  accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  apiKeySid: "SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  apiKeySecret: "secret",
  twimlAppSid: "APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  callerId: "+15550001111",
  authToken: "authtoken",
};

describe("twilioConfigured", () => {
  it("false with empty env — the zero-breakage gate", () => {
    expect(twilioConfigured({})).toBe(false);
  });
  it("false when any minting var is missing", () => {
    expect(twilioConfigured({ ...env, apiKeySecret: undefined })).toBe(false);
  });
  it("true with the four minting vars", () => {
    expect(twilioConfigured(env)).toBe(true);
  });
});

describe("mintVoiceToken", () => {
  it("emits a valid HS256 JWT with Twilio voice-grant claims", () => {
    const now = 1_800_000_000;
    const token = mintVoiceToken(env, "rep", now);
    const [h, p, s] = token.split(".");
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(header).toEqual({ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" });
    expect(payload.iss).toBe(env.apiKeySid);
    expect(payload.sub).toBe(env.accountSid);
    expect(payload.exp).toBe(now + 3600);
    expect(payload.grants.identity).toBe("rep");
    expect(payload.grants.voice.outgoing.application_sid).toBe(env.twimlAppSid);
    const expected = createHmac("sha256", env.apiKeySecret!)
      .update(`${h}.${p}`)
      .digest("base64url");
    expect(s).toBe(expected);
  });
  it("throws when unconfigured", () => {
    expect(() => mintVoiceToken({}, "rep", 0)).toThrow();
  });
});

describe("validateTwilioSignature", () => {
  const url = "https://example.com/api/webhooks/twilio-recording";
  const params = { CallSid: "CA123", RecordingSid: "RE456" };
  const sign = (token: string) =>
    createHmac("sha1", token)
      .update(url + "CallSidCA123" + "RecordingSidRE456")
      .digest("base64");

  it("accepts Twilio's documented scheme (params sorted, appended to URL)", () => {
    expect(validateTwilioSignature("authtoken", url, params, sign("authtoken"))).toBe(true);
  });
  it("rejects a signature made with the wrong token", () => {
    expect(validateTwilioSignature("authtoken", url, params, sign("wrong"))).toBe(false);
  });
  it("rejects garbage without throwing", () => {
    expect(validateTwilioSignature("authtoken", url, params, "nope")).toBe(false);
  });
});

describe("recordingToActivity", () => {
  it("maps a recording-completed webhook to the activity shape", () => {
    const a = recordingToActivity({
      CallSid: "CA123",
      RecordingSid: "RE456",
      RecordingUrl: "https://api.twilio.com/rec/RE456",
      RecordingDuration: "42",
      From: "client:rep",
      To: "+15551234567",
      RecordingStartTime: "Tue, 21 Jul 2026 12:00:00 +0000",
    });
    expect(a).toEqual({
      type: "call",
      source: "dialer",
      callSid: "CA123",
      recordingSid: "RE456",
      recordingUrl: "https://api.twilio.com/rec/RE456.mp3",
      durationSec: 42,
      from: "client:rep",
      to: "+15551234567",
      occurredAt: "Tue, 21 Jul 2026 12:00:00 +0000",
    });
  });
  it("missing fields degrade to null/empty, never NaN", () => {
    const a = recordingToActivity({});
    expect(a.durationSec).toBeNull();
    expect(a.recordingUrl).toBe("");
    expect(a.occurredAt).toBeNull();
  });
});

describe("outgoingCallTwiml", () => {
  it("dials the target with dual recording + our callback", () => {
    const xml = outgoingCallTwiml(env, "+15551234567", "https://x.test/cb");
    expect(xml).toContain(`callerId="+15550001111"`);
    expect(xml).toContain(`record="record-from-answer-dual"`);
    expect(xml).toContain(`recordingStatusCallback="https://x.test/cb"`);
    expect(xml).toContain("<Number>+15551234567</Number>");
  });
  it("escapes XML-hostile input", () => {
    const xml = outgoingCallTwiml(env, `+1<Say>"hi"</Say>`, "https://x.test/cb");
    expect(xml).not.toContain("<Say>");
    expect(xml).toContain("&#60;Say&#62;");
  });
});
