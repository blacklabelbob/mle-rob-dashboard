import Link from "next/link";
import { money } from "@/lib/stats";
import { typeLabel } from "@/lib/labels";
import type { CompanyRow } from "@/lib/companies";

// Company ledger table — Master View 2.0 §8/4a. Read-only for now; the record
// page (5a) and inline editing (14) land in later increments.

const statusBadge: Record<CompanyRow["status"], string> = {
  lit: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  warm: "bg-orange-900/40 text-orange-300 border-orange-400/20",
  unlit: "bg-slate-800 text-slate-400 border-slate-600/40",
};

const PHASE_LABELS: Record<CompanyRow["phaseOne"], string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete",
};

function phaseLabel(p: CompanyRow["phaseOne"]): string {
  return PHASE_LABELS[p] ?? String(p).replace(/[-_]/g, " ");
}

function daysAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
        No companies yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Vertical</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Phase 1</th>
            <th className="px-4 py-3 text-right font-medium">Owed</th>
            <th className="px-4 py-3 text-right font-medium">Paid</th>
            <th className="px-4 py-3 font-medium">Rep</th>
            <th className="px-4 py-3 font-medium">Last touch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.04]"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/people/${r.id}`}
                  className="font-medium text-white hover:text-amber-300"
                >
                  {r.name}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">
                  {typeLabel(r.nodeType)}
                  {r.peopleHere > 0 && ` · ${r.peopleHere} ${r.peopleHere === 1 ? "person" : "people"}`}
                  {r.dealCount > 0 && ` · ${r.dealCount} ${r.dealCount === 1 ? "deal" : "deals"}`}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-slate-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: r.verticalColor }}
                  />
                  {r.verticalName}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusBadge[r.status] ?? statusBadge.unlit}`}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-300">{phaseLabel(r.phaseOne)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                {r.owedTotal > 0 ? money(r.owedTotal) : <span className="text-slate-600">—</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                {r.paidTotal > 0 ? money(r.paidTotal) : <span className="text-slate-600">—</span>}
                {/* Never zero-fill an unreadable amount — say so instead. */}
                {r.valueUnknownCount > 0 && (
                  <div className="text-xs font-normal text-amber-400/80">
                    +{r.valueUnknownCount} no value
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-slate-300">{r.rep ?? "—"}</td>
              <td className="px-4 py-3 text-slate-400">{daysAgo(r.lastTouch)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
