import Link from "next/link";
import { notFound } from "next/navigation";
import CallButton from "@/components/CallButton";
import PhaseEightBar from "@/components/PhaseEightBar";
import ActivityTimeline from "@/components/ActivityTimeline";
import Phase2RoiEstimator from "@/components/Phase2RoiEstimator";
import QuotedAmountInline from "@/components/QuotedAmountInline";
import DemoFooter from "@/components/DemoFooter";
import { InlineDateChip, InlineSelect, InlineText } from "@/components/inline/fields";
import { getStore } from "@/lib/storage";
import { isDemo as isDemoPerson } from "@/lib/stats";
import { demoActivity, sourceContext, touchReason } from "@/lib/repSource";

// The account workspace — the money page (Task 1b.3): what opens when a rep
// clicks a row. Rep-facing only: no admin fields, no AI contribution $, no
// network map. Every editable value uses the inline kit — click, edit,
// autosave, no Save button (Rob's law, see docs/agents/CRITIC-ROB-CORPUS.md §B).

export const dynamic = "force-dynamic";

const KEY_DATE_FIELDS: [string, string][] = [
  ["met", "Met"],
  ["quoted", "Quoted"],
  ["signed", "Signed"],
  ["paid", "Paid"],
];

export default async function RepAccountWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStore().getNetwork();
  const person = data.people.find((p) => p.id === id);
  // Rep view is scoped to the rep's own book — not a back door into the full ledger.
  if (!person || !(person.assignedRep ?? "").startsWith("Jake")) notFound();

  const vertical = data.verticals.find((v) => v.id === person.verticalId);
  const reason = touchReason(person);
  const ctx = sourceContext(person);
  const isDemo = isDemoPerson(person);
  const paidDate = person.keyDates?.paid;

  return (
    <div className="space-y-6">
      <Link href="/rep/accounts" className="text-xs text-slate-500 hover:text-slate-300">
        ← my accounts
      </Link>

      {/* Header: who + status + quoted/collected + one-tap contact */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-white">{person.name.replace(" (DEMO)", "")}</h1>
              <InlineSelect
                personId={person.id}
                field="status"
                value={person.status}
                options={[
                  { value: "lit", label: "lit" },
                  { value: "warm", label: "warm" },
                  { value: "unlit", label: "unlit" },
                ]}
                display={
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${reason.cls}`}>
                    {reason.label}
                  </span>
                }
              />
            </div>
            <p className="mt-1 text-sm text-slate-400">{person.role}</p>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: vertical?.color }} />
              {vertical?.name}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              {/* Paid is the apex: collected money is never labeled a quote (Rob's
                  ruling 2026-07-17 — "paid client > signed"). */}
              <div className={`tabular text-xl font-semibold ${paidDate ? "text-emerald-300" : "text-amber-300"}`}>
                <QuotedAmountInline personId={person.id} value={person.quotedAmount} />
              </div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {paidDate ? "collected" : "quoted"}
              </div>
            </div>
            <div className="flex gap-2">
              {person.phone && <CallButton phone={person.phone} />}
              {person.email && (
                <a
                  href={`mailto:${person.email}`}
                  className="rounded-lg bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* The differentiator: how they got here, in full */}
          <section className="rounded-xl border border-sky-400/15 bg-sky-400/5 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-sky-400">
              How they got here — {ctx.source}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{ctx.detail}</p>
          </section>

          <ActivityTimeline personId={person.id} demoEntries={demoActivity(person.id)} isDemo={isDemo} />

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <PhaseEightBar />
          </section>

          {/* Q63 — same estimator, same engine, same stored inputs as the master
              company record. Rob asked for it on both views; mounting the one
              component twice is what keeps a rep's typed investment and Rob's
              from being two different numbers. */}
          <Phase2RoiEstimator
            recordId={person.id}
            companyName={person.business || person.name}
            initial={person.phase2Estimate}
          />
        </div>

        <div className="space-y-6">
          {/* Next step — reuses the `relationship` field (free text, unused on
              these leads) rather than `notes` (already holds the DEMO-record
              disclaimer) or a new column: no schema invented, per Rob's rule. */}
          <section className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-amber-100">Next step</h2>
              <span className="text-[11px] text-amber-200/60">click to edit</span>
            </div>
            <div className="mt-2 text-sm text-white">
              <InlineText
                personId={person.id}
                field="relationship"
                value={person.relationship}
                placeholder="+ what happens next, and when"
                className="block w-full"
              />
            </div>
          </section>

          {/* Contact card — visible, readable, copyable phone/email (not just
              the Call/Email buttons in the header). Critic Rob punch #3. */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-white">Contact</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="mt-0.5 text-slate-200">
                  <InlineText personId={person.id} field="phone" value={person.phone} placeholder="+ add phone" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="mt-0.5 text-slate-200">
                  <InlineText personId={person.id} field="email" value={person.email} placeholder="+ add email" />
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Key dates</h2>
              <span className="text-[11px] text-slate-600">click a chip to set</span>
            </div>
            <ol className="mt-3 flex flex-wrap gap-2">
              {KEY_DATE_FIELDS.map(([key, label]) => (
                <li key={key}>
                  <InlineDateChip
                    personId={person.id}
                    label={label}
                    dateKey={key}
                    keyDates={person.keyDates as Record<string, string | undefined>}
                  />
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <DemoFooter />
    </div>
  );
}
