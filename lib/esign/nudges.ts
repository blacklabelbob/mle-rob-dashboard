// Q47 e-sign nudge engine — pure ladder per the decided walkthrough
// (docs/plans/esign-flow-walkthrough-2026-07-23.html §nudges), extending the
// overdue-watcher pattern (lib/integrity/overdue.ts): the CALLER reads rows
// and the clock, this module never does (CR-3). Cron/n8n wiring is a
// follow-up increment — nothing here sends; it PLANS deterministic actions
// the route will execute (emails via the sender workflow, flags via the
// flags ledger, `nudge` events as the idempotency ledger).
//
// Ladder (defaults; Rob tunes once real data exists):
//   viewed +24h, unsigned  → REP    "They opened it — call now."
//   sent   +2d,  unsigned  → CUSTOMER gentle reminder (same channel)
//   sent   +5d             → CUSTOMER second nudge + REP "who do I touch today"
//   sent   +10d            → CUSTOMER final notice — real expiry date named
//   sent   +14d            → ROB escalation + deal flagged Stalled
//   signed / voided / expired → ladder stops instantly
// Guardrails: max 3 customer touches per agreement · business-hours sends
// only (customer channel; internal rep/Rob flags file anytime) · every nudge
// = one `nudge` event, deduped per (request, rung) — re-runs never double-send.

export type NudgeRung =
  | "rep_viewed_24h"
  | "customer_sent_2d"
  | "customer_sent_5d"
  | "rep_sent_5d"
  | "customer_sent_10d"
  | "rob_sent_14d";

export const CUSTOMER_RUNGS: readonly NudgeRung[] = [
  "customer_sent_2d",
  "customer_sent_5d",
  "customer_sent_10d",
];

export const MAX_CUSTOMER_TOUCHES = 3;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface NudgeRequestRow {
  id: string;
  document_id: string;
  document_title: string;
  status: string; // pending | viewed | signed | voided | expired
  sent_to: string;
  signer_name: string | null;
  created_at: string; // = sent instant (request is created at send)
  viewed_at: string | null;
  signed_at: string | null;
  voided_at: string | null;
  expires_at: string;
}

export interface PriorNudge {
  request_id: string;
  rung: string; // meta.rung of prior `nudge` events
}

export interface NudgeAction {
  requestId: string;
  rung: NudgeRung;
  audience: "customer" | "rep" | "rob";
  email?: { to: string; subject: string; text: string };
  flagTitle: string; // deterministic — doubles as the flags-ledger dedupe key
  flagDetail: string;
  severity: "low" | "medium" | "high";
  markStalled?: { documentId: string };
}

// Business hours: 09:00–18:00 ET, Mon–Fri (customer sends only).
export function isBusinessHoursET(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    hour: "numeric",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= 9 && hour < 18;
}

function firstName(r: NudgeRequestRow): string {
  return (r.signer_name ?? "").split(/\s+/)[0] || "there";
}

interface RungDef {
  rung: NudgeRung;
  audience: NudgeAction["audience"];
  anchor: (r: NudgeRequestRow) => string | null; // timestamp the delay counts from
  afterMs: number;
  severity: NudgeAction["severity"];
}

const LADDER: RungDef[] = [
  { rung: "rep_viewed_24h", audience: "rep", anchor: (r) => r.viewed_at, afterMs: DAY, severity: "medium" },
  { rung: "customer_sent_2d", audience: "customer", anchor: (r) => r.created_at, afterMs: 2 * DAY, severity: "low" },
  { rung: "customer_sent_5d", audience: "customer", anchor: (r) => r.created_at, afterMs: 5 * DAY, severity: "low" },
  { rung: "rep_sent_5d", audience: "rep", anchor: (r) => r.created_at, afterMs: 5 * DAY, severity: "medium" },
  { rung: "customer_sent_10d", audience: "customer", anchor: (r) => r.created_at, afterMs: 10 * DAY, severity: "low" },
  { rung: "rob_sent_14d", audience: "rob", anchor: (r) => r.created_at, afterMs: 14 * DAY, severity: "high" },
];

function emailFor(rung: NudgeRung, r: NudgeRequestRow): NudgeAction["email"] | undefined {
  const expires = r.expires_at.slice(0, 10);
  if (rung === "customer_sent_2d") {
    return {
      to: r.sent_to,
      subject: `Reminder: ${r.document_title} is ready for your signature`,
      text:
        `Hi ${firstName(r)},\n\nJust a friendly reminder that "${r.document_title}" is ` +
        `waiting for your signature — the link in your earlier email still works and takes ` +
        `about two minutes on any device.\n\nQuestions? Just reply.\n\nRob Acheson\nMy Local Everything`,
    };
  }
  if (rung === "customer_sent_5d") {
    return {
      to: r.sent_to,
      subject: `Still open: ${r.document_title}`,
      text:
        `Hi ${firstName(r)},\n\n"${r.document_title}" is still waiting for your signature. ` +
        `If anything in it needs discussing before you sign, reply here or call — happy to walk ` +
        `through it.\n\nRob Acheson\nMy Local Everything`,
    };
  }
  if (rung === "customer_sent_10d") {
    return {
      to: r.sent_to,
      subject: `Your signing link for ${r.document_title} expires ${expires}`,
      text:
        `Hi ${firstName(r)},\n\nHeads up — your signing link for "${r.document_title}" ` +
        `expires on ${expires}. After that a new link has to be issued.\n\nIt takes about two ` +
        `minutes on any device.\n\nRob Acheson\nMy Local Everything`,
    };
  }
  return undefined; // rep/rob rungs are internal flags, not customer email
}

function flagCopy(rung: NudgeRung, r: NudgeRequestRow): { title: string; detail: string } {
  // Deterministic titles = flags-ledger dedupe keys (overdue.ts contract).
  switch (rung) {
    case "rep_viewed_24h":
      return {
        title: `E-sign: viewed but unsigned 24h — ${r.id}`,
        detail: `${r.signer_name ?? r.sent_to} opened "${r.document_title}" over 24h ago and hasn't signed. Hottest signal in the pipeline — call now.`,
      };
    case "rep_sent_5d":
      return {
        title: `E-sign: unsigned 5d — ${r.id}`,
        detail: `"${r.document_title}" sent to ${r.sent_to} 5 days ago, still unsigned. Second customer nudge sent; add a personal touch today.`,
      };
    case "rob_sent_14d":
      return {
        title: `E-sign STALLED: unsigned 14d — ${r.id}`,
        detail: `"${r.document_title}" (→ ${r.sent_to}) is 14 days unsigned. Deal flagged Stalled — Rob decision needed: chase personally, re-cut the deal, or void.`,
      };
    default:
      return {
        title: `E-sign nudge ${rung} — ${r.id}`,
        detail: `Nudge ${rung} for "${r.document_title}" → ${r.sent_to}.`,
      };
  }
}

// The planner. `prior` = every `nudge` event already written (meta.rung).
// Deterministic: same inputs → same plan, ordered by request id then ladder.
export function planNudges(
  requests: NudgeRequestRow[],
  prior: PriorNudge[],
  now: Date
): NudgeAction[] {
  const nowMs = now.getTime();
  const businessHours = isBusinessHoursET(now);
  const done = new Set(prior.map((p) => `${p.request_id}:${p.rung}`));
  const priorCustomerCount = (id: string) =>
    prior.filter((p) => p.request_id === id && (CUSTOMER_RUNGS as string[]).includes(p.rung)).length;

  const actions: NudgeAction[] = [];
  const sorted = [...requests].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sorted) {
    // Ladder stops instantly on any terminal state (walkthrough rule).
    if (r.signed_at || r.voided_at) continue;
    if (!["pending", "viewed"].includes(r.status)) continue;
    if (/^demo-/.test(r.id) || /^demo-/.test(r.document_id)) continue; // house DEMO rule
    if (nowMs >= Date.parse(r.expires_at)) continue; // expired = no sends, no flags

    let customerTouches = priorCustomerCount(r.id);
    for (const def of LADDER) {
      if (done.has(`${r.id}:${def.rung}`)) continue; // idempotent per (request, rung)
      const anchor = def.anchor(r);
      if (!anchor) continue; // e.g. never viewed → no rep_viewed_24h
      if (nowMs < Date.parse(anchor) + def.afterMs) continue; // not due yet
      if (def.audience === "customer") {
        if (customerTouches >= MAX_CUSTOMER_TOUCHES) continue; // hard cap
        if (!businessHours) continue; // deferred, not skipped — next run sends
        customerTouches += 1;
      }
      const { title, detail } = flagCopy(def.rung, r);
      actions.push({
        requestId: r.id,
        rung: def.rung,
        audience: def.audience,
        email: emailFor(def.rung, r),
        flagTitle: title,
        flagDetail: detail,
        severity: def.severity,
        ...(def.rung === "rob_sent_14d" ? { markStalled: { documentId: r.document_id } } : {}),
      });
    }
  }
  return actions;
}
