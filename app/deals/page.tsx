import Link from "next/link";
import { getStore } from "@/lib/storage";
import { money } from "@/lib/stats";
import { scoreDeal, STAGE_LADDER, type DealScore } from "@/lib/scoring/deal";
import type { Deal, DealStage, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

// Task 2.5 increment 1: read-only pipeline board off the live deals table —
// first consumer of the Task 2.4 scorer. Drag-to-persist lands next increment.

const STAGE_LABELS: Record<DealStage, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  meeting_booked: "Meeting booked",
  meeting_held: "Meeting held",
  quote_sent: "Quote sent",
  negotiating: "Negotiating",
  signed: "Signed",
  invoiced: "Invoiced",
  paid: "Paid",
  delivering: "Delivering",
  stalled: "Stalled",
  lost: "Lost",
};

const GRADE_STYLES: Record<DealScore["grade"], string> = {
  A: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  B: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  C: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  D: "bg-orange-500/15 text-orange-300 ring-orange-400/30",
  F: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

function breakdownTitle(s: DealScore): string {
  return s.breakdown
    .map((b) => `${b.signal} ${b.raw}×${b.weight} → ${b.weighted.toFixed(1)} — ${b.evidence}`)
    .join("\n");
}

export default async function DealsPage() {
  const store = getStore();
  const [deals, network] = await Promise.all([store.listDeals(), store.getNetwork()]);
  const asOf = new Date().toISOString();

  const nameById = new Map<string, string>(network.people.map((p: Person) => [p.id, p.name]));
  const scored = deals.map((deal) => ({ deal, score: scoreDeal(deal, asOf) }));

  // Columns in ladder order, only stages that actually hold a deal — 6 live
  // deals across 12 mostly-empty columns is MS-DOS, not Apple.
  const stages = (Object.keys(STAGE_LADDER) as DealStage[])
    .sort((a, b) => STAGE_LADDER[a] - STAGE_LADDER[b])
    .filter((stage) => scored.some(({ deal }) => deal.stage === stage));

  const open = scored.filter(({ score }) => !score.terminal);
  const openTotal = open.reduce((s, { deal }) => s + (deal.value ?? 0), 0);
  const closedTotal = scored
    .filter(({ deal }) => deal.stage === "paid")
    .reduce((s, { deal }) => s + (deal.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">Deal pipeline</h1>
          <p className="mt-1 text-sm text-slate-400">
            {open.length} open · {money(openTotal)} in play · {money(closedTotal)} paid — every
            card is a live deal row; score = attention priority, not win odds
          </p>
        </div>
      </div>

      {deals.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          No deals yet — the pipeline fills from the CRM deals table.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const column = scored
              .filter(({ deal }) => deal.stage === stage)
              .sort((a, b) => b.score.score - a.score.score);
            const columnTotal = column.reduce((s, { deal }) => s + (deal.value ?? 0), 0);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-300">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {column.length} · {money(columnTotal)}
                  </span>
                </div>
                <div className="space-y-2">
                  {column.map(({ deal, score }) => (
                    <DealCard key={deal.id} deal={deal} score={score} nameById={nameById} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DealCard({
  deal,
  score,
  nameById,
}: {
  deal: Deal;
  score: DealScore;
  nameById: Map<string, string>;
}) {
  const anchorId = deal.personId ?? deal.orgId;
  const anchorName = anchorId ? (nameById.get(anchorId) ?? anchorId) : null;

  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900/60 p-3 ${
        score.terminal ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-white">{deal.name}</p>
        <span
          title={breakdownTitle(score)}
          className={`shrink-0 cursor-help rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${GRADE_STYLES[score.grade]}`}
        >
          {score.grade} · {score.score}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">
          {deal.value ? money(deal.value) : <span className="font-normal text-slate-500">no $ recorded</span>}
        </span>
        {deal.referralSourced && (
          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">referral</span>
        )}
      </div>
      {anchorName && (
        <Link
          href={`/people/${anchorId}`}
          className="mt-1.5 block truncate text-xs text-slate-400 hover:text-slate-200"
        >
          {anchorName}
        </Link>
      )}
    </div>
  );
}
