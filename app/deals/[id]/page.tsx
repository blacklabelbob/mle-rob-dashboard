import Link from "next/link";
import { notFound } from "next/navigation";
import DocumentsSection from "@/components/esign/DocumentsSection";
import EquityOnRecord from "@/components/EquityOnRecord";
import { dealCandidate } from "@/lib/equity";
import { STAGE_LABELS } from "@/lib/labels";
import { money } from "@/lib/stats";
import { scoreDeal } from "@/lib/scoring/deal";
import { getStore } from "@/lib/storage";
import type { Deal, KeyDates, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

// Q47 (last ungated leg): agreements live on the DEAL record too, not just the
// person/org record. 0008 anchors a document to person OR org OR deal; the
// person page covered the first two, so a deal-anchored agreement had no home
// in the UI until this page existed. Read-only by design — money and signed
// dates are shown, never edited here (stage moves stay on the board, where the
// PATCH + snap-back error path already lives).

const DATE_LABELS: { key: keyof KeyDates; label: string }[] = [
  { key: "met", label: "Met" },
  { key: "quoted", label: "Quoted" },
  { key: "signed", label: "Signed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
  { key: "phaseOneComplete", label: "Phase 1 complete" },
];

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const [deals, network] = await Promise.all([store.listDeals(), store.getNetwork()]);
  const deal: Deal | undefined = deals.find((d) => d.id === id);
  if (!deal) notFound();

  const anchorId = deal.personId ?? deal.orgId;
  const anchor: Person | undefined = anchorId
    ? network.people.find((p: Person) => p.id === anchorId)
    : undefined;
  const vertical = deal.verticalId
    ? network.verticals.find((v) => v.id === deal.verticalId)
    : undefined;
  const score = scoreDeal(deal, new Date().toISOString());
  const dates = DATE_LABELS.filter(({ key }) => deal.keyDates?.[key]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/deals" className="text-sm text-slate-400 hover:text-slate-200">
        ← Pipeline
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">{deal.name}</h1>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-200">
          {STAGE_LABELS[deal.stage]}
        </span>
        {deal.referralSourced && (
          <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs text-violet-300">
            referral
          </span>
        )}
      </div>

      <div className="mt-1 text-sm text-slate-400">
        {anchor ? (
          <Link href={`/people/${anchor.id}`} className="text-sky-400 hover:underline">
            {anchor.name}
          </Link>
        ) : (
          <span className="text-slate-600">no linked record</span>
        )}
        {vertical && <span> · {vertical.name}</span>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DocumentsSection dealId={deal.id} />
        </div>

        <aside className="space-y-6">
          {/* Q41 inc.6: inc.5 mounted this on people and companies, but the Gulf
              Coast 30% — the stake Rob named — is a DEAL, so the one record the
              registry links to for it had no equity on it at all. Same
              `recordEquityView` as the master panel, off the same `dealCandidate`,
              so the two surfaces cannot state different numbers. */}
          <EquityOnRecord candidate={dealCandidate(deal)} />

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-white">Deal</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Value</dt>
                <dd className="font-semibold text-slate-200">
                  {deal.value ? money(deal.value) : <span className="font-normal text-slate-600">no $ recorded</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Score</dt>
                <dd className="text-slate-200">
                  {score.grade} · {score.score}
                </dd>
              </div>
              {deal.ownerId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="text-slate-200">{deal.ownerId}</dd>
                </div>
              )}
              {deal.routingLane && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Lane</dt>
                  <dd className="text-slate-200">{deal.routingLane.replace(/_/g, " ")}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-white">Key dates</h2>
            {dates.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">none recorded</p>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                {dates.map(({ key, label }) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-slate-200">{deal.keyDates[key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {deal.notes && (
            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="font-semibold text-white">Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{deal.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
