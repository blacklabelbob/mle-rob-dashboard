"use client";

import { useState } from "react";
import {
  transcriptPanelFromResponse,
  transcriptPanelUnavailable,
  type PanelTurn,
  type TranscriptPanel,
} from "@/lib/calls/transcriptPanel";

// BUILD-QUEUE Q68 (b) inc.19 — THE LAST HOP: the words reach a human.
//
// Every increment from the webhook forward wrote a transcript further along the chain, and
// inc.18 decided every sentence a reader would be shown. This component is the markup over
// that view-model and NOTHING ELSE — it makes no decision about what a call state means, no
// string of its own, no fallback text. If it needed one, that string would belong in
// lib/calls/transcriptPanel.ts where it can be tested (CR-3).
//
// TWO THINGS THAT ARE NOT COSMETIC:
//
//  1. IT DOES NOT FETCH UNTIL ASKED. A person page can list a dozen calls; auto-loading
//     would put verbatim customer speech on screen for every one of them, on a prod Rob
//     left unauthenticated (Q64), for a reader who wanted the summary. Expanding is a
//     deliberate act — and it is also why one open transcript never re-fetches.
//
//  2. CONFIDENCE IS A WORD, NOT A NUMBER OR A COLOUR ALONE. `low` says re-listen before
//     quoting; `unknown` says nothing measured this. A bare colour would be read as
//     "quality", and a percentage would be read as accuracy — inc.18's rule, held here.

function ConfidenceMark({ confidence }: { confidence: PanelTurn["confidence"] }) {
  if (confidence === "ok") return null;
  const low = confidence === "low";
  return (
    <span
      className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] align-middle ${
        low
          ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
          : "border-white/15 bg-white/5 text-slate-400"
      }`}
      title={
        low
          ? "The provider was unsure of part of this turn — re-listen before quoting it"
          : "The provider scored only part of this turn — nothing checked the rest"
      }
    >
      {low ? "check audio" : "unscored"}
    </span>
  );
}

export default function CallTranscript({ recordingSid }: { recordingSid: string }) {
  const [panel, setPanel] = useState<TranscriptPanel | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/calls/transcript?recordingSid=${encodeURIComponent(recordingSid)}`
      );
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // A body that is not JSON is a transport answer, not a call state — the parser
        // below turns a 200 with an unreadable body into `unavailable`, same as a 503.
      }
      setPanel(transcriptPanelFromResponse(res.status, body));
    } catch {
      // The request never completed. "We could not ask" — never "this call has no words".
      setPanel(transcriptPanelUnavailable());
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !panel && !loading) void load();
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={toggle}
        className="text-[11px] text-sky-400 underline-offset-2 hover:underline"
        aria-expanded={open}
      >
        {open ? "hide transcript" : "transcript"}
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-white/10 bg-black/20 p-3">
          {loading || !panel ? (
            <p className="text-xs text-slate-500">loading…</p>
          ) : (
            <>
              {panel.headline && <p className="text-xs text-slate-400">{panel.headline}</p>}

              {panel.state === "ready" && (
                <>
                  {panel.speakerCount > 1 && (
                    <p className="mb-2 text-[11px] text-slate-500">
                      {panel.speakerCount} speakers separated
                    </p>
                  )}
                  <ol className="space-y-2">
                    {panel.turns.map((t) => (
                      <li key={t.key} className="text-xs">
                        <span className="text-slate-500">
                          {t.time ? `${t.time} · ` : ""}
                          {t.label}
                        </span>
                        <ConfidenceMark confidence={t.confidence} />
                        <p className="mt-0.5 text-slate-200">{t.text}</p>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {/* Operator notice. Typed apart from `headline` upstream so it can never be
                  rendered where the words go — kept visually apart here for the same reason. */}
              {panel.notice && (
                <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-amber-300/80">
                  {panel.notice}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
