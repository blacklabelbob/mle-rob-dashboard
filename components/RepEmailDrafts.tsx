"use client";

import { useState } from "react";
import type { RepEmailDraftView } from "@/lib/rep/emailTemplates";

// Q46 R6 inc.2 — the template picker, on the page the rep works from. This file
// renders and hands off; it decides nothing.
//
// WHAT LIVES WHERE: which templates apply, whether a draft is sendable, and what
// a rep is told when it is not all come from `lib/rep/emailTemplates` (resolved
// on the server, in the same render that already loaded the record). This
// component holds one piece of state — which template is selected — because that
// is the only question it is qualified to answer. A second opinion about
// readiness here is the drift that shows a rep an enabled button over an
// unmergeable draft (CR-3).
//
// THE BLOCKER IS THE FEATURE. A draft that cannot send prints its reason in the
// rep's own words, and the reason names the place it is fixed: an address goes in
// Contact, a business name on the record, a broken template is ours. One disabled
// button for all three would hide that only some are the rep's to fix.
//
// NOTHING IS SENT FROM HERE. Both buttons are handoffs into the rep's OWN
// mailbox — Gmail compose or their default mail client — so the mail leaves under
// their name and lands in their real Sent folder. Send-as-rep is 4.6b; until
// then a draft nobody opened is a draft nobody sent, and that is the honest
// state.

export default function RepEmailDrafts({
  drafts,
  stageNote,
  anchorId = "rep-email",
}: {
  drafts: RepEmailDraftView[];
  /**
   * Which stage these drafts were written for, in the caller's words. The caller
   * owns it because only the caller knows WHY a stage was or was not used — one
   * anchored deal, none, or more than one are three different sentences, and
   * "no deal yet" printed over an ambiguous record would be a lie.
   */
  stageNote: string;
  anchorId?: string;
}) {
  const [selectedId, setSelectedId] = useState(drafts[0]?.templateId);
  const draft = drafts.find((d) => d.templateId === selectedId) ?? drafts[0];

  return (
    <section id={anchorId} className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Email</h2>
        {/* No deal is its own fact, never dressed up as a stage nobody set. */}
        <span className="text-[11px] text-slate-500">{stageNote}</span>
      </div>

      {drafts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No template written for this stage yet — write it yourself, or ask for one.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {drafts.map((d) => (
              <button
                key={d.templateId}
                type="button"
                onClick={() => setSelectedId(d.templateId)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  d.templateId === draft?.templateId
                    ? "border-sky-400/60 bg-sky-400/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {d.label}
                {d.state !== "ready" && <span className="ml-1.5 text-amber-300">·</span>}
              </button>
            ))}
          </div>

          {draft && (
            <div className="mt-4">
              {draft.state === "ready" ? (
                <>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">to</div>
                    <div className="text-sm text-slate-200">{draft.to}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
                      subject
                    </div>
                    <div className="text-sm font-medium text-white">{draft.subject}</div>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                      {draft.body}
                    </pre>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {draft.gmailUrl && (
                      <a
                        href={draft.gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-sky-500/90 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400"
                      >
                        Open in Gmail
                      </a>
                    )}
                    {draft.mailtoUrl && (
                      <a
                        href={draft.mailtoUrl}
                        className="rounded-lg bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                      >
                        My mail app
                      </a>
                    )}
                    <span className="text-[11px] text-slate-500">
                      Opens in your own mailbox — edit it before you send. Nothing is sent from
                      here.
                    </span>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
                    {draft.state === "no_recipient" ? "nowhere to send it" : "not ready to fill"}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-amber-100">
                    {draft.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
