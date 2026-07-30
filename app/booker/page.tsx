import { loadBookerAccountStates } from "@/lib/booker/accountSignalsLoad";
import BookerAccountList from "@/components/BookerAccountList";
import DemoFooter from "@/components/DemoFooter";

// Q82 inc.3 — the booker's screen. Rob, §5: bookers see ALL accounts; what they need is to
// "easily tell" three states apart. The rule (inc.1) and the read (inc.2) are already tested;
// this page is the thin server shell that injects the clock (CR-3 — no `Date.now()` inside the
// rule) and hands the states to the client list.
//
// Deliberately NOT under /rep: a booker is not a rep with fewer columns, and the rep cockpit is
// a work order for one person's book. This is the whole book, unfiltered by owner.

export const dynamic = "force-dynamic";

export default async function BookerPage() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const read = await loadBookerAccountStates(todayISO);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Booker View</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Accounts to work</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every account, needs-action first. Nothing is hidden — Phase 1+ is dimmed because
            it is already a customer, not because you cannot see it.
          </p>
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold text-amber-300">
            {read.states.counts.no_upcoming_appointment + read.states.counts.cold_call}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">signals raised</div>
        </div>
      </div>

      <BookerAccountList read={read} />

      <DemoFooter />
    </div>
  );
}
