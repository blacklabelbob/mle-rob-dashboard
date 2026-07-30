"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABELS } from "@/lib/labels";
import type { AccountStageChip } from "@/lib/deals/accountStageChip";
import type { RepPipelineStage } from "@/lib/deals/repPipelineBoard";

// Q46 R5 — the deal stage, on the page a rep actually works from.
//
// This file renders and writes; WHICH deal, whether it may move, and which
// stages are offered were all decided in `accountStageChip` (CR-3). A second
// opinion here would be a second answer to "which deal is this person's" on a
// surface that then PATCHes it.
//
// The write is the same audited path the rep board uses — `PATCH
// /api/admin/deals` with `{id, stage}` — deliberately NOT a new route: two
// endpoints writing the same column is how one of them ends up without the
// audit row.
//
// FOUR THINGS THIS SURFACE REFUSES TO DO:
//  · Show a stage when no deal row exists. `no-deal` says so in words; the
//    blueprint's derived `signed`/`quote_sent` never reaches a chip.
//  · Pick one of two deals. `ambiguous` lists them and offers no control.
//  · Offer a move out of `paid`/`invoiced`/`lost`/… — the module hands back an
//    empty ladder there and this renders the reason instead of a select.
//  · Move the chip itself on save. The label stays where the SERVER put it and
//    announces the destination; the row refreshes when the write lands.

export default function RepAccountStageChip({ chip }: { chip: AccountStageChip }) {
  const router = useRouter();
  const [pendingTo, setPendingTo] = useState<RepPipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgNote =
    chip.orgOnlyCount > 0 ? (
      <span className="text-[11px] text-slate-500">
        · {chip.orgOnlyCount} other deal{chip.orgOnlyCount === 1 ? "" : "s"} on this
        company, not on this person
      </span>
    ) : null;

  if (chip.kind === "no-deal") {
    return (
      <Frame>
        <span className="text-[11px] text-slate-500">
          No deal record on this contact — stage lives on a deal, so there is nothing
          to show or move here yet.
        </span>
        {orgNote}
      </Frame>
    );
  }

  if (chip.kind === "ambiguous") {
    return (
      <Frame>
        <span className="text-[11px] text-slate-400">
          {chip.deals.length} deals on this contact — moving one from here would be a
          guess. Open the one you mean:
        </span>
        <span className="flex flex-wrap gap-1.5">
          {chip.deals.map((d) => (
            <span
              key={d.id}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300"
            >
              {d.name} · {STAGE_LABELS[d.stage]}
            </span>
          ))}
        </span>
        {orgNote}
      </Frame>
    );
  }

  async function move(to: RepPipelineStage) {
    if (chip.kind !== "one" || to === chip.deal.stage || pendingTo) return;
    setError(null);
    setPendingTo(to);
    try {
      const res = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chip.deal.id, stage: to }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `save failed (${res.status})`);
      // The stage can save while the audit row does not — say which happened.
      if (body?.auditError) {
        setError(
          `Moved to ${STAGE_LABELS[to]}, but the timeline entry for the move was not written (${body.auditError}).`,
        );
      }
      router.refresh();
    } catch (e) {
      setPendingTo(null);
      setError(
        `Not saved — still in ${STAGE_LABELS[chip.deal.stage]}. ${
          e instanceof Error ? e.message : "save failed"
        }`,
      );
    }
  }

  return (
    <Frame>
      <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-[11px] text-sky-200">
        {STAGE_LABELS[chip.deal.stage]}
      </span>
      {!chip.movable ? (
        <span className="text-[11px] text-slate-500">{chip.frozenReason}</span>
      ) : pendingTo ? (
        <span className="text-[11px] text-sky-300">
          Moving to {STAGE_LABELS[pendingTo]}…
        </span>
      ) : (
        <label>
          <span className="sr-only">Deal stage for {chip.deal.name}</span>
          <select
            value={chip.deal.stage}
            onChange={(e) => move(e.target.value as RepPipelineStage)}
            className="rounded border border-white/10 bg-slate-900/80 px-1.5 py-1 text-[11px] text-slate-300"
          >
            {chip.ladder.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {orgNote}
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-slate-500">
        Deal stage
      </span>
      {children}
    </div>
  );
}
