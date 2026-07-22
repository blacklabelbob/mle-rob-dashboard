import { getStore } from "@/lib/storage";
import { isDemo } from "@/lib/stats";
import PeopleTable from "@/components/PeopleTable";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const data = await getStore().getNetwork();
  data.people = data.people.filter((p) => !isDemo(p));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">People ledger</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.people.length} people · every line is a node · edits here update every page
          </p>
        </div>
      </div>
      <PeopleTable people={data.people} verticals={data.verticals} />
    </div>
  );
}
