"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/stats";
import { lastTouchDate, sourceContext, stageRank, touchReason } from "@/lib/repSource";
import type { Person, Vertical } from "@/lib/types";

// "My Accounts" — the rep's book, Attio-density list. Read-only glance (edits
// happen in the account workspace, one click away) so a row can be the whole
// click target with zero conflict against inline-edit affordances.

type SortKey = "priority" | "quoted" | "lastTouch";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "quoted", label: "Quoted $" },
  { key: "lastTouch", label: "Last touch" },
];

export default function RepAccountsList({
  people,
  verticals,
}: {
  people: Person[];
  verticals: Vertical[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const verticalById = useMemo(() => new Map(verticals.map((v) => [v.id, v])), [verticals]);

  const sorted = useMemo(() => {
    const arr = [...people];
    switch (sortKey) {
      case "quoted":
        return arr.sort((a, b) => (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0));
      case "lastTouch":
        return arr.sort((a, b) => (lastTouchDate(b) ?? "").localeCompare(lastTouchDate(a) ?? ""));
      default:
        return arr.sort(
          (a, b) => stageRank(a) - stageRank(b) || (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0)
        );
    }
  }, [people, sortKey]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-slate-600">sort:</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSortKey(s.key)}
            className={`rounded-md px-2.5 py-1 transition ${
              sortKey === s.key
                ? "bg-white/10 font-medium text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        {/* header row — desktop only, mobile cards carry their own labels */}
        <div className="hidden grid-cols-[minmax(0,2fr)_auto_minmax(0,90px)_minmax(0,90px)_minmax(0,1.4fr)_minmax(0,1.1fr)] gap-4 bg-white/5 px-4 py-2.5 text-xs uppercase tracking-wide text-slate-400 md:grid">
          <div>Account</div>
          <div>Stage</div>
          <div className="text-right">Quoted</div>
          <div>Last touch</div>
          <div>Next step</div>
          <div>Source</div>
        </div>

        <div className="divide-y divide-white/5">
          {sorted.map((p) => {
            const reason = touchReason(p);
            const ctx = sourceContext(p);
            const vertical = verticalById.get(p.verticalId);
            const touch = lastTouchDate(p);
            return (
              <Link
                key={p.id}
                href={`/rep/accounts/${p.id}`}
                className="grid grid-cols-1 gap-2 px-4 py-3 transition hover:bg-white/[0.04] md:grid-cols-[minmax(0,2fr)_auto_minmax(0,90px)_minmax(0,90px)_minmax(0,1.4fr)_minmax(0,1.1fr)] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100">
                    {p.name.replace(" (DEMO)", "")}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: vertical?.color }} />
                    <span className="truncate">{p.role ?? vertical?.name}</span>
                  </div>
                </div>

                <div>
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${reason.cls}`}>
                    {reason.label}
                  </span>
                </div>

                <div className="tabular text-sm text-slate-200 md:text-right">
                  <span className="text-[10px] uppercase tracking-wide text-slate-600 md:hidden">quoted </span>
                  {p.quotedAmount ? money(p.quotedAmount) : <span className="text-slate-600">—</span>}
                </div>

                <div className="text-sm text-slate-400">
                  <span className="text-[10px] uppercase tracking-wide text-slate-600 md:hidden">last touch </span>
                  {touch ?? <span className="text-slate-600">no contact yet</span>}
                </div>

                <div className="min-w-0 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-wide text-slate-600 md:hidden">next step </span>
                  {p.relationship ? (
                    <span className="line-clamp-1">{p.relationship}</span>
                  ) : (
                    <span className="text-slate-600">— set on open</span>
                  )}
                </div>

                <div className="min-w-0 truncate text-xs text-slate-500" title={ctx.detail}>
                  {ctx.source}
                </div>
              </Link>
            );
          })}
          {sorted.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Book is empty — leads route in via the intake API (Phase 5).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
