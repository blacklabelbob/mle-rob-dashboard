"use client";

import { useCallback, useEffect, useState } from "react";
import { TIMELINE_TYPE_STYLE, type TimelineEntry, type TimelineEntryType } from "@/lib/repSource";
import {
  activityAnchorId,
  activityFeedQuery,
  type TimelineSubject,
} from "@/lib/activities/timelineSubject";
import { awaitingSummaryLine, callDetail, type CallTimelineDetail } from "@/lib/calls/callTimeline";
import CallTranscript from "./CallTranscript";
import CallRecording from "./CallRecording";

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
  // Q89 inc.17: the row's own id travels with it so the row can be linked to. It is only
  // ever the stored id — never synthesised from the summary or the date, because a
  // made-up address is exactly the unfollowable link this surface exists to prevent.
  const id = typeof row.id === "string" ? row.id : undefined;
  return { type, summary, when, call, id };
}

function CallDetail({ detail }: { detail: CallTimelineDetail }) {
  // Q68 inc.32: the row is where the player and the transcript meet — the two components are
  // siblings, so the seek handle is lifted to their parent rather than reached for through the
  // DOM. State, not a bare ref: the transcript must RE-RENDER when the handle appears or is
  // retracted, or its jump list keeps planning against whatever was true on first paint.
  const [seek, setSeek] = useState<((seconds: number) => void) | null>(null);
  // Stable identity: an inline arrow would re-run the publisher effect on every render of this
  // row, retracting and re-publishing the handle in a loop.
  const registerSeek = useCallback((fn: ((seconds: number) => void) | null) => {
    // Wrapped in a thunk — React treats a bare function passed to a setter as an updater.
    setSeek(() => fn);
  }, []);

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
        </div>
      )}

      {/* Q68 inc.31: the player replaces what used to be a raw link to the Twilio URL —
          account-protected, so it 401'd the rep, and unprotected it would have been customer
          speech on a login-free URL (recordingAudio rule 3). Playback goes through our route. */}
      <CallRecording
        recordingSid={detail.recordingSid}
        recordingUrl={detail.recordingUrl}
        direction={detail.direction}
        duration={detail.duration}
        registerSeek={registerSeek}
      />

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

      {/* Q68 inc.19: only rows that carry a recording sid can be asked about — a null sid
          makes NO request rather than one the route would 400. */}
      {detail.recordingSid && <CallTranscript recordingSid={detail.recordingSid} seek={seek} />}
    </div>
  );
}

export default function ActivityTimeline({
  subject,
  demoEntries,
  isDemo,
}: {
  // Q89 inc.17: a person page and a company page ask the same feed different questions.
  // Passing a bare id let the company page ask for a person that does not exist and
  // render the empty answer as fact.
  subject: TimelineSubject;
  demoEntries: TimelineEntry[];
  isDemo: boolean;
}) {
  const [real, setReal] = useState<Entry[] | null>(null);
  const query = activityFeedQuery(subject);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/activities?${query}`)
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
  }, [query]);

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
          {entries.map((e, i) => {
            // Q89 inc.17: the row becomes the anchor target. `scroll-mt` keeps a jumped-to
            // row clear of the sticky header rather than tucked under it. No id → no
            // anchor stamped, and nothing may publish a url claiming otherwise.
            const anchor = activityAnchorId(e.id);
            return (
            <li key={anchor ?? `i${i}`} id={anchor ?? undefined} className="relative scroll-mt-24">
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
            );
          })}
        </ol>
      )}
    </section>
  );
}
