"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { dismissedNote } from "@/lib/dedup/resolutionNote";
import { partitionDedupQueue, detectorCloseSummary } from "@/lib/dedup/queueView";

// Duplicate review queue (PRD Tasks 3.5 + 4.2). The nightly detector proposes
// pairs; Rob disposes here — dismiss ("not a duplicate") or merge. Merge is
// two-step by design: a dry-run preview first (exact op count + which empty
// fields fold over), then an explicit confirm. Nothing merges automatically.
// Org pairs are dismiss-only for now — the merge planner is person-scoped
// (Task 4.2); an org merge would need its own FK plan.

type Pair = {
  pair_key: string;
  a_id: string;
  b_id: string;
  a_name: string | null;
  b_name: string | null;
  kind: "person" | "org";
  signals: string[];
  confidence: "high" | "review";
  evidence: string[];
  // Q84 inc.49 — the close, read back. `status` is what the DB enforces;
  // the note only splits the two machine closes apart (see resolutionNote.ts).
  status?: string | null;
  resolution_note?: string | null;
};

type Preview = {
  pairKey: string;
  survivorId: string;
  duplicateId: string;
  ops: number;
  folds: Array<{ field: string; value: string }>;
};

// inc.49: `status=all` in ONE request, not two. The reopen list needs the
// detector's closes, and `partitionDedupQueue` drops the rows neither list
// draws — a second round-trip would only move that same filter onto the wire.
async function fetchPairs(): Promise<Pair[] | null> {
  try {
    const r = await fetch("/api/admin/dedup?status=all");
    if (!r.ok) return null;
    return (await r.json()).pairs;
  } catch {
    /* section is non-critical — never break the ledger */
    return null;
  }
}

const confStyle: Record<Pair["confidence"], string> = {
  high: "border-red-400/40 bg-red-500/10 text-red-300",
  review: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};

export default function DedupQueue() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await fetchPairs();
    if (next) setPairs(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPairs().then((next) => {
      if (!cancelled && next) setPairs(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // inc.49: the caller `dedupReopenable()` never had. The server re-reads the
  // row and can still refuse (inc.48) — a queue rendered seconds ago is not
  // proof of what the row says now — so its sentence is shown verbatim rather
  // than replaced with a generic failure line.
  const reopen = async (pairKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/dedup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairKey, action: "reopen" }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? "Reopen failed — try again.");
        await load();
      } else await load();
    } catch {
      setError("Reopen failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (pairKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/dedup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // inc.47: the wording is the dedup module's, not this component's — see
        // lib/dedup/resolutionNote.ts for why one literal in JSX was the whole
        // reason three closers read consistently.
        body: JSON.stringify({ pairKey, action: "dismiss", note: dismissedNote() }),
      });
      if (!r.ok) setError("Dismiss failed — try again.");
      else await load();
    } finally {
      setBusy(false);
    }
  };

  // Step 1: dry-run — show exactly what a merge would do before anything runs.
  const previewMerge = async (pair: Pair, survivorId: string) => {
    const duplicateId = survivorId === pair.a_id ? pair.b_id : pair.a_id;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const r = await fetch("/api/admin/dedup/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId, duplicateId, dryRun: true }),
      });
      const body = await r.json();
      if (r.status === 409) {
        setError(`Merge refused: ${(body.blockers ?? []).join("; ")}`);
      } else if (!r.ok) {
        setError(body.error ?? "Preview failed.");
      } else {
        setPreview({
          pairKey: pair.pair_key,
          survivorId,
          duplicateId,
          ops: body.ops.length,
          folds: body.folds ?? [],
        });
      }
    } catch {
      setError("Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: the explicit confirm — the only place a real merge fires.
  const confirmMerge = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/dedup/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId: preview.survivorId, duplicateId: preview.duplicateId }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body.error ?? "Merge failed — re-running the same merge is safe.");
      } else {
        setMerged(
          body.orphans?.total === 0
            ? "Merged — no orphaned records."
            : `Merged, but orphan check reports ${body.orphans?.total} — flag Max.`
        );
        setPreview(null);
        await load();
      }
    } catch {
      setError("Merge failed — re-running the same merge is safe.");
    } finally {
      setBusy(false);
    }
  };

  const { open, reopenable } = partitionDedupQueue(pairs);

  if (open.length === 0 && reopenable.length === 0 && !merged) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Possible duplicates</h2>
        <span className="text-xs text-slate-500">
          {open.length === 0 ? "all clear" : `${open.length} to review`}
        </span>
      </div>
      {merged && <p className="mt-2 text-xs text-emerald-300">{merged}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <ul className="mt-3 space-y-3">
        {open.map((p) => {
          const aLabel = p.a_name ?? `${p.a_id} (record missing)`;
          const bLabel = p.b_name ?? `${p.b_id} (record missing)`;
          const inPreview = preview?.pairKey === p.pair_key;
          return (
            <li key={p.pair_key} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${confStyle[p.confidence]}`}
                >
                  {p.confidence === "high" ? "likely duplicate" : "needs review"}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{p.kind}</span>
              </div>
              <p className="mt-2 text-sm text-slate-200">
                {p.kind === "person" ? (
                  <>
                    <Link href={`/people/${p.a_id}`} className="hover:underline">
                      {aLabel}
                    </Link>
                    {" ↔ "}
                    <Link href={`/people/${p.b_id}`} className="hover:underline">
                      {bLabel}
                    </Link>
                  </>
                ) : (
                  <>
                    {aLabel} {" ↔ "} {bLabel}
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">{p.evidence.join(" · ")}</p>

              {inPreview && preview ? (
                <div className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/5 p-3">
                  <p className="text-xs text-slate-300">
                    Keeping{" "}
                    <span className="font-medium text-slate-100">
                      {preview.survivorId === p.a_id ? aLabel : bLabel}
                    </span>
                    . {preview.ops} update{preview.ops === 1 ? "" : "s"} will run;{" "}
                    {preview.folds.length === 0
                      ? "no fields copy over."
                      : `fills in: ${preview.folds.map((f) => f.field).join(", ")}.`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={confirmMerge}
                      disabled={busy}
                      className="rounded-md bg-sky-500/20 px-3 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                    >
                      Confirm merge
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      disabled={busy}
                      className="rounded-md px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.kind === "person" && (
                    <>
                      <button
                        onClick={() => previewMerge(p, p.a_id)}
                        disabled={busy}
                        className="rounded-md bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                      >
                        Keep {aLabel.split(" ")[0]}
                      </button>
                      <button
                        onClick={() => previewMerge(p, p.b_id)}
                        disabled={busy}
                        className="rounded-md bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                      >
                        Keep {bLabel.split(" ")[0]}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => dismiss(p.pair_key)}
                    disabled={busy}
                    className="rounded-md px-3 py-1 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  >
                    Not a duplicate
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {reopenable.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="text-xs text-slate-500">
            {detectorCloseSummary()} Reopen one if you still think it is a duplicate.
          </p>
          <ul className="mt-2 space-y-1">
            {reopenable.map((p) => (
              <li key={p.pair_key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">
                  {p.a_name ?? p.a_id} {" ↔ "} {p.b_name ?? p.b_id}
                </span>
                <button
                  onClick={() => reopen(p.pair_key)}
                  disabled={busy}
                  className="rounded-md px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
                >
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
