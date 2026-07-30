import Link from "next/link";
import PanelsView from "@/components/ops/PanelsView";
import inventory from "@/data/agent-skill-inventory.json";
import researchDigest from "@/data/research-digest.json";
import { loadLivePanels } from "@/lib/readModel/live";
import { askCount, type ResearchDigest } from "@/lib/research/digest";

// PRD Task MC.12 — the ops screen. Server-rendered off the same loader the
// /api/panels endpoint uses, so the page and the API can never disagree about
// what the read models say. KPI Summary is derived from the panels below it
// (lib/readModel/kpiSummary.ts) and states, per KPI, whether the number is
// real, genuinely empty, or not computable yet — never a placeholder zero.

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const result = await loadLivePanels();
  const researchAsks = askCount(
    (researchDigest as unknown as { docs: ResearchDigest[] }).docs,
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Ops panels</h1>
        <p className="mt-1 text-xs text-slate-500">
          KPI summary, pipeline, action items and e-sign, read straight from the read-model views —
          never the underlying tables.
        </p>
      </div>
      {/* Q79 half (c): the audit is worthless if the way in is a URL nobody types.
          The flag count is on the link itself, so a wrong instruction announces
          itself from a page Rob already opens. */}
      <Link
        href="/ops/agents"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/10"
      >
        <span className="text-sm font-semibold text-white">Agents &amp; skills</span>
        <span className="text-xs text-slate-400">
          {inventory.counts.agents} agents · {inventory.counts.skills} skills
        </span>
        {inventory.counts.high > 0 && (
          <span className="rounded-md border border-rose-400/40 bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
            {inventory.counts.high} wrong instruction
          </span>
        )}
        {inventory.counts.medium > 0 && (
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            {inventory.counts.medium} to review
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">Open →</span>
      </Link>
      {/* Q80 half 2: the two research docs, in a form Rob reads. Same lesson as
          above — a surface reachable only by typing a URL is a surface nobody
          opens, which is how these docs went unseen for a week. */}
      <Link
        href="/ops/research"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/10"
      >
        <span className="text-sm font-semibold text-white">Research</span>
        <span className="text-xs text-slate-400">
          master view &amp; rep cockpit — decisions, not markdown
        </span>
        {researchAsks > 0 && (
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            {researchAsks} for you
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">Open →</span>
      </Link>
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
