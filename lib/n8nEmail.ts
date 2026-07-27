import { type EmailDirection, type GraphIndex, planEmailGraph } from "./comms/emailGraph";
import { buildGraphIndex } from "./comms/emailGraphIndex";
import {
  CROSSOVER_DOMAIN,
  DEFAULT_MAILBOX_LINK,
  type MailboxLink,
} from "./comms/mailboxLink";
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
// Q69 inc.7: both constants now come from the mailbox-link registry, so the
// connected mailbox and the identity rule have exactly one definition. The
// `link` parameters below default to the sole connected mailbox — callers that
// handle multiple mailboxes resolve one explicitly (resolveMailboxLink) and
// pass it through, which is what keeps a second inbox from filing as Rob's.
export const CAPTURE_IDENTITY = DEFAULT_MAILBOX_LINK.address;
export const FORBIDDEN_DOMAIN = CROSSOVER_DOMAIN;

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
  // Which connected mailbox this was captured from — the link id or the
  // address. Optional only while exactly one mailbox is connected.
  mailbox?: string;
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

export function identityGate(
  payload: EmailPayload,
  link: MailboxLink = DEFAULT_MAILBOX_LINK
): GateVerdict {
  const parties = allParties(payload);
  const forbidden = parties.find((a) => a.endsWith(`@${FORBIDDEN_DOMAIN}`));
  if (forbidden) {
    return {
      ok: false,
      reason: `${FORBIDDEN_DOMAIN} party (${forbidden}) — crossover mail, never ingested`,
    };
  }
  // The mailbox that captured it must be an addressed party: a message n8n
  // hands us stamped with a mailbox nobody on the thread used is a routing bug,
  // and ingesting it would put a stranger's thread on Rob's timeline.
  if (!parties.includes(link.address)) {
    return { ok: false, reason: `${link.address} is not an addressed party` };
  }
  return { ok: true };
}

export interface ContactMatch {
  person: Person; // may be an entityKind:"company" row — anchor decides
  email: string; // the counterpart address that matched
  matchedBy: "person-email" | "org-domain"; // which rung anchored it
}

// The direction of the message from OUR side: Rob sending is outbound. The
// ladder needs this because rung 6/7 turn on it — sending to a new domain may
// propose a company, receiving from one may not.
export function directionOf(
  payload: EmailPayload,
  link: MailboxLink = DEFAULT_MAILBOX_LINK
): EmailDirection {
  return extractAddress(payload.from) === link.address ? "outbound" : "inbound";
}

// Match the message's counterpart (everyone except Rob's capture address) to a
// CRM record. Rob's own record also carries the capture address, so excluding
// it here is what stops every email anchoring to Rob himself.
//
// Q69 inc.2: this used to be rung 1 alone — an exact `people.email` hit — so a
// new person at a company we already know fell off the CRM entirely. It now
// runs the whole ladder (lib/comms/emailGraph.ts). Rung 3 anchors that mail to
// the ORG, which is the difference between a timeline and a CRM.
//
// Every counterpart is walked to the end before settling, and a person beats an
// org: on a thread where a known contact is cc'd alongside a stranger at the
// same company, the mail belongs on the human's record, not the company's —
// which address happened to be listed first is not a ranking.
export function matchContact(
  data: NetworkData,
  payload: EmailPayload,
  index: GraphIndex = buildGraphIndex(data),
  link: MailboxLink = DEFAULT_MAILBOX_LINK
): ContactMatch | null {
  const counterparts = allParties(payload).filter((a) => a !== link.address);
  const direction = directionOf(payload, link);
  const byId = new Map(data.people.map((p) => [p.id, p]));
  let orgMatch: ContactMatch | null = null;

  for (const address of counterparts) {
    const plan = planEmailGraph(address, direction, index);
    if (plan.kind === "person") {
      const person = byId.get(plan.personId);
      // An index entry with no row behind it is a stale index, not a match —
      // fabricating an anchor here would put the mail on nobody's timeline.
      if (person) return { person, email: address, matchedBy: "person-email" };
    } else if (plan.kind === "org" && !orgMatch) {
      const org = byId.get(plan.orgId);
      if (org) orgMatch = { person: org, email: address, matchedBy: "org-domain" };
    }
  }
  return orgMatch;
}

// Deterministic id from the Gmail message id → upsert is idempotent and the
// same message re-delivered by n8n never duplicates a timeline row.
export function activityIdFor(messageId: string): string {
  return `n8n-email-${messageId}`;
}

export function emailToActivity(
  payload: EmailPayload,
  match: ContactMatch,
  nowIso: string,
  link: MailboxLink = DEFAULT_MAILBOX_LINK
): Activity {
  const direction = directionOf(payload, link);
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
      // Which rung anchored it. An org-domain match means the human is NOT in
      // the CRM yet — the rep reading the row should see that, not guess.
      matchedBy: match.matchedBy,
      // The link_id invariant: every captured row names the mailbox it came
      // from, so "which identity received this" is data, not an assumption.
      capturedMailbox: link.address,
      mailboxLinkId: link.linkId,
    },
    summary: payload.snippet?.trim()
      ? `${subject} — ${payload.snippet.trim()}`
      : subject,
    bookProtected: false,
    occurredAt,
    createdAt: nowIso,
  };
}
