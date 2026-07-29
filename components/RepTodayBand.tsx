import Link from "next/link";
import { repBandState, type RepTodayBand } from "@/lib/tasks/repTodayBand";
import type { TodayItem, TodayTrigger } from "@/lib/tasks/todayRules";

// Q46 R2 inc.2 — the Task 1.7 rules engine finally reaches the rep's screen.
// /rep ranked its book by stage; overdue next steps, unlogged meetings and
// aging deals lived only behind /api/tasks/today, invisible on the one page
// they exist for.
//
// This file renders and nothing else. Whose each item is was decided in
// `repTodayBand` (pure, CR-3) — a component is the wrong place for an
// attribution rule, because a wrong answer there is invisible until a rep
// notices work that was never theirs, or never sees work that was.
//
// The `unattributable` bucket RENDERS AS ITSELF. It is real work anchored to
// rows that record no rep; showing it inside "yours" is a lie about ownership,
// and hiding it is why nobody-owned work never gets done.

// Record<TodayTrigger, …> — a new trigger fails the build here rather than
// rendering as a raw enum string on a rep's screen.
const TRIGGER_LABEL: Record<TodayTrigger, string> = {
  next_step_overdue: "Overdue",
  next_step_due_today: "Due today",
  meeting_unlogged: "Meeting unlogged",
  stage_aging: "Aging in stage",
};

const TRIGGER_CLS: Record<TodayTrigger, string> = {
  next_step_overdue: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  next_step_due_today: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  meeting_unlogged: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  stage_aging: "border-slate-400/30 bg-slate-400/10 text-slate-300",
};

function ItemRow({ item }: { item: TodayItem }) {
  // The row is only a link when we have a record to open. A dead link on a
  // rep's worklist costs more trust than plain text.
  const href = item.personId
    ? `/rep/accounts/${item.personId}`
    : item.orgId
      ? `/people/${item.orgId}`
      : undefined;
  const body = (
    <>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${TRIGGER_CLS[item.trigger]}`}
      >
        {TRIGGER_LABEL[item.trigger]}
      </span>
      <span className="min-w-0 text-sm text-slate-300">{item.reason}</span>
    </>
  );
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-white/5">
      {href ? (
        <Link href={href} className="flex min-w-0 items-start gap-2.5 hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

export default function RepTodayBandPanel({
  band,
  totalItems,
  repName,
}: {
  band: RepTodayBand;
  totalItems: number;
  repName: string;
}) {
  const state = repBandState(band, totalItems);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Who do I touch today
        </h2>
        {band.othersCount > 0 && (
          // A count, never their rows — another rep's book is not this rep's business.
          <span className="text-xs text-slate-500">
            {band.othersCount} more on other reps&apos; books
          </span>
        )}
      </div>

      {state.kind === "items" && (
        <div className="mt-3 space-y-4">
          {band.mine.length > 0 && (
            <ul className="space-y-0.5">
              {band.mine.map((item, i) => (
                <ItemRow key={`mine-${i}`} item={item} />
              ))}
            </ul>
          )}
          {band.unattributable.length > 0 && (
            <div>
              <div className="px-2.5 text-[11px] uppercase tracking-widest text-amber-400/80">
                Assigned to nobody · {band.unattributable.length}
              </div>
              <p className="px-2.5 pt-0.5 text-xs text-slate-500">
                Real work on records that name no rep — it will not appear on anyone
                else&apos;s list either.
              </p>
              <ul className="mt-1 space-y-0.5">
                {band.unattributable.map((item, i) => (
                  <ItemRow key={`unowned-${i}`} item={item} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {state.kind === "all-others" && (
        <p className="mt-3 text-sm text-slate-400">
          Nothing needs {repName.replace(" (DEMO)", "")} today — all {state.othersCount}{" "}
          open touches sit on other reps&apos; books.
        </p>
      )}

      {state.kind === "none-company-wide" && (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-slate-400">
            The rules engine returned nothing company-wide today.
          </p>
          <p className="text-xs text-slate-500">
            Demo records are excluded from these rules by design, and this cockpit runs on
            the demo book — so an empty band here is expected until real tasks, meetings
            and deals are in the system.
          </p>
        </div>
      )}
    </section>
  );
}
