import { createHmac, timingSafeEqual } from "node:crypto";

// Raw-Twilio dialer scaffold (PRD Task 7.2, dialer pick 2026-07-18: composite 94.5).
// Everything here is env-gated: with no TWILIO_* vars set, twilioConfigured() is
// false, the routes 503, and the UI keeps its plain tel: links — zero breakage.

export interface TwilioEnv {
  accountSid?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  twimlAppSid?: string;
  callerId?: string;
  authToken?: string;
}

export function twilioEnv(env: NodeJS.ProcessEnv = process.env): TwilioEnv {
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    twimlAppSid: env.TWILIO_TWIML_APP_SID,
    callerId: env.TWILIO_CALLER_ID,
    authToken: env.TWILIO_AUTH_TOKEN,
  };
}

export function twilioConfigured(env: TwilioEnv): boolean {
  return Boolean(env.accountSid && env.apiKeySid && env.apiKeySecret && env.twimlAppSid);
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

// Twilio Voice access token — a plain HS256 JWT (cty twilio-fpa;v=1) signed with
// the API key secret; no SDK dependency needed for this one shape.
export function mintVoiceToken(
  env: TwilioEnv,
  identity: string,
  nowSeconds: number,
  ttlSeconds = 3600
): string {
  if (!twilioConfigured(env)) throw new Error("Twilio env not configured");
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${env.apiKeySid}-${nowSeconds}`,
    iss: env.apiKeySid,
    sub: env.accountSid,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    grants: {
      identity,
      voice: { outgoing: { application_sid: env.twimlAppSid } },
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", env.apiKeySecret!)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

// X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + concat of params sorted by key)).
export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Activities-ready payload (PRD Task 7.2: activity type=call source=dialer).
// The activities table lands with Q9 / 0004_crm_core; until then the webhook
// logs this shape so the wiring is provable end-to-end.
export interface CallActivityPayload {
  type: "call";
  source: "dialer";
  callSid: string;
  recordingSid: string;
  recordingUrl: string;
  durationSec: number | null;
  from: string | null;
  to: string | null;
  occurredAt: string | null;
}

export function recordingToActivity(
  params: Record<string, string>
): CallActivityPayload {
  const dur = Number.parseInt(params.RecordingDuration ?? "", 10);
  return {
    type: "call",
    source: "dialer",
    callSid: params.CallSid ?? "",
    recordingSid: params.RecordingSid ?? "",
    // .mp3 suffix makes the URL directly playable in a browser/timeline.
    recordingUrl: params.RecordingUrl ? `${params.RecordingUrl}.mp3` : "",
    durationSec: Number.isFinite(dur) ? dur : null,
    from: params.From ?? null,
    to: params.To ?? null,
    occurredAt: params.RecordingStartTime ?? params.Timestamp ?? null,
  };
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

// TwiML for an outgoing browser call: dial the requested number, dual-channel
// record from answer, and report the finished recording to our webhook.
export function outgoingCallTwiml(
  env: TwilioEnv,
  to: string,
  recordingCallbackUrl: string
): string {
  const dialAttrs = [
    env.callerId ? `callerId="${escapeXml(env.callerId)}"` : "",
    `record="record-from-answer-dual"`,
    `recordingStatusCallback="${escapeXml(recordingCallbackUrl)}"`,
    `recordingStatusCallbackEvent="completed"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial ${dialAttrs}><Number>${escapeXml(to)}</Number></Dial></Response>`;
}
