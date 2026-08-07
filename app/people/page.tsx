import Link from "next/link";
import { getStore } from "@/lib/storage";
import { isDemo } from "@/lib/stats";
import { reconcileLedger, splitLedger } from "@/lib/peopleLedger";
import PeopleTable from "@/components/PeopleTable";
import { driftReport } from "@/lib/networkStatus";
import type { StatusDrift } from "@/lib/networkStatus";
import SearchBar from "@/components/SearchBar";
import CsvButtons from "@/components/CsvButtons";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const data = await getStore().getNetwork();
  data.people = data.people.filter((p) => !isDemo(p));

  // Master View 2.0 §8 increment 4b — humans only; companies live on /companies.
  const { humans } = splitLedger(data.people);
  const counts = reconcileLedger(data.people);

  // Q91(a) — drift over the WHOLE book, not just the humans on this page: org members
  // feed the org rung and doors-opened edges are counted across every row, so a
  // filtered list would compute a different answer than /companies for the same record.
  const report = driftReport(data.people);
  const drift: Record<string, StatusDrift> = {};
  for (const i of report.items) drift[i.id] = i.drift;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">People ledger</h1>
          <p className="mt-1 text-sm text-slate-400">
            {counts.humans} people · every line is a node · edits here update every page
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {counts.companies} compan{counts.companies === 1 ? "y" : "ies"} moved to the{" "}
            <Link href="/companies" className="text-sky-400 underline-offset-2 hover:underline">
              company ledger
            </Link>{" "}
            · {counts.total} records total
            {!counts.reconciles && (
              <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-amber-300">
                ⚠ counts do not reconcile — some records are on neither ledger
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar />
          <CsvButtons />
        </div>
      </div>
      <PeopleTable people={humans} verticals={data.verticals} drift={drift} />
    </div>
  );
}
