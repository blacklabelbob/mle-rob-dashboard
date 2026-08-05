// Relative import, not "@/lib/stats": vitest has no path-alias config (only
// tsconfig/Next resolve "@/*"), and type-only imports elsewhere in lib/ get
// erased before resolution — this is a real value import, so it needs a path
// vitest can actually follow.
import { money } from "./stats";
import type { KeyDates, NodeStatus, Person } from "@/lib/types";

// Shared rep-facing helpers — used by /rep (cockpit) and /rep/accounts (CRM
// scaffold, Task 1b.3) so the two surfaces never drift on how "why touch this
// account" or "how did they get here" get computed.

// Minimal shape touchReason/stageRank actually need — lets the trimmed
// RepAccountListItem DTO (see below) satisfy these functions without ever
// widening back to a full Person on the client (Critic Rob punch #5).
export type TouchSignals = Pick<Person, "quotedAmount" | "signed" | "status" | "keyDates">;

// Paid is the apex (Rob's ruling, 2026-07-17: "paid client > signed" — never
// label collected money as a quote or a bare "signed"). Checked before every
// other branch, including quote-out, so a paid account can never regress to
// "follow up on this quote."
export function touchReason(p: TouchSignals): { label: string; cls: string } {
  if (p.keyDates?.paid)
    return { label: "client — paid", cls: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" };
  if (p.quotedAmount && !p.signed)
    return { label: "quote out — follow up", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" };
  if (p.status === "warm")
    return { label: "warm — keep momentum", cls: "border-orange-400/30 bg-orange-400/10 text-orange-300" };
  if (p.signed) return { label: "signed — client", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  return { label: "new — first touch", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
}

// Rank used for the default "priority" sort: money-on-the-table first, then
// warm, then signed/lit/paid (already closed, lowest urgency for a rep
// queue), then brand-new. Mirrors the work order in the cockpit queue.
export function stageRank(p: TouchSignals): number {
  if (p.keyDates?.paid) return 3;
  if (p.quotedAmount && !p.signed) return 0;
  if (p.status === "warm") return 1;
  if (p.signed) return 3;
  return 2;
}

// Exact money for rep surfaces — reps quote/read sub-$100k numbers a client
// can check against an invoice; money()'s whole-k rounding turns $9,500 into
// "$10k" and a $27,500 pipeline into "$28k" (Critic Rob punch #1 — "every
// stat needs to be right, he cites these"). money() itself stays untouched
// for admin rollups, where k/M rounding is the right call at that scale.
export function repMoney(n: number): string {
  if (n >= 1_000_000) return money(n);
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// Source context is the differentiator: pull the SOURCE block from
// description ("SOURCE: <short source>. <detail>"). Falls back to whatever
// relationship note exists so older/non-demo records still render something.
export function sourceContext(p: Person): { source: string; detail: string } {
  const d = p.description ?? "";
  const m = d.match(/^SOURCE:\s*([^.]+)\.\s*([\s\S]*)$/);
  if (m) return { source: m[1].trim(), detail: m[2].trim() };
  return { source: p.relationship ?? "unknown", detail: d };
}

/* ---------- activity timeline ---------- */

export type TimelineEntryType = "call" | "email" | "note" | "quote" | "meeting" | "form" | "signed" | "payment";

export interface TimelineEntry {
  type: TimelineEntryType;
  summary: string;
  when: string; // ISO date, YYYY-MM-DD
  /**
   * The activity row's own id, when the entry came from a real filed activity.
   * Q89 inc.17: this is what makes a row addressable — inc.16 refused to publish
   * `/companies/C-2018#A-MTG-…` precisely because no id reached the rendered row.
   * Hand-written demo history has none, and must not be given one.
   */
  id?: string;
}

export const TIMELINE_TYPE_STYLE: Record<TimelineEntryType, string> = {
  call: "bg-emerald-400",
  email: "bg-sky-400",
  note: "bg-slate-400",
  quote: "bg-amber-400",
  meeting: "bg-violet-400",
  form: "bg-sky-400",
  signed: "bg-emerald-400",
  payment: "bg-emerald-400",
};

// Hand-written per DEMO record so the timeline reads as a real rep history,
// not templated filler — and never contradicts what the record itself says
// (e.g. Dale is explicitly "no contact yet", so he gets none: an honest empty
// shell, not a fabricated call log). Real reps get a real feed once
// activity logging lands (Phase 8/9) — see app/api/admin/activities.
export const DEMO_ACTIVITY_BY_ID: Record<string, TimelineEntry[]> = {
  "demo-marcus-webb": [
    { type: "quote", summary: "Quote sent — $18,000 AI receptionist + missed-call textback", when: "2026-07-14" },
    { type: "email", summary: "Quote opened same day (read receipt)", when: "2026-07-14" },
    { type: "call", summary: "Follow-up call — no answer, voicemail left re: 3 lost storm calls/week", when: "2026-07-15" },
  ],
  "demo-priya-nair": [
    { type: "note", summary: "LinkedIn reply to Jake's derm-clinic pilot post — inbound interest", when: "2026-07-17" },
    { type: "call", summary: "Discovery call — confirmed 40+ abandoned calls/week across 2 locations", when: "2026-07-19" },
    { type: "email", summary: "Sent HIPAA compliance one-pager to close the open objection", when: "2026-07-20" },
  ],
  "demo-rita-alvarez": [
    { type: "signed", summary: "Signed — $12,000 Phase 1", when: "2026-07-02" },
    { type: "payment", summary: "Payment received — $12,000", when: "2026-07-10" },
    { type: "call", summary: "Kickoff call — she offered two agent-team intros unprompted", when: "2026-07-11" },
  ],
  "demo-sandra-ellis": [
    { type: "form", summary: "Website intake submitted — 9:40pm Sunday, \"where-is-my-file\" call volume", when: "2026-07-13" },
    { type: "call", summary: "Discovery call — confirmed status-line agent use case", when: "2026-07-15" },
    { type: "quote", summary: "Quote sent — $9,500 status-line AI agent", when: "2026-07-16" },
    { type: "email", summary: "One-pager sent for her + 2 reviewing attorneys", when: "2026-07-17" },
  ],
  "demo-tony-marchetti": [
    { type: "note", summary: "Referral mention — Daniella (Martin Fierro kitchen) name-dropped MLE to his driver", when: "2026-07-18" },
    { type: "call", summary: "Inbound call — Tony called Daniella directly to ask about it", when: "2026-07-19" },
    { type: "note", summary: "Wants to see it answer a live call before discussing numbers", when: "2026-07-19" },
  ],
  // demo-dale-hutchins intentionally absent — description says "no contact yet".
};

export function demoActivity(personId: string): TimelineEntry[] {
  return DEMO_ACTIVITY_BY_ID[personId] ?? [];
}

// "Last touch" — max(keyDates, activity timeline) so the list and the
// workspace timeline always agree (Critic Rob punch #8: Rita's list showed
// 7/10 from keyDates alone while her timeline's latest entry was 7/11).
// Real records pass no demoEntries and just get their keyDates; DEMO records
// additionally fold in their hand-written history from lib/repSource.
export function lastTouchDate(keyDates: KeyDates, demoEntries: TimelineEntry[] = []): string | null {
  const dates = [
    ...Object.values(keyDates ?? {}).filter((d): d is string => !!d),
    ...demoEntries.map((e) => e.when),
  ];
  if (!dates.length) return null;
  return dates.sort().at(-1) ?? null;
}

/* ---------- rep account list DTO ---------- */

// What the accounts LIST is allowed to know, full stop — mapped server-side
// before crossing into the "use client" RepAccountsList (Critic Rob punch #5:
// the full Person object, including `notes` and eventually `estimate`/AI
// revenue $, was landing in the RSC payload just because it was a prop on a
// client component). No admin fields, no raw description — only what's
// already rendered: the parsed source, and a precomputed lastTouch.
export interface RepAccountListItem {
  id: string;
  name: string;
  role?: string;
  verticalId: string;
  quotedAmount?: number;
  signed: boolean;
  status: NodeStatus;
  keyDates: KeyDates;
  relationship?: string; // next-step text (see workspace page for why this field)
  source: string;
  sourceDetail: string;
  lastTouch: string | null;
}

export function toRepAccountListItem(p: Person): RepAccountListItem {
  const ctx = sourceContext(p);
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    verticalId: p.verticalId,
    quotedAmount: p.quotedAmount,
    signed: p.signed,
    status: p.status,
    keyDates: p.keyDates,
    relationship: p.relationship,
    source: ctx.source,
    sourceDetail: ctx.detail,
    lastTouch: lastTouchDate(p.keyDates, demoActivity(p.id)),
  };
}
