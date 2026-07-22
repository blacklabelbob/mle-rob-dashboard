import { timingSafeEqual } from "node:crypto";
import type { NetworkData, Person } from "@/lib/types";

// Vapi hybrid receptionist scaffold (BUILD-QUEUE Q15, Rob #40 locked HYBRID 93.5).
// Everything here is env-gated: with no VAPI_* vars set, vapiConfigured() is
// false, the webhook 503s, and nothing anywhere changes — zero breakage.

export interface VapiEnv {
  webhookSecret?: string; // shared secret Vapi sends as x-vapi-secret
  assistantId?: string; // receptionist assistant built in Vapi's dashboard
}

export function vapiEnv(env: NodeJS.ProcessEnv = process.env): VapiEnv {
  return {
    webhookSecret: env.VAPI_WEBHOOK_SECRET,
    assistantId: env.VAPI_ASSISTANT_ID,
  };
}

export function vapiConfigured(env: VapiEnv): boolean {
  return Boolean(env.webhookSecret);
}

// Constant-time check of the x-vapi-secret header.
export function verifyVapiSecret(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// US-centric normalization: compare on the last 10 digits so
// "+1 (239) 555-0142", "239.555.0142", and "12395550142" all match.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface CallerMatch {
  person: Person;
  verticalName?: string;
  referrerName?: string;
}

// Instant caller→CRM lookup ("find the caller instantly, pull everything up").
export function lookupCaller(
  data: NetworkData,
  callerNumber: string
): CallerMatch | null {
  const wanted = normalizePhone(callerNumber);
  if (!wanted) return null;
  const person = data.people.find(
    (p) => p.phone && normalizePhone(p.phone) === wanted
  );
  if (!person) return null;
  return {
    person,
    verticalName: data.verticals.find((v) => v.id === person.verticalId)?.name,
    referrerName: data.people.find((p) => p.id === person.referredById)?.name,
  };
}

// Flat string map — doubles as Vapi variableValues (assistant prompt template)
// and as the screen-pop payload for the rep cockpit.
export function callerContext(
  match: CallerMatch | null,
  callerNumber: string
): Record<string, string> {
  if (!match) {
    return {
      callerKnown: "false",
      callerNumber,
      callerName: "unknown caller",
    };
  }
  const { person, verticalName, referrerName } = match;
  const ctx: Record<string, string> = {
    callerKnown: "true",
    callerNumber,
    callerName: person.name,
    callerStatus: person.status,
    recordUrl: `/people/${person.id}`,
  };
  if (person.business) ctx.callerBusiness = person.business;
  if (person.role) ctx.callerRole = person.role;
  if (verticalName) ctx.callerVertical = verticalName;
  if (referrerName) {
    ctx.referredBy = person.relationship
      ? `${referrerName} (${person.relationship})`
      : referrerName;
  }
  if (person.assignedRep) ctx.assignedRep = person.assignedRep;
  return ctx;
}

// Response to Vapi's pre-answer `assistant-request` webhook: which assistant
// answers, with the caller's CRM context injected as template variables.
// No assistant provisioned yet → tell Vapi so in its error channel (it plays
// a fallback message) instead of guessing at a transient assistant config.
export function assistantRequestResponse(
  env: VapiEnv,
  data: NetworkData,
  callerNumber: string
): Record<string, unknown> {
  if (!env.assistantId) {
    return { error: "No receptionist assistant configured" };
  }
  return {
    assistantId: env.assistantId,
    assistantOverrides: {
      variableValues: callerContext(lookupCaller(data, callerNumber), callerNumber),
    },
  };
}

interface VapiToolCall {
  id: string;
  function?: { name?: string; arguments?: unknown };
}

// Mid-call custom tool: the assistant calls crm_caller_lookup with a phone
// number and gets the same context payload back as its tool result.
export function toolCallResults(
  toolCalls: VapiToolCall[],
  data: NetworkData,
  fallbackNumber: string
): { results: { toolCallId: string; result: string }[] } {
  const results = toolCalls
    .filter((tc) => tc.function?.name === "crm_caller_lookup")
    .map((tc) => {
      let args: Record<string, unknown> = {};
      const raw = tc.function?.arguments;
      if (typeof raw === "string") {
        try {
          args = JSON.parse(raw);
        } catch {
          /* fall through to fallbackNumber */
        }
      } else if (raw && typeof raw === "object") {
        args = raw as Record<string, unknown>;
      }
      const number =
        typeof args.phoneNumber === "string" && args.phoneNumber
          ? args.phoneNumber
          : fallbackNumber;
      const ctx = callerContext(lookupCaller(data, number), number);
      return { toolCallId: tc.id, result: JSON.stringify(ctx) };
    });
  return { results };
}

// Pull the caller's number out of a Vapi webhook message regardless of shape.
export function callerNumberFrom(message: Record<string, unknown>): string {
  const call = message.call as { customer?: { number?: string } } | undefined;
  const customer = (message.customer ?? call?.customer) as
    | { number?: string }
    | undefined;
  return customer?.number ?? "";
}
