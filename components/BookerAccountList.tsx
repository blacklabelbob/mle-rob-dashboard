"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  COLD_CALL_DAYS,
  filterBySignal,
  type AccountSignal,
  type AccountState,
} from "@/lib/booker/accountSignals";
import type { BookerAccountsRead } from "@/lib/booker/accountSignalsLoad";
import { displayHeadline } from "@/lib/booker/accountHeadline";

// Q82 inc.3 — the screen half. inc.1 built the rule, inc.2 the read; this is where
// "you can easily tell" (Rob, §5) actually happens.
//
// NOTHING IS HIDDEN, EVER. The default filter is "All accounts" — the ambiguity flagged in
// inc.1 (a literal reading of "all accounts except those…") is a one-line default change
// right here, and nowhere else, because every state is already emitted. Filtering is the
// booker's own choice, made in front of a count that always says how many rows exist in total.
//
// EVIDENCE OUTRANKS SIGNAL. inc.2 found this CRM has no calendar: zero future-dated meetings
// exist, so `no_upcoming_appointment` fires on every account. Rendering that as a red wall of
// "nothing booked" would be the dashboard asserting a fact about accounts when it holds a fact
// about itself. When evidence is `none_in_system` the badge reads as unknown, not as a finding,
// and a banner says which source is missing.

type FilterKey = "all" | AccountSignal;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All accounts" },
  { key: "no_upcoming_appointment", label: "No appointment" },
  { key: "cold_call", label: `No call in ${COLD_CALL_DAYS}d` },
  { key: "phase_1_plus", label: "Phase 1+" },
];

/** Signals whose meaning depends on a source that may not exist yet. */
type Evidence = { appointment: boolean; call: boolean };

function badgeClass(signal: AccountSignal, evidenced: boolean): string {
  if (signal === "phase_1_plus") return "border-slate-600/60 bg-slate-700/30 text-slate-300";
  if (!evidenced) return "border-slate-600/60 bg-slate-800/40 text-slate-400";
  return signal === "cold_call"
    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
    : "border-amber-400/40 bg-amber-400/10 text-amber-200";
}

function badgeLabel(state: AccountState, signal: AccountSignal, evidence: Evidence): string {
  if (signal === "phase_1_plus") return "Phase 1+";
  if (signal === "no_upcoming_appointment") {
    return evidence.appointment ? "No appointment" : "Appointment unknown";
  }
  if (!evidence.call) return "Call history unknown";
  return state.daysSinceLastCall === null
    ? "Never called"
    : `${state.daysSinceLastCall}d since call`;
}

const ROW_TONE: Record<AccountState["emphasis"], string> = {
  needs_action: "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
  normal: "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]",
  de_emphasised: "border-white/5 bg-transparent opacity-60 hover:opacity-100",
};

export default function BookerAccountList({ read }: { read: BookerAccountsRead }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const { accounts, counts, phaseUnknownCount } = read.states;

  const evidence: Evidence = {
    appointment: read.appointmentEvidence === "present",
    call: read.callEvidence === "present",
  };

  const shown = useMemo(
    () => (filter === "all" ? accounts : filterBySignal(accounts, filter)),
    [accounts, filter]
  );

  const missing: string[] = [];
  if (!evidence.appointment) missing.push("no appointment or calendar record exists in this CRM");
  if (!evidence.call) missing.push("no call has ever been logged");

  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-100">
          <span className="font-medium">
            {missing.length === 1 ? "One of these signals has" : "Two of these signals have"} no
            source yet.
          </span>{" "}
          {missing.join("; ")} — so those badges read <em>unknown</em> rather than claiming every
          account is unbooked or cold. The accounts are listed regardless; the gap is the
          system&apos;s, not theirs.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-slate-600">show:</span>
        {FILTERS.map((f) => {
          const n = f.key === "all" ? accounts.length : counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 transition ${
                filter === f.key
                  ? "bg-white/10 font-medium text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {f.label} <span className="tabular text-slate-500">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {shown.map((a) => (
          <Link
            key={a.accountId}
            href={`/people/${a.accountId}`}
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2.5 transition ${ROW_TONE[a.emphasis]}`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{a.name}</div>
              <div className="truncate text-xs text-slate-400">
                {displayHeadline(a, evidence)}
                {!a.phaseKnown && " · phase unreadable"}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {a.signals.map((s) => (
                <span
                  key={s}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${badgeClass(s, s === "cold_call" ? evidence.call : evidence.appointment)}`}
                >
                  {badgeLabel(a, s, evidence)}
                </span>
              ))}
              {a.signals.length === 0 && (
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-200">
                  On track
                </span>
              )}
            </div>
          </Link>
        ))}

        {shown.length === 0 && (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-sm text-slate-400">
            No account carries that signal right now.
          </div>
        )}
      </div>

      <div className="text-[11px] text-slate-500">
        {accounts.length} account{accounts.length === 1 ? "" : "s"} in the book — bookers
        see every one of them.
        {phaseUnknownCount > 0 &&
          ` ${phaseUnknownCount} with a phase we could not read (counted, not guessed).`}
        {read.internalExcluded > 0 &&
          ` ${read.internalExcluded} MLE staff record${read.internalExcluded === 1 ? "" : "s"} excluded — internal, not accounts.`}
      </div>
    </div>
  );
}
