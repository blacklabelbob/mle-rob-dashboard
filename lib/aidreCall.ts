import type { Activity, NetworkData } from "./types";
import { lookupCaller, normalizePhone, verifyVapiSecret, type CallerMatch } from "./vapi";

// AIDRE call-outcome capture seam (PRD Task 3.3). AIDRE (the 24/7 AI phone
// receptionist product) POSTs each finished call to /api/webhooks/aidre-call;
// matched contacts get a type=call, source=aidre row on their timeline.
// Env-gated like the n8n/Vapi seams: AIDRE_WEBHOOK_SECRET unset → the route
// 503s and nothing anywhere changes. Payload contract lives in
// docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md (delivered to the AIDRE repo per DoD).

export interface AidreEnv {
  webhookSecret?: string; // shared secret AIDRE sends as x-aidre-secret
}

export function aidreEnv(env: NodeJS.ProcessEnv = process.env): AidreEnv {
  return { webhookSecret: env.AIDRE_WEBHOOK_SECRET };
}

export function aidreConfigured(env: AidreEnv): boolean {
  return Boolean(env.webhookSecret);
}

// Same constant-time comparison the Vapi/n8n webhooks use.
export const verifyAidreSecret = verifyVapiSecret;

export const AIDRE_CALL_OUTCOMES = [
  "answered",
  "missed",
  "voicemail",
  "booked",
  "transferred",
] as const;
export type AidreCallOutcome = (typeof AIDRE_CALL_OUTCOMES)[number];

// What AIDRE sends per finished call. callId + callerNumber are the only hard
// requirements; everything else degrades gracefully.
export interface AidreCallPayload {
  callId: string;
  callerNumber: string;
  callerName?: string;
  direction?: "inbound" | "outbound";
  outcome?: AidreCallOutcome | string; // unknown outcomes pass through into sourceContext
  durationSeconds?: number;
  summary?: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  startedAt?: string; // ISO 8601; missing/unparseable → receive time
}

// Deterministic id from AIDRE's call id → upsert is idempotent and the same
// call re-delivered (AIDRE retry, network blip) never duplicates a row.
export function activityIdFor(callId: string): string {
  return `aidre-call-${callId}`;
}

// Match on the caller's phone (last-10-digit normalize, same rule as the Vapi
// receptionist lookup — one phone-matching behavior across the whole CRM).
export function matchCaller(data: NetworkData, payload: AidreCallPayload): CallerMatch | null {
  return lookupCaller(data, payload.callerNumber);
}

export function callToActivity(
  payload: AidreCallPayload,
  match: CallerMatch,
  nowIso: string
): Activity {
  const parsed = payload.startedAt ? Date.parse(payload.startedAt) : NaN;
  const occurredAt = Number.isNaN(parsed) ? nowIso : new Date(parsed).toISOString();
  const isCompany = match.person.entityKind === "company";
  const outcome = payload.outcome?.trim() || "completed";
  const summary =
    payload.summary?.trim() ||
    `AIDRE ${payload.direction ?? "inbound"} call — ${outcome}`;
  return {
    id: activityIdFor(payload.callId),
    // 0005 check: ≤1 of personId/orgId — company rows anchor as org.
    personId: isCompany ? undefined : match.person.id,
    orgId: isCompany ? match.person.id : undefined,
    createdBy: "aidre-call-capture",
    type: "call",
    source: "aidre",
    sourceContext: {
      channel: "phone",
      direction: payload.direction ?? "inbound",
      outcome,
      aidreCallId: payload.callId,
      callerNumber: normalizePhone(payload.callerNumber),
      callerNameReported: payload.callerName,
      durationSeconds: payload.durationSeconds,
    },
    summary,
    recordingUrl: payload.recordingUrl,
    transcriptUrl: payload.transcriptUrl,
    bookProtected: false,
    occurredAt,
    createdAt: nowIso,
  };
}
