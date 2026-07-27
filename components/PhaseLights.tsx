import type { Blueprint } from "@/lib/phases/blueprint";

// Master View 2.0 §3.1 "Rep view of the same tracker" — Rob: "we will want the
// Rep to be able to see the progress update from the Entity Page or Company
// page", lights and phase names only, "no invoice amounts, no refund mechanics".
//
// The money is not hidden with CSS — this component is never handed it. It reads
// `Blueprint` and touches only `phases[].components`, `liveCount`, `title` and
// `badge`; there is no code path here that could print a figure, so a screenshot
// of a rep's screen cannot leak one.
//
// It is the SAME Blueprint object the master tracker renders, so a rep and Rob
// can never be looking at two different versions of how far delivery has got.

function Led({ on }: { on: boolean }) {
  return on ? (
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,.2),0_0_10px_rgba(251,191,36,.5)]"
      aria-hidden
    />
  ) : (
    <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" aria-hidden />
  );
}

export default function PhaseLights({ blueprint }: { blueprint: Blueprint }) {
  // "What's next" is the first dark component of the phase that's currently
  // live — the single thing a rep can chase. Computed from the shared object,
  // never from a second idea of what "current" means.
  const current = blueprint.phases.find((p) => p.visual === "live");
  const nextUp = current?.components.find((c) => !c.live && !c.isEmptySlot);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Delivery progress</h2>
        <span className="text-[11px] text-slate-500">what the build team has actually shipped</span>
      </div>

      <div className="mt-4 space-y-4">
        {blueprint.phases.map((p) => (
          <div key={p.phase} className={p.visual === "locked" ? "opacity-55" : ""}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Phase {p.phase}
              </span>
              <span className="text-sm font-semibold text-white">{p.title}</span>
              {p.badge && (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    p.visual === "live"
                      ? "bg-amber-400/15 text-amber-300"
                      : p.visual === "complete"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-slate-700/60 text-slate-400"
                  }`}
                >
                  {p.badge}
                </span>
              )}
              <span className="ml-auto text-xs tabular-nums text-slate-400">
                {p.liveCount} of {p.totalCount}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {p.components.map((c) => (
                <span key={c.slug} title={`${c.label} — ${c.live ? "live" : "not yet"}`}>
                  <Led on={c.live} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {nextUp && (
        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400">
          <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">Next up</span>
          <strong className="text-slate-200">{nextUp.label}</strong>
          <span className="ml-2 text-slate-500">{nextUp.meaning}</span>
        </p>
      )}

      {blueprint.signalNote && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Nothing has been reported live on this account yet — the build team&apos;s tools light these
          as each piece ships.
        </p>
      )}
    </section>
  );
}
