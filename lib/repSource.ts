import type { Person } from "@/lib/types";

// Shared rep-facing helpers — used by /rep (cockpit) and /rep/accounts (CRM
// scaffold, Task 1b.3) so the two surfaces never drift on how "why touch this
// account" or "how did they get here" get computed.

export function touchReason(p: Person): { label: string; cls: string } {
  if (p.quotedAmount && !p.signed)
    return { label: "quote out — follow up", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" };
  if (p.status === "warm")
    return { label: "warm — keep momentum", cls: "border-orange-400/30 bg-orange-400/10 text-orange-300" };
  if (p.signed) return { label: "signed — client", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  return { label: "new — first touch", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" };
}

// Rank used for the default "priority" sort: money-on-the-table first, then
// warm, then signed/lit (already closed, lowest urgency for a rep queue),
// then brand-new. Mirrors the work order in the cockpit queue.
export function stageRank(p: Person): number {
  if (p.quotedAmount && !p.signed) return 0;
  if (p.status === "warm") return 1;
  if (p.signed) return 3;
  return 2;
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

// "Last touch" for the accounts list — derived from real data only (never the
// demo timeline, so the list and the workspace agree with what's actually on
// the record): the most recent of the person's keyDates.
export function lastTouchDate(p: Person): string | null {
  const dates = Object.values(p.keyDates ?? {}).filter((d): d is string => !!d);
  if (!dates.length) return null;
  return dates.sort().at(-1) ?? null;
}
