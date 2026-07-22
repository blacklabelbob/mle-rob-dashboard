"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Floating dev-chat panel: Rob talks to Max while looking at the dashboard.
// Renders only when NEXT_PUBLIC_DEV_CHAT=1. Polls every 5s.

type Msg = { id: number; author: "rob" | "max" | "system"; body: string; created_at: string };

export default function DevChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [sendError, setSendError] = useState(false);
  const lastId = useRef(0);
  const openRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  openRef.current = open;

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/dev-chat?after=${lastId.current}`);
      if (!r.ok) return;
      const { messages } = (await r.json()) as { messages: Msg[] };
      if (messages.length) {
        lastId.current = messages[messages.length - 1].id;
        setMsgs((m) => [...m, ...messages]);
        if (!openRef.current) {
          setUnseen((u) => u + messages.filter((x) => x.author === "max").length);
        }
      }
    } catch {
      /* dashboard must never break because dev chat is down */
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (open) {
      setUnseen(0);
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }
  }, [open, msgs]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(false);
    try {
      const r = await fetch("/api/dev-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (r.ok) {
        setDraft("");
        await poll();
      } else {
        setSendError(true); // never silently eat Rob's message — draft stays in the box
      }
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[420px] w-[340px] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0b1120] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-white">Dev chat with Max</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">dev only</span>
          </div>
          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <p className="text-xs text-slate-500">
                Tell Max what to change while you look at it. Say which page you&apos;re on — messages land in his queue even when he&apos;s not live.
              </p>
            )}
            {msgs.map((m) =>
              m.author === "system" ? (
                <div key={m.id} className="py-0.5 text-center text-[10px] text-slate-600">
                  {m.body}
                </div>
              ) : (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.author === "rob"
                    ? "ml-auto bg-amber-400/15 text-amber-100"
                    : "bg-white/10 text-slate-200"
                }`}
              >
                <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-60">
                  {m.author === "rob" ? "Rob" : "Max"}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
              )
            )}
          </div>
          {sendError && (
            <div className="border-t border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
              Send failed — your message is still in the box. Hit Send again.
            </div>
          )}
          {msgs.length > 0 && msgs[msgs.length - 1].author === "rob" && (
            <div className="border-t border-white/10 px-3 py-1 text-[10px] text-slate-500">
              Delivered · Max checks every ~10 min (instant when he&apos;s live)
            </div>
          )}
          <div className="flex gap-2 border-t border-white/10 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="e.g. People page — split businesses out of this list"
              className="flex-1 resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="self-end rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 rounded-full border border-white/15 bg-[#0b1120] px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition hover:border-amber-400/40"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {open ? "Close" : "Talk to Max"}
        {!open && unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-black">
            {unseen}
          </span>
        )}
      </button>
    </div>
  );
}
