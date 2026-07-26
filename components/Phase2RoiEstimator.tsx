"use client";

// Q63 — the Phase 2 ROI Estimator, mounted on the company record.
// Rob, 2026-07-25: "yes definitely mounted inside the dashboard."
//
// Spec: docs/plans/PHASE2-ROI-ENGINE-SPEC.md §3, §4 (UI contract), §4a (what the
// standalone page shipped). Source dump: docs/plans/sources/ROB-PHASE2-ROI-DUMP-2026-07-25.md
//
// CR-3 IS LITERAL HERE. The standalone artifact could not honour §4 point 5 — being
// self-contained with no build step forced it to carry its own copy of the formula, which
// is why it needs an external parity guard. This component has no such excuse: every
// number below is read straight off `estimatePhase2Roi`. There is no arithmetic in this
// file beyond formatting and the sum of the hours column shown as a total.
//
// Persistence: the whole input object autosaves through /api/admin/people (the same PATCH
// door every inline field uses) into the phase2_estimate jsonb column added by migration
// 0014. No Save button — Rob's standing bar (2026-07-17).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecordSave } from "@/components/inline/fields";
import { estimatePhase2Roi, PHASE_2_GUARANTEE_DAYS, roiTone } from "@/lib/roi/phase2";
import {
  buildAutomations,
  enabledAutomations,
  DEFAULT_PHASE2_ESTIMATE,
  SEED_AUTOMATIONS,
  type AutomationOverride,
  type Phase2Estimate,
} from "@/lib/roi/automations";
import { OEWS_VINTAGE, REGION_LABELS, type RateRegion } from "@/lib/roi/laborRates";

type Region = Exclude<RateRegion, "custom">;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const hrs = (v: number) => `${v.toFixed(1)} h`;

/** Debounce window for the autosave. Long enough to not PATCH on every keystroke. */
const SAVE_DEBOUNCE_MS = 800;

export default function Phase2RoiEstimator({
  recordId,
  companyName,
  initial,
}: {
  recordId: string;
  companyName: string;
  /** Persisted inputs, or undefined when this company has never been estimated. */
  initial?: Phase2Estimate;
}) {
  // refresh:false — this component holds the authoritative estimator state, so a
  // server round-trip would only echo back what is already on screen. Without it,
  // every debounced save (which fires while someone is dragging the day slider)
  // re-runs the whole RSC tree and then resets the inputs from the refreshed prop.
  const { save, state: saveState } = useRecordSave(recordId, { refresh: false });
  const [est, setEst] = useState<Phase2Estimate>(initial ?? DEFAULT_PHASE2_ESTIMATE);

  // Never PATCH on mount — only once the operator has actually changed something.
  // Without this, merely opening a company record would write a default estimate
  // onto every company anyone browses, and "never estimated" would stop meaning it.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // updatedAt is stamped at save time — the engine and catalogue stay clock-free (CR-3).
      void save({ phase2Estimate: { ...est, updatedAt: new Date().toISOString() } });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [est, save]);

  const patch = useCallback((next: Partial<Phase2Estimate>) => {
    dirty.current = true;
    setEst((p) => ({ ...p, ...next }));
  }, []);

  const setOverride = useCallback((id: string, o: AutomationOverride) => {
    dirty.current = true;
    setEst((p) => ({
      ...p,
      overrides: { ...(p.overrides ?? {}), [id]: { ...(p.overrides?.[id] ?? {}), ...o } },
    }));
  }, []);

  const guaranteeDays = est.guaranteeDays ?? PHASE_2_GUARANTEE_DAYS;

  const built = useMemo(
    () => buildAutomations(est.region, est.overrides ?? {}),
    [est.region, est.overrides],
  );

  // THE one call. Everything rendered below is a field of `result`.
  const result = useMemo(
    () =>
      estimatePhase2Roi({
        estInvestment: est.estInvestment,
        daysElapsed: est.daysElapsed,
        automations: enabledAutomations(built),
        guaranteeDays,
      }),
    [est.estInvestment, est.daysElapsed, built, guaranteeDays],
  );

  const { summary, totals } = result;
  const tone = roiTone(summary.status);
  const toneText =
    tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : "text-slate-300";

  const byId = useMemo(
    () => new Map(result.perAutomation.map((a) => [a.id, a])),
    [result.perAutomation],
  );

  const anyRevenueClaimed = built.some((a) => a.enabled && a.revenueLiftPerMonth !== 0);
  const disabledCount = built.filter((a) => !a.enabled).length;

  function loadSuggested() {
    dirty.current = true;
    setEst((p) => {
      const next = { ...(p.overrides ?? {}) };
      for (const a of SEED_AUTOMATIONS) {
        next[a.id] = { ...(next[a.id] ?? {}), revenueLiftPerMonth: a.suggest };
      }
      return { ...p, overrides: next };
    });
  }
  function clearRevenue() {
    dirty.current = true;
    setEst((p) => {
      const next = { ...(p.overrides ?? {}) };
      for (const a of SEED_AUTOMATIONS) {
        next[a.id] = { ...(next[a.id] ?? {}), revenueLiftPerMonth: 0 };
      }
      return { ...p, overrides: next };
    });
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Phase 2 ROI Estimator</h2>
        <span className="text-[11px] text-slate-500">
          {saveState === "saving" && "saving…"}
          {saveState === "saved" && <span className="text-emerald-400">saved</span>}
          {saveState === "error" && <span className="text-rose-400">save failed — retry</span>}
          {saveState === "idle" &&
            (est.updatedAt || initial ? "autosaves" : "not yet estimated · autosaves")}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Pre-sale model for {companyName}. Rob&apos;s rule: <b className="text-slate-400">Phase 2
        investment = the ROI target</b>, pro-rated by how far into the {guaranteeDays}-day
        window you are.
      </p>

      {/* ---------- controls ---------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Est Investment</span>
          <input
            type="number"
            min={0}
            step={500}
            value={est.estInvestment}
            onChange={(e) => patch({ estInvestment: Math.max(0, Number(e.target.value) || 0) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Days into Phase 2
          </span>
          <input
            type="number"
            min={0}
            max={365}
            value={est.daysElapsed}
            onChange={(e) =>
              patch({ daysElapsed: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50"
          />
          <input
            type="range"
            min={0}
            max={guaranteeDays}
            value={Math.min(est.daysElapsed, guaranteeDays)}
            onChange={(e) => patch({ daysElapsed: Number(e.target.value) })}
            className="mt-2 w-full accent-sky-400"
            aria-label="Days into Phase 2"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Wage region</span>
          <select
            value={est.region}
            onChange={(e) => patch({ region: e.target.value as Region })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50"
          >
            {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Guarantee window (days)
          </span>
          <input
            type="number"
            min={1}
            max={365}
            value={guaranteeDays}
            onChange={(e) =>
              patch({ guaranteeDays: Math.min(365, Math.max(1, Number(e.target.value) || 91)) })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50"
          />
        </label>
      </div>

      {/* ---------- KPI tiles ---------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="ROI %">
          <span className={toneText}>
            {summary.roiPct === null ? "—" : pct(summary.roiPct)}
          </span>
          {summary.targetToDateIsZero && (
            <span className="mt-1 block text-[11px] text-slate-500">
              day 0 — nothing owed yet, so the % is undefined
            </span>
          )}
        </Tile>
        <Tile label="ROI $">
          <span className={toneText}>{usdCents.format(summary.roiDollars)}</span>
          <span className="mt-1 block text-[11px] text-slate-500">
            {summary.status === "surplus"
              ? "surplus"
              : summary.status === "shortfall"
                ? "shortfall"
                : "exactly on target"}
          </span>
        </Tile>
        <Tile label={`Target to date · day ${est.daysElapsed} of ${guaranteeDays}`}>
          {usdCents.format(summary.targetToDate)}
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-sky-400"
              style={{ width: `${Math.round(summary.progress * 100)}%` }}
            />
          </span>
          <span className="mt-1 block text-[11px] text-slate-500">
            {usdCents.format(summary.perDayTarget)}/day
            {summary.beyondGuaranteeWindow && " · window closed, target stops growing"}
          </span>
        </Tile>
        <Tile label="Value delivered">
          {usdCents.format(summary.valueDelivered)}
          <span className="mt-1 block text-[11px] text-slate-500">
            {usdCents.format(summary.productivitySavings)} labour ·{" "}
            {usdCents.format(summary.revenue)} revenue
          </span>
        </Tile>
      </div>

      {/* ---------- per-automation rows ---------- */}
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Recommended automations</h3>
        <div className="flex gap-2 text-[11px]">
          <button
            type="button"
            onClick={loadSuggested}
            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-sky-300 hover:bg-sky-400/20"
          >
            Load conservative revenue estimates
          </button>
          <button
            type="button"
            onClick={clearRevenue}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-400 hover:bg-white/10"
          >
            Clear revenue
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        {/* 5 columns, not 6: "% of target" rides under the value it is a share of.
            At six the last column clipped inside the two-thirds record column, and a
            number a client is shown must never be half off the edge. */}
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-3 font-medium">Automation</th>
              <th className="pb-2 pr-3 font-medium">Role it displaces · rate</th>
              <th className="pb-2 pr-3 text-right font-medium">Hrs/wk</th>
              <th className="pb-2 pr-3 text-right font-medium">Rev lift/mo</th>
              <th className="pb-2 text-right font-medium">Value to date</th>
            </tr>
          </thead>
          <tbody>
            {built.map((a) => {
              const r = byId.get(a.id);
              return (
                <tr
                  key={a.id}
                  className={`border-b border-white/5 align-top ${a.enabled ? "" : "opacity-40"}`}
                >
                  <td className="py-3 pr-3">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) => setOverride(a.id, { enabled: e.target.checked })}
                        className="mt-1 accent-sky-400"
                        aria-label={`Include ${a.name}`}
                      />
                      <span>
                        <span className="block text-slate-200">{a.name}</span>
                        <span className="block text-xs text-slate-500">{a.what}</span>
                        {a.basis && (
                          <span className="mt-0.5 block text-[11px] text-slate-600">
                            {a.basis}
                          </span>
                        )}
                      </span>
                    </label>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="block text-xs text-slate-400">{a.role}</span>
                    <a
                      href={a.rateSource}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-400 hover:underline"
                    >
                      ${a.hourlyRate.toFixed(2)}/hr
                    </a>
                    <span className="block text-[11px] text-slate-600">
                      {a.rateRegionLabel}
                      {a.fellBack && " — BLS publishes no figure for the selected area"}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={a.humanHoursPerWeek}
                      onChange={(e) =>
                        setOverride(a.id, {
                          hoursPerWeek: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-20 rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-right text-sm text-white outline-none focus:border-sky-400/50"
                      aria-label={`${a.name} hours per week`}
                    />
                    <span className="mt-1 block text-[11px] text-slate-600">
                      {r ? hrs(r.hoursSavedToDate) : "—"} to date
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={a.revenueLiftPerMonth}
                      onChange={(e) =>
                        setOverride(a.id, {
                          revenueLiftPerMonth: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-24 rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-right text-sm text-white outline-none focus:border-sky-400/50"
                      aria-label={`${a.name} revenue lift per month`}
                    />
                    {a.suggest > 0 && a.revenueLiftPerMonth === 0 && (
                      <span className="mt-1 block text-[11px] text-slate-600">
                        suggest {usd.format(a.suggest)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-slate-200">
                    {a.enabled && r ? usdCents.format(r.valueToDate) : "—"}
                    {a.enabled && r && (
                      <span className="mt-1 block text-[11px] text-slate-600">
                        {usdCents.format(r.laborValueToDate)} labour
                        {r.shareOfTargetToDate !== null &&
                          ` · ${(r.shareOfTargetToDate * 100).toFixed(1)}% of target`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-slate-200">
              <td className="pt-3 pr-3 font-medium">
                Totals
                {disabledCount > 0 && (
                  <span className="ml-2 text-[11px] font-normal text-slate-500">
                    {disabledCount} excluded
                  </span>
                )}
              </td>
              <td className="pt-3 pr-3 text-xs text-slate-500">
                {totals.blendedHourlyRate === null
                  ? "no hours selected"
                  : `blended $${totals.blendedHourlyRate.toFixed(2)}/hr`}
              </td>
              <td className="pt-3 pr-3 text-right">
                {hrs(totals.hoursSavedToDate)}
                <span className="block text-[11px] font-normal text-slate-600">to date</span>
              </td>
              <td className="pt-3 pr-3 text-right">{usdCents.format(totals.revenueToDate)}</td>
              <td className="pt-3 text-right font-medium">
                {usdCents.format(totals.valueToDate)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ---------- summary, printing its own arithmetic ---------- */}
      <div className="mt-5 rounded-lg border border-white/10 bg-slate-900/40 p-4 text-sm">
        <p className="text-slate-300">
          Across <b>{enabledAutomations(built).length} automations</b>, day{" "}
          <b>{est.daysElapsed}</b> of <b>{guaranteeDays}</b>, Phase 2 has returned{" "}
          <b>{usdCents.format(summary.valueDelivered)}</b> against a pro-rated target of{" "}
          <b>{usdCents.format(summary.targetToDate)}</b> —{" "}
          <b className={toneText}>
            {usdCents.format(summary.roiDollars)}
            {summary.roiPct !== null && ` (${pct(summary.roiPct)})`}
          </b>
          .
        </p>
        <div className="mt-3 space-y-1 font-mono text-[11px] leading-relaxed text-slate-500">
          <div>
            productivity savings = {hrs(totals.hoursSavedToDate)} ×{" "}
            {totals.blendedHourlyRate === null
              ? "—"
              : `$${totals.blendedHourlyRate.toFixed(2)}`}{" "}
            = {usdCents.format(summary.productivitySavings)}
          </div>
          <div>
            value delivered = {usdCents.format(summary.productivitySavings)} +{" "}
            {usdCents.format(summary.revenue)} = {usdCents.format(summary.valueDelivered)}
          </div>
          <div>
            per-day target = {usd.format(est.estInvestment)} ÷ {guaranteeDays} ={" "}
            {usdCents.format(summary.perDayTarget)}
          </div>
          <div>
            target to date = {usdCents.format(summary.perDayTarget)} ×{" "}
            {Math.min(est.daysElapsed, guaranteeDays)} = {usdCents.format(summary.targetToDate)}
          </div>
          <div>
            ROI $ = {usdCents.format(summary.valueDelivered)} −{" "}
            {usdCents.format(summary.targetToDate)} = {usdCents.format(summary.roiDollars)}
          </div>
        </div>
      </div>

      {/* ---------- provenance + the open question, flagged not buried ---------- */}
      <p className="mt-3 text-[11px] text-slate-600">
        Wages: BLS Occupational Employment and Wage Statistics, {OEWS_VINTAGE} release, median
        hourly, per-role source linked on each row. Percentages move with hours, lift, or
        investment — not with the day count, because with fixed rates every term scales
        together.
      </p>

      {!anyRevenueClaimed && (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-slate-500">
          Revenue lift is <b className="text-slate-400">$0 on every row by default</b>. The
          labour half is defensible from published BLS wages; the revenue half is judgement,
          so nothing is claimed until someone types it or clicks the opt-in above.
        </p>
      )}

      <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] text-amber-200/80">
        <b>Open — flagged, not silently decided.</b> &ldquo;Total revenue since start of Phase
        2&rdquo; — total top-line, or revenue <i>attributable</i> to Phase 2? Top-line would
        credit Phase 2 with sales it did not cause and makes the guarantee trivially easy to
        clear. This estimator models attributable lift per automation; the live-actuals view
        needs Rob&apos;s ruling (PRD Open Question Q12).
      </p>
    </section>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{children}</div>
    </div>
  );
}
