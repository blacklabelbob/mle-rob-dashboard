import EquityCorrect from "@/components/EquityCorrect";
import { EQUITY_STATE_CLASS, EQUITY_STATE_LABEL } from "@/components/equityState";
import { prosePercentConflict, recordEquityView, type EquityCandidate } from "@/lib/equity";

// Q41 increment 5 — the split on the record it belongs to.
//
// Rob's 7/27 correction happened because HomeCloneVault's 40/60 lived in a sentence
// on its own record. inc.1-4 gave that number a home on the master panel; this puts
// it on the page the master panel LINKS TO, so opening the record can no longer show
// only the prose the field was meant to replace.
//
// Every number and every verdict comes from `recordEquityView` — the registry's own
// computation over this one candidate. Nothing here re-reads the prose.

export default function EquityOnRecord({ candidate }: { candidate: EquityCandidate }) {
  const { split, unreadable, lead } = recordEquityView(candidate);

  // Nothing to say. Rendering an empty "Equity" heading on every company would make
  // "no stake" and "stake not recorded yet" look identical on 30-odd records.
  if (!split && !unreadable && !lead) return null;

  const conflict = prosePercentConflict(candidate);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Equity</h2>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">owners only</span>
      </div>

      {split && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-slate-500">their share / ours</span>
            <span className="shrink-0 text-lg font-semibold tabular-nums text-white">
              {split.counterpartyPct === null ? "—" : `${split.counterpartyPct} / ${split.ourPct}`}
            </span>
          </div>
          <div className={`mt-0.5 text-[11px] ${EQUITY_STATE_CLASS[split.state]}`}>
            {EQUITY_STATE_LABEL[split.state]}
          </div>
          {split.provenance === "prose" && (
            <div className="mt-1 text-[11px] text-slate-600">
              read out of the description — correcting it here makes it a field
            </div>
          )}
          {conflict && <div className="mt-1 text-[11px] text-amber-400">⚠ {conflict}</div>}
          <EquityCorrect
            entityId={split.entityId}
            entityName={split.entityName}
            counterpartyPct={split.counterpartyPct}
            state={split.state}
          />
        </div>
      )}

      {unreadable && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="text-[11px] text-slate-400">
            We hold a stake here and no number could be read from the record — {unreadable.reason}.
          </div>
          <EquityCorrect
            entityId={unreadable.entityId}
            entityName={unreadable.entityName}
            counterpartyPct={null}
            state="unknown"
          />
        </div>
      )}

      {lead && (
        // A conversation, not a holding — and it says so in the heading, because on a
        // single record there is no second list to separate it from the real ones.
        <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
            Talked about, not held
          </div>
          <p className="mt-1 text-[11px] italic text-slate-500">&ldquo;{lead.evidence}&rdquo;</p>
        </div>
      )}
    </section>
  );
}
