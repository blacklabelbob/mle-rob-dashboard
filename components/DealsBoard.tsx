"use client";

import { useState } from "react";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/labels";
import { money } from "@/lib/stats";
import { scoreDeal, STAGE_LADDER, type DealScore } from "@/lib/scoring/deal";
import type { Deal, DealStage } from "@/lib/types";

// Task 2.5 increment 3: drag-to-persist. Cards drag between stage columns;
// the drop optimistically moves the card, then PATCHes /api/admin/deals
// (stage-only route). A failed save snaps the card back and says so — never
// a false "saved". While a drag is live, the empty ladder stages appear as
// slim drop targets so any stage is reachable without 12 permanent columns.

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

const LADDER = (Object.keys(STAGE_LADDER) as DealStage[]).sort(
  (a, b) => STAGE_LADDER[a] - STAGE_LADDER[b],
);

export default function DealsBoard({
  initialDeals,
  nameById,
  asOf,
}: {
  initialDeals: Deal[];
  nameById: Record<string, string>;
  asOf: string;
}) {
  const [deals, setDeals] = useState(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<DealStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scored = deals.map((deal) => ({ deal, score: scoreDeal(deal, asOf) }));
  // Columns in ladder order, non-empty only (Apple bar) — except mid-drag,
  // when every stage renders so a card can land anywhere.
  const stages = draggingId
    ? LADDER
    : LADDER.filter((stage) => scored.some(({ deal }) => deal.stage === stage));

  const open = scored.filter(({ score }) => !score.terminal);
  const openTotal = open.reduce((s, { deal }) => s + (deal.value ?? 0), 0);
  const closedTotal = scored
    .filter(({ deal }) => deal.stage === "paid")
    .reduce((s, { deal }) => s + (deal.value ?? 0), 0);

  async function moveDeal(id: string, stage: DealStage) {
    const prev = deals;
    const current = prev.find((d) => d.id === id);
    if (!current || current.stage === stage) return;
    setError(null);
    setDeals(prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    try {
      const res = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `save failed (${res.status})`);
      }
    } catch (e) {
      setDeals(prev);
      setError(
        `Move not saved — ${current.name} is back in ${STAGE_LABELS[current.stage]}. ${
          e instanceof Error ? e.message : "save failed"
        }`,
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">Deal pipeline</h1>
          <p className="mt-1 text-sm text-slate-400">
            {open.length} open · {money(openTotal)} in play · {money(closedTotal)} paid — every
            card is a live deal row; drag a card to change its stage
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

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
            const isTarget = hoverStage === stage && draggingId;
            const slim = draggingId && column.length === 0;
            return (
              <div
                key={stage}
                className={`${slim ? "w-40" : "w-64"} shrink-0 transition-[width]`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverStage(stage);
                }}
                onDragLeave={() => setHoverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setHoverStage(null);
                  setDraggingId(null);
                  if (id) void moveDeal(id, stage);
                }}
              >
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-300">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {column.length} · {money(columnTotal)}
                  </span>
                </div>
                <div
                  className={`space-y-2 rounded-lg transition-colors ${
                    isTarget
                      ? "bg-sky-500/10 ring-1 ring-sky-400/40"
                      : draggingId
                        ? "ring-1 ring-dashed ring-slate-700"
                        : ""
                  } ${column.length === 0 ? "min-h-24" : "min-h-full"}`}
                >
                  {column.map(({ deal, score }) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      score={score}
                      nameById={nameById}
                      dragging={draggingId === deal.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", deal.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(deal.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverStage(null);
                      }}
                    />
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
  dragging,
  onDragStart,
  onDragEnd,
}: {
  deal: Deal;
  score: DealScore;
  nameById: Record<string, string>;
  dragging: boolean;
  onDragStart: React.DragEventHandler;
  onDragEnd: React.DragEventHandler;
}) {
  const anchorId = deal.personId ?? deal.orgId;
  const anchorName = anchorId ? (nameById[anchorId] ?? anchorId) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border border-slate-800 bg-slate-900/60 p-3 active:cursor-grabbing ${
        score.terminal ? "opacity-60" : ""
      } ${dragging ? "opacity-40" : ""}`}
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
          {deal.value ? (
            money(deal.value)
          ) : (
            <span className="font-normal text-slate-500">no $ recorded</span>
          )}
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
