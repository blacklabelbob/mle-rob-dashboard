import { driftBadge } from "@/lib/statusBadge";
import type { StatusDrift } from "@/lib/networkStatus";

// Q91(a) — "why is this record unlit?", answered on the record.
//
// Rob asked that question three times in dev_chat (#58/#60/#62) about three different
// companies, and each time the answer took a human reading the row. The arithmetic to
// answer it has existed since Q89 inc.28 and had no caller; this is the caller.
//
// It renders NOTHING when the record agrees with itself — the common case must stay
// silent, or the badge becomes furniture and stops being read.
//
// No write, no click target that changes data: the one-click accept is deliberately a
// later increment. Rob's judgement outranks the ladder, so the first thing this ships
// is the disagreement, not a button that resolves it.

export default function StatusJustification({ drift }: { drift: StatusDrift | null }) {
  if (!drift) return null;
  const badge = driftBadge(drift);
  const correctable = badge.tone === "correctable";

  return (
    <details
      className={`group rounded-lg border px-3 py-2 text-xs ${
        correctable
          ? "border-orange-400/30 bg-orange-400/[0.07]"
          : "border-slate-700/70 bg-slate-800/40"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            correctable ? "bg-orange-400" : "bg-slate-500"
          }`}
        />
        <span className={correctable ? "font-medium text-orange-200" : "font-medium text-slate-300"}>
          {badge.headline}
        </span>
        <span className="text-slate-400">{badge.detail}</span>
        <span className="ml-auto shrink-0 text-slate-500 group-open:hidden">{badge.evidenceLabel} ›</span>
      </summary>
      <ul className="mt-2 space-y-1 border-t border-slate-700/60 pt-2 font-mono text-[11px] text-slate-400">
        {drift.evidence.length === 0 ? (
          <li className="font-sans text-slate-500">No facts on this record — that is the finding.</li>
        ) : (
          drift.evidence.map((e) => <li key={e}>{e}</li>)
        )}
      </ul>
    </details>
  );
}
