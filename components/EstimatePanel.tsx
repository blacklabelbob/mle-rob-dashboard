"use client";

import { useState } from "react";
import type { Estimate } from "@/lib/types";

export default function EstimatePanel({
  personId,
  description,
  existing,
}: {
  personId: string;
  description: string;
  existing: Estimate | null;
}) {
  const [text, setText] = useState(description);
  const [estimate, setEstimate] = useState<Estimate | null>(existing);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, description: text }),
      });
      if (!res.ok) throw new Error(`estimate failed (${res.status})`);
      const json = (await res.json()) as Estimate & { persisted?: boolean };
      setEstimate(json);
      setPersisted(json.persisted ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "estimate failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-5">
      <h2 className="font-semibold text-sky-200">AI contribution estimate</h2>
      <p className="mt-1 text-xs text-slate-500">
        Describe this person the way you&apos;d tell it to a friend. The AI estimates what they&apos;re
        really worth — money plus doors.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="e.g. Jonathan Polk — we do his LinkedIn automation free, he can walk us into PropLogic, LandTech, Qualia…"
        className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-400/50 focus:outline-none"
      />
      <button
        onClick={run}
        disabled={loading || text.trim().length < 10}
        className="mt-2 w-full rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-40"
      >
        {loading ? "Estimating…" : "Estimate contribution"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {estimate && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/30 p-2.5">
              <div className="text-lg font-semibold text-sky-300">
                ${Math.round(estimate.estRevenue / 1000)}k
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">est. revenue</div>
            </div>
            <div className="rounded-lg bg-black/30 p-2.5">
              <div className="text-lg font-semibold text-amber-300">+{estimate.estNewNodes}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">new nodes</div>
            </div>
            <div className="rounded-lg bg-black/30 p-2.5">
              <div className="text-lg font-semibold text-emerald-300">
                {Math.round(estimate.probability * 100)}%
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">probability</div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{estimate.reasoning}</p>
          <p className="text-[10px] text-slate-600">
            source: {estimate.source} · {new Date(estimate.estimatedAt).toLocaleString()}
            {persisted === true && <span className="ml-2 text-emerald-500">✓ saved to record</span>}
            {persisted === false && (
              <span className="ml-2 text-amber-500">
                not saved — store is read-only here (docs/plans/sources/STORAGE-DECISION.md)
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
