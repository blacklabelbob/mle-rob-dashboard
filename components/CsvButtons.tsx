"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Task 4.3 (Q34): CSV export/import on the ledger. Apple-not-MSDOS: two quiet
// buttons; import is the same two-step confirm pattern as the dedup merge —
// pick a file → dry-run plan (nothing written) → review counts → confirm.
// Dupes and error rows are flagged in the plan and NEVER inserted.

type Plan = {
  inserts: { id: string; name: string; kind?: string }[];
  dupes: { line: number; name: string; matchId: string; matchWhere: string; signals: string[] }[];
  errors: { line: number; reason: string }[];
};

export default function CsvButtons() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCsv(null);
    setFileName("");
    setPlan(null);
    setDone(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await file.text();
      setCsv(text);
      const res = await fetch("/api/admin/import", { method: "POST", body: text });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/import?commit=1", { method: "POST", body: csv });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone(data.inserted);
      setPlan(null);
      setCsv(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "import failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white";

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <a href="/api/admin/export" className={btn} download>
          Export CSV
        </a>
        <button className={btn} onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy && !plan ? "Checking…" : "Import CSV"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {(plan || done !== null || error) && (
        <div className="absolute right-0 z-30 mt-1.5 w-80 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-sm shadow-xl backdrop-blur">
          {error && <p className="text-rose-300">{error}</p>}

          {done !== null && (
            <p className="text-emerald-300">
              Imported {done} {done === 1 ? "person" : "people"}.
            </p>
          )}

          {plan && (
            <div className="space-y-2">
              <p className="truncate text-xs text-slate-500">{fileName} — nothing written yet</p>
              <p className="text-slate-200">
                {plan.inserts.length} new · {plan.dupes.length} duplicate
                {plan.dupes.length === 1 ? "" : "s"} flagged · {plan.errors.length} error
                {plan.errors.length === 1 ? "" : "s"}
              </p>
              {plan.dupes.length > 0 && (
                <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-amber-300/90">
                  {plan.dupes.map((d) => (
                    <li key={`d${d.line}`} className="truncate">
                      line {d.line}: {d.name} — matches {d.matchId} ({d.signals.join(", ")})
                    </li>
                  ))}
                </ul>
              )}
              {plan.errors.length > 0 && (
                <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-rose-300/90">
                  {plan.errors.map((e) => (
                    <li key={`e${e.line}`} className="truncate">
                      line {e.line}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded px-2 py-1 text-xs text-slate-400 transition hover:text-white"
              onClick={reset}
            >
              {done !== null ? "Close" : "Cancel"}
            </button>
            {plan && plan.inserts.length > 0 && (
              <button
                className="rounded bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                onClick={onCommit}
                disabled={busy}
              >
                {busy ? "Importing…" : `Import ${plan.inserts.length} new`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
