"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/search";

// Task 4.1 (Q33): ledger search bar — debounced full-text search against
// /api/admin/search (tsvector + GIN, 0007). Apple-not-MSDOS: one quiet input,
// results drop in under it, arrows + Enter navigate, Esc dismisses. Every hit
// (person or company) routes to its record page — org rows share person ids.

export default function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Empty-query clearing lives in the change handler, not the effect —
  // react-hooks/set-state-in-effect (CI gate): effects must not setState
  // synchronously. Bumping seq here also invalidates any in-flight fetch so
  // stale hits can't reopen the box after the user cleared it.
  function onQueryChange(value: string) {
    setQ(value);
    if (!value.trim()) {
      seq.current++;
      setHits([]);
      setOpen(false);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (seq.current !== mine) return; // a newer keystroke owns the box
        setHits(data.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        if (seq.current === mine) {
          setHits([]);
          setOpen(true); // still open: show the honest "no matches" state
        }
      } finally {
        if (seq.current === mine) setSearching(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  // Click-away closes the dropdown.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    onQueryChange("");
    router.push(`/people/${hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => q.trim() && hits.length > 0 && setOpen(true)}
          placeholder="Search people & companies…"
          aria-label="Search people and companies"
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-amber-400/40 focus:bg-white/[0.07]"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-slate-500 border-t-transparent" />
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900/95 shadow-xl backdrop-blur">
          {hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">No matches</p>
          ) : (
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                      i === active ? "bg-white/10 text-white" : "text-slate-300"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {h.name}
                      {(h.business || h.role) && (
                        <span className="ml-2 truncate text-xs text-slate-500">
                          {h.business ?? h.role}
                        </span>
                      )}
                    </span>
                    {h.kind === "org" && (
                      <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        company
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
