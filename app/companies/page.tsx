import { getStore } from "@/lib/storage";
import { isDemo, money } from "@/lib/stats";
import { buildCompanyRows, companyTotals } from "@/lib/companies";
import CompaniesTable from "@/components/CompaniesTable";
import { driftReport } from "@/lib/networkStatus";
import type { StatusDrift } from "@/lib/networkStatus";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const store = getStore();
  const [data, deals, activities] = await Promise.all([
    store.getNetwork(),
    store.listDeals(),
    store.listActivities(),
  ]);

  const rows = buildCompanyRows({
    people: data.people.filter((p) => !isDemo(p)),
    verticals: data.verticals,
    deals,
    activities,
  });
  const totals = companyTotals(rows);

  // Q91(a) — the ledger says what each row's own facts justify, computed once over the
  // whole book. `driftReport` (never `statusDrift` per row) because the Q91(c)
  // membership guard lives inside it: a withheld row is simply absent here, so the
  // table prints nothing rather than an accusation this book cannot support.
  const report = driftReport(data.people.filter((p) => !isDemo(p)));
  const drift: Record<string, StatusDrift> = {};
  for (const i of report.items) drift[i.id] = i.drift;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Companies</h1>
          <p className="mt-1 text-sm text-slate-400">
            {totals.companies} companies · {money(totals.owedTotal)} owed ·{" "}
            {money(totals.paidTotal)} paid
            {totals.valueUnknownCount > 0 &&
              ` · ${totals.valueUnknownCount} deal${totals.valueUnknownCount === 1 ? "" : "s"} with no value recorded`}
          </p>
        </div>
      </div>
      <CompaniesTable rows={rows} drift={drift} />
    </div>
  );
}
