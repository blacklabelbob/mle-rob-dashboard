import { getStore } from "@/lib/storage";
import { isDemo } from "@/lib/stats";
import PeopleTable from "@/components/PeopleTable";
import SearchBar from "@/components/SearchBar";
import CsvButtons from "@/components/CsvButtons";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const data = await getStore().getNetwork();
  data.people = data.people.filter((p) => !isDemo(p));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">People ledger</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.people.length} people · every line is a node · edits here update every page
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar />
          <CsvButtons />
        </div>
      </div>
      <PeopleTable people={data.people} verticals={data.verticals} />
    </div>
  );
}
