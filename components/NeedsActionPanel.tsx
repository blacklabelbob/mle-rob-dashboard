"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// PRD Task MC.13: the Rob/ops "Needs Action Today" widget. Rendering only —
// every rule lives in lib/tasks/needsActionRules.ts and evaluates in
// needsActionEval.ts (CR-3); this panel just shows /api/admin/needs-action.
// `blocked` is the honest-coverage contract: rules that can't run yet are
// said out loud in plain language, never silently omitted.

type Item = {
  ruleId: string;
  dealId: string;
  personId?: string;
  orgId?: string;
  reason: string;
};

type Blocked = { ruleId: string; reason: string };

type Feed = { today: string; count: number; items: Item[]; blocked: Blocked[] };

// Plain-language labels (Rob's no-jargon bar) — rule ids stay internal.
const RULE_LABEL: Record<string, string> = {
  new_lead_untouched: "New lead untouched",
  discovery_reminder_missing: "Discovery reminder",
  proposal_lag: "Proposal overdue",
  followup_lag: "Follow-up overdue",
  signed_not_invoiced: "Signed, not invoiced",
};

export default function NeedsActionPanel() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/needs-action")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: Feed) => {
        if (!cancelled) setFeed(f);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-300">
          Needs action today
          {feed && feed.count > 0 && (
            <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              {feed.count}
            </span>
          )}
        </h2>
        <Link href="/deals" className="text-xs text-sky-400 hover:underline">
          pipeline →
        </Link>
      </div>

      {failed ? (
        <p className="mt-2 text-xs text-slate-500">
          Couldn&apos;t load the SLA feed just now — the pipeline board still has everything.
        </p>
      ) : !feed ? (
        <p className="mt-2 text-xs text-slate-600">Checking SLAs…</p>
      ) : feed.items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Nothing over SLA today — first touches, proposals, follow-ups and invoicing are all
          inside their windows.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-white/5">
          {feed.items.map((it) => (
            <li key={`${it.ruleId}:${it.dealId}`} className="flex items-start gap-2.5 py-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.6)]" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">
                  {RULE_LABEL[it.ruleId] ?? it.ruleId}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{it.reason}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {feed && feed.blocked.length > 0 && (
        <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-slate-600">
          Not yet watched: {feed.blocked.map((b) => RULE_LABEL[b.ruleId] ?? b.ruleId).join(", ")} —
          needs booking data that isn&apos;t in the CRM yet.
        </p>
      )}
    </section>
  );
}
