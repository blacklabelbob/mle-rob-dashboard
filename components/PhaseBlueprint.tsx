import type { Blueprint, PhaseSection, KickoffStep } from "@/lib/phases/blueprint";

// Master View 2.0 §3.1 — the Phase Blueprint tracker, master variant.
//
// This renders `lib/phases/blueprint.ts` output and nothing else: no date maths,
// no money arithmetic, no "if there are two deals then…" logic lives here. If
// the tracker says something wrong, it is wrong in the pure module where a test
// can pin it, not in JSX where it cannot.
//
// The rep variant (PhaseLights) reads the SAME Blueprint object and simply never
// receives the money fields — see app/rep/accounts/[id].

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function day(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
}

function Led({ on, tone = "lit" }: { on: boolean; tone?: "lit" | "done" }) {
  if (!on) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" aria-hidden />;
  }
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        tone === "done"
          ? "bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,.18)]"
          : "bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,.2),0_0_10px_rgba(251,191,36,.5)]"
      }`}
      aria-hidden
    />
  );
}

function Kickoff({ steps }: { steps: KickoffStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-white/10 bg-white/[0.03] px-5 py-3">
      <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        Kickoff
      </span>
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-2 text-xs ${
              s.done ? "text-slate-200" : "text-slate-500"
            }`}
          >
            <Led on={s.done} tone="done" />
            {s.label}
            {s.at && <span className="text-[10px] text-slate-500">{day(s.at)}</span>}
          </span>
          {i < steps.length - 1 && <span className="mx-2 h-px w-4 bg-slate-700" aria-hidden />}
        </span>
      ))}
    </div>
  );
}

function MoneyRow({ section }: { section: PhaseSection }) {
  const m = section.money;
  if (m.attribution === "none") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-white/10 pt-3 text-xs text-slate-500">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Money</span>
        <span>{m.emptyLine}</span>
      </div>
    );
  }
  // An override is only an override when it actually differs — printing
  // "standard $18,000" beside $18,000 trains the eye to skip the line.
  const showsOverride =
    m.standardPrice !== undefined && m.value !== undefined && m.standardPrice !== m.value;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-white/10 pt-3 text-xs text-slate-400">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Money</span>
      {m.agreementRef && <span className="text-slate-300">{m.agreementRef}</span>}
      <span>
        {m.value === undefined ? (
          <span className="text-slate-500">no value recorded</span>
        ) : (
          <span className="font-semibold tabular-nums text-slate-100">{money.format(m.value)}</span>
        )}
        {showsOverride && (
          <span className="ml-2 text-slate-500">standard {money.format(m.standardPrice!)}</span>
        )}
      </span>
      {m.invoicedAt && <span>invoiced {day(m.invoicedAt)}</span>}
      {m.paidAt && (
        <span className="rounded bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
          PAID {day(m.paidAt)}
        </span>
      )}
      {m.attribution === "inferred_sole_deal" && (
        <span className="text-slate-600">
          — read from this company&apos;s only open deal; a stored phase agreement will replace it
        </span>
      )}
    </div>
  );
}

function Refund({ section }: { section: PhaseSection }) {
  const r = section.refund;
  if (!r) return null;
  const pct =
    r.state === "ACTIVE"
      ? Math.min(100, Math.round((r.dayIndex / 30) * 100))
      : r.state === "EXPIRED"
        ? 100
        : 0;
  const tone =
    r.state === "EXPIRED"
      ? "bg-emerald-400"
      : r.state === "VOIDED_BY_ADVANCE"
        ? "bg-slate-500"
        : "bg-amber-400";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-white/10 pt-3 text-xs text-slate-400">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Refund</span>
      <span>{r.line}</span>
      {r.state !== "NOT_STARTED" && (
        <span className="h-1.5 min-w-[90px] flex-1 overflow-hidden rounded-full bg-slate-700">
          <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

function Phase({ section }: { section: PhaseSection }) {
  const badgeTone =
    section.visual === "live"
      ? "bg-amber-400/15 text-amber-300"
      : section.visual === "complete"
        ? "bg-emerald-400/15 text-emerald-300"
        : "bg-slate-700/60 text-slate-400";
  return (
    <div
      className={`border-b border-white/10 px-5 py-4 last:border-b-0 ${
        section.visual === "locked" ? "opacity-60" : ""
      } ${section.visual === "live" ? "bg-gradient-to-r from-amber-400/[0.05] to-transparent" : ""}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
          Phase {section.phase}
        </span>
        <h3 className="text-base font-semibold text-white">{section.title}</h3>
        {section.subtitle && (
          <span className="text-xs italic text-slate-500">{section.subtitle}</span>
        )}
        {section.badge && (
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeTone}`}>
            {section.badge}
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-slate-400">
          {section.phase === 1
            ? `${section.liveCount} of ${section.totalCount} live`
            : `${section.liveCount} of ${section.totalCount} slots`}
        </span>
      </div>

      <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {section.components.map((c) => (
          <div key={c.slug} className="flex min-w-0 items-center gap-2.5 text-[13px]" title={c.meaning}>
            <Led on={c.live} />
            <span
              className={`truncate ${
                c.isEmptySlot ? "italic text-slate-500" : c.live ? "text-slate-200" : "text-slate-500"
              }`}
            >
              {c.label}
            </span>
            {c.liveAt && (
              <span className="ml-auto shrink-0 text-[10px] text-slate-500">{day(c.liveAt)}</span>
            )}
          </div>
        ))}
      </div>

      <MoneyRow section={section} />
      <Refund section={section} />

      {section.roiGuarantee && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 border-t border-dashed border-white/10 pt-3 text-xs text-slate-400">
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Guarantee</span>
          {/*
            The sentence is composed in `phase2Guarantee`, never here. A component
            that assembles its own copy is a second place Rob's money promise can
            be worded — and the wrong wording ("100% behind") on an unmeasured
            customer is the exact defect that module exists to prevent.
          */}
          <span
            className={
              section.roiGuarantee.state === "RUNNING" &&
              section.roiGuarantee.roi?.status === "shortfall"
                ? "text-amber-300"
                : undefined
            }
          >
            {section.roiGuarantee.line}
          </span>
        </div>
      )}
    </div>
  );
}

export default function PhaseBlueprint({ blueprint }: { blueprint: Blueprint }) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-3">
        <h2 className="font-semibold text-white">Phase Blueprint</h2>
        <span className="text-[11px] text-slate-500">
          Every phase shows its full layout, started or not
        </span>
      </div>

      <Kickoff steps={blueprint.kickoff} />

      {blueprint.phases.map((s, i) => (
        <div key={s.phase}>
          <Phase section={s} />
          {i === 0 && (
            <div className="border-b border-white/10 bg-sky-400/[0.04] px-5 py-3 text-xs text-slate-400">
              <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Recommended next
              </span>
              The top automations we&apos;d put in Phase 2 come out of this customer&apos;s AI Growth
              Scan — the slot fills once that component is live.
            </div>
          )}
        </div>
      ))}

      {blueprint.signalNote && (
        <p className="border-t border-white/10 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
          {blueprint.signalNote}
        </p>
      )}
    </section>
  );
}
