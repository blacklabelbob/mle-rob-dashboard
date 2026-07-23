"use client";

import { useState } from "react";

// Q43 / Master View §3.5: machine-derived provenance lives HERE — quarantined
// at the very bottom of the record, styled as data, never mixed into Notes.
// Collapsed by default: most recent block visible, the rest behind an
// explicit "show all (N)" expander (Attio's marked-as-machine precedent).

export default function EnrichmentSection({ blocks }: { blocks: string[] }) {
  const [open, setOpen] = useState(false);
  if (blocks.length === 0) return null;

  // Enrichment sessions append chronologically — last block = most recent.
  const latest = blocks[blocks.length - 1];
  const older = blocks.slice(0, -1);
  const shown = open ? [...older].reverse() : [];

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-slate-400">
          <span aria-hidden className="text-slate-600">✦</span>
          Enrichment &amp; provenance
        </h2>
        <span className="text-[11px] uppercase tracking-wide text-slate-600">
          machine-gathered
        </span>
      </div>
      <div className="mt-3 space-y-3">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{latest}</p>
        {shown.map((b, i) => (
          <p
            key={i}
            className="whitespace-pre-wrap border-t border-white/5 pt-3 text-xs leading-relaxed text-slate-500"
          >
            {b}
          </p>
        ))}
      </div>
      {older.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        >
          {open ? "collapse" : `show all (${blocks.length})`}
        </button>
      )}
    </section>
  );
}
