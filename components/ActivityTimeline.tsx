"use client";

import { useEffect, useState } from "react";
import { TIMELINE_TYPE_STYLE, type TimelineEntry, type TimelineEntryType } from "@/lib/repSource";

// Activity timeline on the account workspace. Tries the real feed first
// (/api/admin/activities — empty until Phase 8/9 logging lands); DEMO records
// with no real rows fall back to their hand-written demo history so the page
// doesn't look broken/empty for a live click-through. Real, non-demo records
// with no rows get an honest "nothing logged yet" shell — never fabricated.

const KNOWN_TYPES = new Set<TimelineEntryType>([
  "call", "email", "note", "quote", "meeting", "form", "signed", "payment",
]);

function normalize(row: Record<string, unknown>): TimelineEntry | null {
  const type = KNOWN_TYPES.has(row.type as TimelineEntryType) ? (row.type as TimelineEntryType) : "note";
  const summary = typeof row.summary === "string" ? row.summary : typeof row.detail === "string" ? row.detail : null;
  const when =
    typeof row.occurred_at === "string"
      ? row.occurred_at.slice(0, 10)
      : typeof row.when === "string"
        ? row.when
        : null;
  if (!summary || !when) return null;
  return { type, summary, when };
}

export default function ActivityTimeline({
  personId,
  demoEntries,
  isDemo,
}: {
  personId: string;
  demoEntries: TimelineEntry[];
  isDemo: boolean;
}) {
  const [real, setReal] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/activities?person=${personId}`)
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((j) => {
        if (!alive) return;
        const rows = Array.isArray(j.activities) ? j.activities : [];
        setReal(rows.map(normalize).filter((e: TimelineEntry | null): e is TimelineEntry => !!e));
      })
      .catch(() => alive && setReal([]));
    return () => {
      alive = false;
    };
  }, [personId]);

  const loading = real === null;
  const entries = real && real.length > 0 ? real : isDemo ? demoEntries : [];
  const usingDemo = (!real || real.length === 0) && isDemo && demoEntries.length > 0;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Activity</h2>
        {usingDemo && (
          <span
            className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-300"
            title="Fabricated demo history — real feed lands with activity logging (Phase 8/9)"
          >
            demo history
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600">loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Nothing logged yet — calls, emails, and touches will appear here automatically once
          activity logging lands (Phase 8/9).
        </p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-white/10 pl-4">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${TIMELINE_TYPE_STYLE[e.type]}`}
              />
              <div className="text-xs text-slate-500">{e.when}</div>
              <div className="text-sm text-slate-200">{e.summary}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
