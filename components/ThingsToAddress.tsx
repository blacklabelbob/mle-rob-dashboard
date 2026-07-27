"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OrgProposalCreate from "./OrgProposalCreate";
import { proposalDomain } from "@/lib/comms/proposalFlag";

// "Things to Address" (Rob 2026-07-22): findings Max surfaces, resolved in-place
// with an optional note. Resolved items are never removed — they archive into an
// expandable section underneath, carrying notified + resolved dates.

type Flag = {
  id: number;
  entity_id: string | null;
  entity_name: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  status: "open" | "resolved";
  notified_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

async function fetchFlags(person?: string): Promise<Flag[] | null> {
  try {
    const r = await fetch(person ? `/api/admin/flags?person=${person}` : "/api/admin/flags");
    if (!r.ok) return null;
    return (await r.json()).flags;
  } catch {
    /* section is non-critical — never break the ledger */
    return null;
  }
}

const sevStyle: Record<Flag["severity"], string> = {
  high: "border-red-400/40 bg-red-500/10 text-red-300",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  low: "border-sky-400/30 bg-sky-400/10 text-sky-300",
};

export default function ThingsToAddress({
  mode = "entity",
  person,
}: {
  mode?: "overview" | "entity";
  person?: string;
}) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchFlags(person);
    if (next) setFlags(next);
  }, [person]);

  useEffect(() => {
    let cancelled = false;
    fetchFlags(person).then((next) => {
      if (next && !cancelled) setFlags(next);
    });
    return () => {
      cancelled = true;
    };
  }, [person]);

  async function markRead(id: number) {
    setBusy(true);
    try {
      await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "read" }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: number, withNote: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "resolve", note: withNote }),
      });
      if (r.ok) {
        setNoteFor(null);
        setNote("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  const open = flags.filter((f) => f.status === "open");
  const resolved = flags.filter((f) => f.status === "resolved");
  if (!flags.length) return null;

  // Overview mode: compact digest — unread open items only, hover for full
  // detail, "Read" clears it from Overview (read ≠ resolved; it stays on the
  // entity's own pages until actually resolved).
  if (mode === "overview") {
    // Q69 inc.6: a company proposal has `entity_id: null` by design — no record
    // exists yet — so the Overview is its ONLY surface. Marking it read must
    // not be able to hide the one place it can be acted on, so proposals stay
    // listed until they are resolved (which creating the company does).
    const unread = open.filter(
      (f) => !(f as Flag & { read_at?: string | null }).read_at || proposalDomain(f.title)
    );
    return (
      <section className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5">
        <h2 className="font-semibold text-amber-200">
          Things to Address{" "}
          {unread.length > 0 && (
            <span className="ml-1 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-bold text-white">
              {unread.length}
            </span>
          )}
        </h2>
        {unread.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Nothing unread. Open items live on each record&apos;s page.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {unread.map((f) => (
              <li key={f.id} className="flex items-start gap-3 text-sm" title={f.detail}>
                <input
                  type="checkbox"
                  title="mark read — clears from Overview, stays on the record until resolved"
                  onChange={() => markRead(f.id)}
                  disabled={busy}
                  className="mt-1 h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                />
                <div className="min-w-0">
                  <span className={`mr-2 rounded px-1.5 py-px text-[10px] uppercase ${sevStyle[f.severity]}`}>{f.severity}</span>
                  {f.entity_id ? (
                    <Link href={`/people/${f.entity_id}`} className="font-medium text-slate-200 hover:underline">
                      {f.entity_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-200">{f.entity_name}</span>
                  )}
                  <span className="text-slate-400"> — {f.title}</span>
                  <span className="ml-2 text-[10px] text-slate-600">{f.notified_at} · hover for detail</span>
                </div>
                {proposalDomain(f.title) && (
                  <div className="ml-auto shrink-0">
                    <OrgProposalCreate
                      domain={proposalDomain(f.title) as string}
                      detail={f.detail}
                      onCreated={load}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-white">
          Things to Address{" "}
          {open.length > 0 && (
            <span className="ml-1 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-bold text-white">
              {open.length}
            </span>
          )}
        </h2>
        <span className="text-[11px] text-slate-600">found by Max · resolve in place</span>
      </div>

      {open.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing open. 🎉</p>}

      <ul className="mt-3 space-y-2.5">
        {open.map((f) => (
          <li key={f.id} className={`rounded-lg border px-3 py-2.5 ${sevStyle[f.severity]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {f.entity_id ? (
                    <Link href={`/people/${f.entity_id}`} className="hover:underline">
                      {f.entity_name}
                    </Link>
                  ) : (
                    f.entity_name
                  )}
                  <span className="opacity-80"> — {f.title}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{f.detail}</p>
                <div className="mt-1 text-[10px] uppercase tracking-wide opacity-60">
                  notified {f.notified_at} · {f.severity}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {noteFor === f.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") resolve(f.id, note);
                        if (e.key === "Escape") setNoteFor(null);
                      }}
                      placeholder="optional note…"
                      className="w-52 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white outline-none"
                    />
                    <button
                      onClick={() => resolve(f.id, note)}
                      disabled={busy}
                      className="rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => resolve(f.id, "")}
                      disabled={busy}
                      className="rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-400"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => {
                        setNoteFor(f.id);
                        setNote("");
                      }}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20"
                    >
                      + note
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <button
            onClick={() => setShowArchive((s) => !s)}
            className="text-xs text-slate-500 transition hover:text-white"
          >
            {showArchive ? "▾" : "▸"} Resolved ({resolved.length})
          </button>
          {showArchive && (
            <ul className="mt-2 space-y-1.5">
              {resolved.map((f) => (
                <li key={f.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">
                    {f.entity_name} — {f.title}
                  </span>
                  <span className="ml-2 opacity-70">
                    notified {f.notified_at} · resolved {f.resolved_at}
                  </span>
                  {f.resolution_note && <div className="mt-0.5 italic text-slate-500">“{f.resolution_note}”</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
