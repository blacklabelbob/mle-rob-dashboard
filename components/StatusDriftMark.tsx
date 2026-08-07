import { driftMark } from "@/lib/statusBadge";
import type { StatusDrift } from "@/lib/networkStatus";

// Q91(a) — the ledger-table form of the record-page badge.
//
// Same finding, less room. The record page opens to the evidence; a row can only
// point at it, so this renders the verdict and nothing it cannot back up on the spot.
// Silent when the record agrees with itself — 27 of 41 rows do, and a mark on every
// line is furniture.
//
// Not a link and not a button: clicking the company/person name already goes to the
// page that holds the proof, and adding a second target would be two ways to do one
// thing.

export default function StatusDriftMark({ drift }: { drift: StatusDrift | null | undefined }) {
  if (!drift) return null;
  const mark = driftMark(drift);
  const correctable = mark.tone === "correctable";

  return (
    <span
      title={mark.title}
      className={`ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] ${
        correctable
          ? "border-orange-400/30 bg-orange-400/10 text-orange-300"
          : "border-slate-600/50 bg-slate-800/60 text-slate-400"
      }`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full ${correctable ? "bg-orange-400" : "bg-slate-500"}`} />
      {mark.label}
    </span>
  );
}
