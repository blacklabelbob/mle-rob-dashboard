import type { AimForNext } from "@/lib/phases/aimForNext";

// Q40 leg (6) — the P1→P2 aim-for-next slot, rendered.
//
// Every decision this panel expresses was already made in `lib/phases/aimForNext.ts`:
// whether it shows at all (`visible`), what it says (`line`), which picks survive
// the slot count (`picks` + `overflowNote`), and whether an open refund window has
// to be stated (`refundWarning`). Nothing is re-decided here — a "we recommend"
// panel is pointed at a paying customer, so its rules belong where a test can pin
// them, not in JSX.
//
// The rep variant is handed an object with `refundWarning` already stripped
// (`aimForNextFor(aim, "rep")`), the same way PhaseLights is never handed money.
export default function AimForNextPanel({ aim }: { aim: AimForNext }) {
  if (!aim.visible) return null;

  return (
    <div className="border-b border-white/10 bg-sky-400/[0.04] px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          Recommended next
        </span>
        <span className="text-sm font-semibold text-white">{aim.title}</span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{aim.line}</p>

      {aim.picks.length > 0 && (
        <ol className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {aim.picks.map((p, i) => (
            <li key={p.id} className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <span className="shrink-0 tabular-nums text-[10px] text-slate-500">{i + 1}.</span>
              <span className="min-w-0">
                <span className="text-slate-200">{p.label}</span>
                {p.why && <span className="ml-2 text-slate-500">{p.why}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Named, never silently truncated — a dropped recommendation is a
          decision nobody made. */}
      {aim.overflowNote && <p className="mt-2 text-[11px] text-slate-500">{aim.overflowNote}</p>}

      {aim.refundWarning && (
        <p className="mt-2.5 flex items-baseline gap-2 border-t border-dashed border-white/10 pt-2.5 text-xs text-amber-300">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-amber-500/80">
            Refund
          </span>
          <span>{aim.refundWarning}</span>
        </p>
      )}
    </div>
  );
}
