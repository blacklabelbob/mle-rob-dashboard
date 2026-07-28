"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dealPhaseSaveOutcome, type DealPhaseSaveOutcome } from "@/lib/crm";

// Q40 inc.12 — the control that lets a human state which phase an agreement is
// for. Until it existed, `deals.phase` (0026) and its write door were reachable
// only by someone holding the service key and a curl command, which means the
// Phase 2 ROI target stayed inference for every real customer.
//
// It DECIDES NOTHING. Every refusal comes from the route (which re-checks the
// pure `parseDealPhasePatch`) and every sentence comes from `dealPhaseSaveOutcome`,
// so what is printed after a save is what the DATABASE reported, never what was
// picked. That distinction is the whole point on this field: the phase decides
// which money Rob's ROI guarantee is measured against.
//
// "Not stated" is a real option, not an empty state — a rep who tagged the wrong
// phase must be able to take it back, and the resulting blank means *nobody has
// said*, which is not Phase 1.

const OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "phase not stated" },
  { value: "1", label: "Phase 1" },
  { value: "2", label: "Phase 2" },
  { value: "3", label: "Phase 3" },
];

export default function DealPhaseControl({
  dealId,
  phase,
}: {
  dealId: string;
  phase?: 1 | 2 | 3;
}) {
  const router = useRouter();
  // Seeded from the server row; afterwards only ever from what the route echoed.
  const [current, setCurrent] = useState<string>(phase === undefined ? "" : String(phase));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DealPhaseSaveOutcome | null>(null);

  async function save(next: string) {
    const previous = current;
    setBusy(true);
    setOutcome(null);
    try {
      const r = await fetch("/api/admin/deals/phase", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        // Number(), never the raw string — the door refuses "2" on purpose so a
        // control that forgot this fails loudly instead of inventing a phase.
        body: JSON.stringify({ id: dealId, phase: next === "" ? null : Number(next) }),
      });
      const o = dealPhaseSaveOutcome(r.status, await r.json().catch(() => null));
      setOutcome(o);
      if (o.tone === "ok") {
        setCurrent(o.saved === null || o.saved === undefined ? "" : String(o.saved));
        router.refresh();
      } else {
        // Nothing was stored, so the box must not keep showing the new value —
        // a select that silently disagrees with the database is the failure this
        // component exists to prevent.
        setCurrent(previous);
      }
    } catch (e) {
      setCurrent(previous);
      setOutcome({ tone: "error", message: `Not saved — ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <label className="sr-only" htmlFor={`phase-${dealId}`}>
        Which phase this agreement is for
      </label>
      <select
        id={`phase-${dealId}`}
        value={current}
        disabled={busy}
        onChange={(e) => void save(e.target.value)}
        className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[11px] text-slate-300 disabled:opacity-50"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {outcome && (
        <span className={`text-[11px] ${outcome.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {outcome.message}
        </span>
      )}
    </span>
  );
}
