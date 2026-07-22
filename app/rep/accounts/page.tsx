import { getStore } from "@/lib/storage";
import { money } from "@/lib/stats";
import RepAccountsList from "@/components/RepAccountsList";

// "My Accounts" — the CRM-feeling list Rob asked to see first (Task 1b.3):
// "what's it look like when a rep sees his list of accounts." Same book as
// the /rep cockpit queue, browsable/sortable rather than a fixed work order.
// Rep-facing only: no admin fields, no AI contribution $, no network map.

export const dynamic = "force-dynamic";

export default async function RepAccountsPage() {
  const data = await getStore().getNetwork();
  const book = data.people.filter((p) => (p.assignedRep ?? "").startsWith("Jake"));
  const pipeline = book
    .filter((p) => p.quotedAmount && !p.signed)
    .reduce((s, p) => s + (p.quotedAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Rep View</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">My Accounts</h1>
          <p className="mt-1 text-sm text-slate-400">
            {book.length} account{book.length === 1 ? "" : "s"} · click any row to open the workspace
          </p>
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold text-amber-300">{money(pipeline)}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">quotes out</div>
        </div>
      </div>

      <RepAccountsList people={book} verticals={data.verticals} />
    </div>
  );
}
