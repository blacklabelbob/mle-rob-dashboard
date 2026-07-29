import Link from "next/link";
import CallButton from "@/components/CallButton";
import PhaseEightBar from "@/components/PhaseEightBar";
import DemoFooter from "@/components/DemoFooter";
import RepPipelineBoardPanel from "@/components/RepPipelineBoard";
import RepTodayBandPanel from "@/components/RepTodayBand";
import { isCompany } from "@/lib/companies";
import { repPipelineBoard } from "@/lib/deals/repPipelineBoard";
import { todayInET } from "@/lib/integrity/overdue";
import { getStore } from "@/lib/storage";
import { repMoney, sourceContext, stageRank, touchReason } from "@/lib/repSource";
import { normalizeRep, repTodayBand } from "@/lib/tasks/repTodayBand";
import { whoDoITouchToday } from "@/lib/tasks/todayRules";

// Rep Cockpit — the page this CRM exists for (Rob: "the ultimate platform for
// sales reps... the only thing we need this for is to help close more deals").
// v1 runs on Jake Torres (DEMO) and his demo book. Principle 1: ONLY what
// closes deals. Every lead shows the STORY behind the source — the differentiator.
// This is the rep's "Today" home; "My Accounts" (Task 1b.3) is the CRM-feeling
// book view + per-account workspace — see app/rep/accounts.

export const dynamic = "force-dynamic";

const REP = "Jake Torres (DEMO)";

export default async function RepCockpit() {
  const store = getStore();
  const now = new Date();
  const [data, tasks, deals, activities] = await Promise.all([
    store.getNetwork(),
    store.listTasks(),
    store.listDeals(),
    store.listActivities(),
  ]);
  // EXACT, never a prefix: `startsWith("Jake")` handed every account of a
  // future "Jakeline Ruiz" to Jake Torres with nothing on screen saying so.
  const book = data.people.filter((p) => normalizeRep(p.assignedRep) === normalizeRep(REP));

  // Q46 R2: the Task 1.7 rules engine, split to this rep. Orgs live in the same
  // people array as entityKind:"company" rows, so the org fallback has real
  // rows to consult — passing none would report org-anchored work as
  // "assigned to nobody", which is a different claim than "we didn't look".
  const todayItems = whoDoITouchToday({ tasks, deals, activities }, todayInET(now), now);
  const band = repTodayBand(todayItems, REP, {
    people: data.people,
    orgs: data.people.filter(isCompany),
  });

  // Q46 R3: the same deals, the same clock (`stageAgeOf`) and the same
  // ownership rule as the band above — one call, one seam. Passing the same
  // `orgs`/`activities` matters: without activities the meeting-based clock
  // silently falls back to days-in-stage, which would tint a card differently
  // here than the band one row up.
  const pipelineBoard = repPipelineBoard(deals, REP, todayInET(now), {
    people: data.people,
    orgs: data.people.filter(isCompany),
    activities,
  });

  // Work order: money on the table first, then warm, then fresh meat.
  const queue = [...book].sort(
    (a, b) => stageRank(a) - stageRank(b) || (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0)
  );

  const quotedOut = book.filter((p) => p.quotedAmount && !p.signed);
  const pipeline = quotedOut.reduce((s, p) => s + (p.quotedAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Rep Cockpit</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Jake Torres <span className="text-sm font-normal text-slate-500">Inside Sales Rep · DEMO</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {queue.length} to touch today · nothing on this screen that doesn&apos;t close deals
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="tabular text-xl font-semibold text-amber-300">{repMoney(pipeline)}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">quotes out</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold text-sky-300">{book.length}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">my book</div>
          </div>
          <div>
            <div className="tabular text-xl font-semibold text-green-400">
              {book.filter((p) => p.keyDates.paid).length}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">paid clients</div>
          </div>
        </div>
      </div>

      <RepTodayBandPanel band={band} totalItems={todayItems.length} repName={REP} />

      <RepPipelineBoardPanel board={pipelineBoard} repName={REP} />

      <div className="space-y-3">
        {queue.map((p) => {
          const reason = touchReason(p);
          const ctx = sourceContext(p);
          const vertical = data.verticals.find((v) => v.id === p.verticalId);
          return (
            <section
              key={p.id}
              className="relative rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Q42 (Master View §7): the WHOLE card is the click target —
                        this link stretches over the card via the after: overlay;
                        Call/Email float above it (relative z-10). Rob: "you cant
                        even click into them in the pipeline." */}
                    <Link
                      href={`/rep/accounts/${p.id}`}
                      className="text-base font-semibold text-white hover:underline after:absolute after:inset-0 after:content-['']"
                    >
                      {p.name.replace(" (DEMO)", "")}
                    </Link>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${reason.cls}`}>
                      {reason.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: vertical?.color }} />
                      {vertical?.name}
                    </span>
                  </div>
                  {p.role && <div className="mt-0.5 text-xs text-slate-400">{p.role}</div>}
                </div>
                <div className="relative z-10 flex items-center gap-2">
                  {p.quotedAmount ? (
                    <span
                      className={`tabular pointer-events-none rounded-lg px-2.5 py-1 text-sm font-semibold ${
                        p.keyDates.paid ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {repMoney(p.quotedAmount)} {p.keyDates.paid ? "collected" : "quoted"}
                    </span>
                  ) : null}
                  {p.phone && <CallButton phone={p.phone} />}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="rounded-lg bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                    >
                      Email
                    </a>
                  )}
                </div>
              </div>

              {/* The differentiator: how they got here, in detail */}
              <div className="mt-3 rounded-lg border border-sky-400/15 bg-sky-400/5 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-sky-400">
                  How they got here — {ctx.source}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{ctx.detail}</p>
              </div>

              <div className="mt-2.5">
                <PhaseEightBar compact />
              </div>
            </section>
          );
        })}
        {queue.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-500">
            Book is empty — leads route in via the intake API (Phase 5).
          </p>
        )}
      </div>

      <DemoFooter />
    </div>
  );
}
