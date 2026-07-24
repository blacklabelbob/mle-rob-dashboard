import PanelsView from "@/components/ops/PanelsView";
import { loadLivePanels } from "@/lib/readModel/live";

// PRD Task MC.12 — the ops screen. Server-rendered off the same loader the
// /api/panels endpoint uses, so the page and the API can never disagree about
// what the read models say. KPI Summary is derived from the panels below it
// (lib/readModel/kpiSummary.ts) and states, per KPI, whether the number is
// real, genuinely empty, or not computable yet — never a placeholder zero.

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const result = await loadLivePanels();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Ops panels</h1>
        <p className="mt-1 text-xs text-slate-500">
          KPI summary, pipeline, action items and e-sign, read straight from the read-model views —
          never the underlying tables.
        </p>
      </div>
      {result.ok ? (
        <PanelsView payload={result.payload} />
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
          These panels need the Postgres read models: {result.reason}
        </p>
      )}
    </div>
  );
}
