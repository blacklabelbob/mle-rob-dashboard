import { getStore } from "@/lib/storage";
import { isDemo, money } from "@/lib/stats";
import { buildCompanyRows, companyTotals } from "@/lib/companies";
import CompaniesTable from "@/components/CompaniesTable";

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
      <CompaniesTable rows={rows} />
    </div>
  );
}
