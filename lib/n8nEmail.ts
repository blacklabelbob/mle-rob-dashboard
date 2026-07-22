import type { Activity, NetworkData, Person } from "./types";
import { verifyVapiSecret } from "./vapi";

// n8n Gmail capture seam (PRD Task 3.2, BUILD-QUEUE Q8). The n8n workflow
// watches rob@aivoicetech.io and POSTs each message to /api/webhooks/n8n-email;
// everything here is env-gated: with N8N_EMAIL_WEBHOOK_SECRET unset the route
// 503s and nothing anywhere changes. Writes the same `activities` shape Task
// 4.6b's rep capture will use (source='n8n', channel=email) so the capture
// mechanism stays swappable.

// Identity rule (~/.claude/rules/email-identity.md): capture is aivoicetech.io
// ONLY. Because of the 2026-07-08 forwarding incident, mail addressed to
// rob@boostuppayments.com can physically sit in the aivoicetech inbox — the
// gate judges the HEADERS, never the mailbox, and hard-rejects anything with
// a boostuppayments.com party.
export const CAPTURE_IDENTITY = "rob@aivoicetech.io";
export const FORBIDDEN_DOMAIN = "boostuppayments.com";

export interface N8nEmailEnv {
  webhookSecret?: string; // shared secret n8n sends as x-n8n-secret
}

export function n8nEmailEnv(env: NodeJS.ProcessEnv = process.env): N8nEmailEnv {
  return { webhookSecret: env.N8N_EMAIL_WEBHOOK_SECRET };
}

export function n8nEmailConfigured(env: N8nEmailEnv): boolean {
  return Boolean(env.webhookSecret);
}

// Same constant-time comparison the Vapi webhook uses.
export const verifyN8nSecret = verifyVapiSecret;

// What the n8n Gmail node hands us (headers as raw strings; `to` may be one
// string, a comma-joined string, or an array — normalize everything).
export interface EmailPayload {
  messageId: string;
  threadId?: string;
  from: string;
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  snippet?: string;
  date?: string;
}

// "Rob Acheson <Rob@AIVoiceTech.io>" → "rob@aivoicetech.io"
export function extractAddress(raw: string): string {
  const angled = raw.match(/<([^<>]+)>/);
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase();
  return candidate.includes("@") ? candidate : "";
}

function asList(v?: string | string[]): string[] {
  if (!v) return [];
  const parts = Array.isArray(v) ? v : v.split(",");
  return parts.map(extractAddress).filter(Boolean);
}

// Every address party to the message: from + to + cc.
export function allParties(payload: EmailPayload): string[] {
  return [extractAddress(payload.from), ...asList(payload.to), ...asList(payload.cc)].filter(
    Boolean
  );
}

export type GateVerdict = { ok: true } | { ok: false; reason: string };

export function identityGate(payload: EmailPayload): GateVerdict {
  const parties = allParties(payload);
  const forbidden = parties.find((a) => a.endsWith(`@${FORBIDDEN_DOMAIN}`));
  if (forbidden) {
    return {
      ok: false,
      reason: `${FORBIDDEN_DOMAIN} party (${forbidden}) — crossover mail, never ingested`,
    };
  }
  if (!parties.includes(CAPTURE_IDENTITY)) {
    return { ok: false, reason: `${CAPTURE_IDENTITY} is not an addressed party` };
  }
  return { ok: true };
}

export interface ContactMatch {
  person: Person; // may be an entityKind:"company" row — anchor decides
  email: string; // the counterpart address that matched
}

// Match the message's counterpart (everyone except Rob's capture address) to a
// CRM record by email. Rob's own record also carries the capture address, so
// excluding it here is what stops every email anchoring to Rob himself.
export function matchContact(
  data: NetworkData,
  payload: EmailPayload
): ContactMatch | null {
  const counterparts = allParties(payload).filter((a) => a !== CAPTURE_IDENTITY);
  for (const address of counterparts) {
    const person = data.people.find(
      (p) => p.email && p.email.trim().toLowerCase() === address
    );
    if (person) return { person, email: address };
  }
  return null;
}

// Deterministic id from the Gmail message id → upsert is idempotent and the
// same message re-delivered by n8n never duplicates a timeline row.
export function activityIdFor(messageId: string): string {
  return `n8n-email-${messageId}`;
}

export function emailToActivity(
  payload: EmailPayload,
  match: ContactMatch,
  nowIso: string
): Activity {
  const direction =
    extractAddress(payload.from) === CAPTURE_IDENTITY ? "outbound" : "inbound";
  const parsed = payload.date ? Date.parse(payload.date) : NaN;
  const occurredAt = Number.isNaN(parsed) ? nowIso : new Date(parsed).toISOString();
  const isCompany = match.person.entityKind === "company";
  const subject = payload.subject?.trim() || "(no subject)";
  return {
    id: activityIdFor(payload.messageId),
    // 0005 check: ≤1 of personId/orgId — company rows anchor as org.
    personId: isCompany ? undefined : match.person.id,
    orgId: isCompany ? match.person.id : undefined,
    createdBy: "n8n-gmail-capture",
    type: "email",
    source: "n8n",
    sourceContext: {
      channel: "email",
      direction,
      gmailMessageId: payload.messageId,
      threadId: payload.threadId,
      subject,
      from: extractAddress(payload.from),
      matchedAddress: match.email,
      capturedMailbox: CAPTURE_IDENTITY,
    },
    summary: payload.snippet?.trim()
      ? `${subject} — ${payload.snippet.trim()}`
      : subject,
    bookProtected: false,
    occurredAt,
    createdAt: nowIso,
  };
}
