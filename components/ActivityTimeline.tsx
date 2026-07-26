"use client";

import { useEffect, useState } from "react";
import { TIMELINE_TYPE_STYLE, type TimelineEntry, type TimelineEntryType } from "@/lib/repSource";
import { awaitingSummaryLine, callDetail, type CallTimelineDetail } from "@/lib/calls/callTimeline";

// Activity timeline on the account workspace. Tries the real feed first
// (/api/admin/activities — empty until Phase 8/9 logging lands); DEMO records
// with no real rows fall back to their hand-written demo history so the page
// doesn't look broken/empty for a live click-through. Real, non-demo records
// with no rows get an honest "nothing logged yet" shell — never fabricated.
//
// Q68 (c) inc.14: recorded calls render their detail (action items, buying signals,
// recording link) and — the fix that matters — a call with NO summary yet is no longer
// dropped for lacking one. Rules live in lib/calls/callTimeline.ts (pure, tested).

const KNOWN_TYPES = new Set<TimelineEntryType>([
  "call", "email", "note", "quote", "meeting", "form", "signed", "payment",
]);

type Entry = TimelineEntry & { call?: CallTimelineDetail };

function normalize(row: Record<string, unknown>): Entry | null {
  const type = KNOWN_TYPES.has(row.type as TimelineEntryType) ? (row.type as TimelineEntryType) : "note";
  const call = callDetail(row) ?? undefined;
  const prose = typeof row.summary === "string" ? row.summary : typeof row.detail === "string" ? row.detail : null;
  // A filed call keeps its place on the timeline without prose; everything else still
  // needs something to say, or there is nothing to show.
  const summary = prose?.trim() || (call ? awaitingSummaryLine(call) : null);
  const when =
    typeof row.occurred_at === "string"
      ? row.occurred_at.slice(0, 10)
      : typeof row.when === "string"
        ? row.when
        : null;
  if (!summary || !when) return null;
  return { type, summary, when, call };
}

function CallDetail({ detail }: { detail: CallTimelineDetail }) {
  const meta = [
    detail.state === "summarised" && detail.direction
      ? detail.direction === "inbound" ? "inbound" : "outbound"
      : null,
    detail.state === "summarised" ? detail.duration : null,
  ].filter(Boolean);

  return (
    <div className="mt-1.5 space-y-1.5">
      {(meta.length > 0 || detail.truncated || detail.recordingUrl) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {meta.map((m) => (
            <span key={m as string}>{m}</span>
          ))}
          {detail.truncated && (
            <span
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-amber-300"
              title="The model saw only part of this transcript — the summary may miss what came later"
            >
              partial transcript
            </span>
          )}
          {detail.recordingUrl && (
            <a
              href={detail.recordingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 underline-offset-2 hover:underline"
            >
              recording
            </a>
          )}
        </div>
      )}

      {detail.actionItems && detail.actionItems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-300">
          {detail.actionItems.map((a, i) => (
            <li key={i}>▢ {a}</li>
          ))}
        </ul>
      )}

      {detail.signals?.map((s, i) => (
        <div key={i} className="text-xs text-emerald-300/90">
          {s.label} — <span className="text-slate-400">“{s.quote}”</span>
        </div>
      ))}
    </div>
  );
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
  const [real, setReal] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/activities?person=${personId}`)
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((j) => {
        if (!alive) return;
        const rows = Array.isArray(j.activities) ? j.activities : [];
        setReal(rows.map(normalize).filter((e: Entry | null): e is Entry => !!e));
      })
      .catch(() => alive && setReal([]));
    return () => {
      alive = false;
    };
  }, [personId]);

  const loading = real === null;
  // Demo history is TimelineEntry only — it carries no call detail and must not: the
  // fallback is hand-written prose, and a fabricated recording link is exactly the lie the
  // "demo history" badge exists to prevent.
  const entries: Entry[] = real && real.length > 0 ? real : isDemo ? demoEntries : [];
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
          Nothing logged yet — emails, calls, and touches will appear here automatically as
          capture comes online (email capture is armed; calls land with the dialer).
        </p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-white/10 pl-4">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${TIMELINE_TYPE_STYLE[e.type]}`}
              />
              <div className="text-xs text-slate-500">{e.when}</div>
              <div
                className={`text-sm ${
                  e.call?.state === "awaiting-summary" ? "text-slate-400 italic" : "text-slate-200"
                }`}
              >
                {e.summary}
              </div>
              {e.call && <CallDetail detail={e.call} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
