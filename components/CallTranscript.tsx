"use client";

import { useRef, useState } from "react";
import {
  transcriptPanelFromResponse,
  transcriptPanelUnavailable,
  type PanelTurn,
  type TranscriptPanel,
} from "@/lib/calls/transcriptPanel";
import { searchPanelFromBody, type SearchPanel } from "@/lib/calls/searchPanel";
import { markedPieces } from "@/lib/calls/markedText";
import { momentRows } from "@/lib/calls/momentList";

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
//
// inc.26 — SEARCH ARRIVES, AND THE STALENESS RULE COMES WITH IT.
//
//  3. MARKS BELONG TO THE LOAD THEY CAME FROM. Offsets describe ONE rendering of the turns
//     (inc.25 rule 2). So the search panel is set, and cleared, in the SAME assignment as
//     the transcript panel — never left over from the previous query. A stale highlight is
//     not a stale UI detail: it paints a phrase onto words that were never matched, and it
//     looks exactly like a correct answer.
//
//  4. A FAILED LOAD CLEARS THE ANSWER. "3 moments" left on screen beside "we could not read
//     this call" is the zero-vs-unsearchable confusion of inc.23 rebuilt in the browser.
//
// inc.27 — THE MOMENTS BECOME PLACES YOU CAN GO.
//
//  5. THE JUMP TARGET IS A REF, NOT A DOM id. A person page can show a dozen calls, each with
//     its own transcript. `id="turn-3"` is unique inside ONE of them and duplicated across the
//     page, so `getElementById` scrolls to whichever call rendered first — the rep lands on a
//     different customer's words with no error anywhere. Refs are per-instance by
//     construction, which is why there is no id scheme here to get wrong.

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

/** A turn's words with the matched spans marked. The cut is decided in lib (inc.26). */
function TurnText({ text, marks }: { text: string; marks: { start: number; end: number }[] }) {
  const pieces = markedPieces(text, marks);
  return (
    <p className="mt-0.5 text-slate-200">
      {pieces.map((p, i) =>
        p.marked ? (
          <mark key={i} className="rounded bg-amber-300/25 px-0.5 text-amber-100">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  );
}

export default function CallTranscript({ recordingSid }: { recordingSid: string }) {
  const [panel, setPanel] = useState<TranscriptPanel | null>(null);
  const [search, setSearch] = useState<SearchPanel | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // Rule 5: per-instance turn elements, keyed by `PanelTurn.key`. No page-wide id namespace.
  const turnEls = useRef(new Map<number, HTMLLIElement | null>());
  const [landedOn, setLandedOn] = useState<number | null>(null);

  function jump(turnKey: number) {
    const el = turnEls.current.get(turnKey);
    if (!el) return; // Nothing to scroll to is silence, not a scroll to the top of the list.
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // The marks say WHICH WORDS matched; this says which turn we just moved you to, because
    // a smooth scroll that lands mid-transcript gives no other signal that anything happened.
    setLandedOn(turnKey);
  }

  async function load(q?: string) {
    setLoading(true);
    // Same family as rule 3: an emphasised turn belongs to the query that sent you there.
    setLandedOn(null);
    try {
      const params = new URLSearchParams({ recordingSid });
      // An empty box is not an empty search — it is no search (inc.24 rule). The param is
      // omitted entirely rather than sent blank, which the route answers with a 400.
      if (q?.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/calls/transcript?${params.toString()}`);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // A body that is not JSON is a transport answer, not a call state — the parser
        // below turns a 200 with an unreadable body into `unavailable`, same as a 503.
      }
      const next = transcriptPanelFromResponse(res.status, body);
      setPanel(next);
      // Rule 3: the marks are placed against THESE turns, in the same assignment.
      setSearch(searchPanelFromBody(body, next.turns));
    } catch {
      // The request never completed. "We could not ask" — never "this call has no words".
      setPanel(transcriptPanelUnavailable());
      setSearch(null); // Rule 4.
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

                  <form
                    className="mb-2 flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!loading) void load(query);
                    }}
                  >
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      // Refused at entry, never truncated after the fact (inc.24 rule): a cut
                      // needle answers a question the rep never typed.
                      maxLength={200}
                      placeholder="find a moment in this call"
                      aria-label="Search this transcript"
                      className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5 disabled:opacity-40"
                    >
                      find
                    </button>
                  </form>

                  {/* Absent `search` → no panel at all. "0 results" for an un-asked question
                      is the shape inc.24 and inc.25 both exist to prevent. */}
                  {search && (
                    <p className="mb-2 text-[11px] text-amber-200/80">{search.headline}</p>
                  )}

                  {/* The jump list. Rows come from lib (inc.27) — the ellipses are printed
                      BESIDE the words, never inside them, because the snippet is verbatim
                      customer speech a rep may copy. */}
                  {search && search.moments.length > 0 && (
                    <ul className="mb-3 space-y-1 border-l border-amber-300/20 pl-2">
                      {momentRows(search.moments).map((r) => (
                        <li key={r.key}>
                          <button
                            type="button"
                            onClick={() => jump(r.turnKey)}
                            aria-label={r.jumpLabel}
                            className="w-full rounded px-1 py-0.5 text-left text-[11px] text-slate-400 hover:bg-white/5"
                          >
                            <span className="text-slate-500">
                              {r.time ? `${r.time} · ` : ""}
                              {r.label}
                            </span>{" "}
                            <span className="text-slate-300">
                              {r.leadEllipsis && <span className="text-slate-600">… </span>}
                              {r.snippet}
                              {r.trailEllipsis && <span className="text-slate-600"> …</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ol className="space-y-2">
                    {panel.turns.map((t) => (
                      <li
                        key={t.key}
                        ref={(el) => {
                          turnEls.current.set(t.key, el);
                        }}
                        className={`rounded text-xs ${
                          landedOn === t.key ? "bg-amber-300/5 ring-1 ring-amber-300/20" : ""
                        }`}
                      >
                        <span className="text-slate-500">
                          {t.time ? `${t.time} · ` : ""}
                          {t.label}
                        </span>
                        <ConfidenceMark confidence={t.confidence} />
                        <TurnText text={t.text} marks={search?.marks[t.key] ?? []} />
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {/* A search against a call with no words on screen still answers — and says
                  "nothing to search", never "not said" (inc.25 rule 1). */}
              {panel.state !== "ready" && search && (
                <p className="mt-2 text-[11px] text-amber-200/80">{search.headline}</p>
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
