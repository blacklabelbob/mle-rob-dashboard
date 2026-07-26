import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/storage";
import ThingsToAddress from "@/components/ThingsToAddress";
import DocumentsSection from "@/components/esign/DocumentsSection";
import { companyRecordFromNetwork } from "@/lib/companyRecord";
import { buildCompanyDeals } from "@/lib/companyDeals";
import { typeLabel, STAGE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Master View 2.0 §8 increments 5a + 5b — the company record: header, Things to
// Address, the People-here rail, and the deals this company actually has. The
// Phase Blueprint tracker (8a) and the notes/enrichment order (5c) land later;
// this page shows what it has and names what is still to come, never stubbed.

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const [data, allDeals] = await Promise.all([store.getNetwork(), store.listDeals()]);
  const record = companyRecordFromNetwork(data, id);
  // A person id must never render the company shell — buildCompanyRecord
  // returns null for one, and that is a 404 here.
  if (!record) notFound();

  const { company, verticalName, verticalColor, rep, peopleHere, ownerIdentified } = record;
  const deals = buildCompanyDeals({
    companyId: company.id,
    deals: allDeals,
    people: data.people,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/companies" className="text-xs text-slate-500 hover:text-slate-300">
          ← companies
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{company.name}</h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              company.status === "lit"
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                : company.status === "warm"
                  ? "border-orange-400/30 bg-orange-900/30 text-orange-300"
                  : "border-slate-600/40 bg-slate-800 text-slate-400"
            }`}
          >
            {company.status}
          </span>
          {verticalName && (
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: verticalColor }} />
              {verticalName}
            </span>
          )}
          {company.nodeType && (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-300">
              {typeLabel(company.nodeType)}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {rep ? `Rep: ${rep}` : "No rep assigned"}
          {company.website && (
            <>
              {" · "}
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                {company.website.replace(/^https?:\/\//, "")}
              </a>
            </>
          )}
          {company.phone && ` · ${company.phone}`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ThingsToAddress mode="entity" person={company.id} />

          {/* Q47 e-sign: the agreements live on the ORG anchor, and a company
              row's id IS that anchor — the same one /people/[id] passes for a
              company row. So this is the same list in both places, never a
              second copy of the paper. */}
          <DocumentsSection orgId={company.id} />

          {/* §8 increment 5b — deals. Values are printed as stored; nothing here
              computes a balance, and a deal with no value says so rather than
              rendering $0. */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">Deals</h2>
              <span className="text-xs text-slate-500">
                {deals.paidTotal > 0 && (
                  <span className="text-emerald-400">{money.format(deals.paidTotal)} paid</span>
                )}
                {deals.paidTotal > 0 && deals.openTotal > 0 && " · "}
                {deals.openTotal > 0 && (
                  <span className="text-amber-300">{money.format(deals.openTotal)} open</span>
                )}
              </span>
            </div>

            {deals.rows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No deals are anchored to this company or to anyone linked to it.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {deals.rows.map((d) => (
                  <li key={d.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Link
                        href={`/deals/${d.id}`}
                        className="text-sm text-sky-400 hover:underline"
                      >
                        {d.name}
                      </Link>
                      <span className="rounded-full border border-slate-600/40 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {STAGE_LABELS[d.stage]}
                      </span>
                      <span className="text-sm text-slate-200">
                        {d.value === undefined ? (
                          <span className="text-slate-500">no value recorded</span>
                        ) : (
                          money.format(d.value)
                        )}
                      </span>
                      {d.referralSourced && (
                        <span className="text-[11px] text-violet-300">referral-sourced</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {d.anchoredVia && <>via {d.anchoredVia} · </>}
                      {(
                        [
                          ["quoted", d.keyDates.quoted],
                          ["signed", d.keyDates.signed],
                          ["invoiced", d.keyDates.invoiced],
                          ["paid", d.keyDates.paid],
                        ] as const
                      )
                        .filter(([, v]) => Boolean(v))
                        .map(([k, v]) => `${k} ${v}`)
                        .join(" · ") || "no key dates on file"}
                    </p>
                    {d.flags.map((f) => (
                      <p key={f.code} className="mt-1 text-xs text-amber-300">
                        ⚠ {f.text}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}

            {deals.valueMissing > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {/* Built as one string, not interpolated fragments: JSX turns a
                    line break mid-word into a space, which shipped "1 deal carr
                    ies no value" to prod. */}
                {deals.valueMissing === 1
                  ? "1 deal carries no value and is excluded from the totals above"
                  : `${deals.valueMissing} deals carry no value and are excluded from the totals above`}
                {" — unknown, not $0."}
              </p>
            )}
            {!deals.phaseStoreAvailable && (
              <p className="mt-2 text-xs text-slate-600">
                Per-deal phase is not shown because no phase store exists yet (§8
                increment 7). Stated once here rather than as a warning on every row.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5">
            <h2 className="font-semibold text-white">Phase Blueprint</h2>
            <p className="mt-1 text-sm text-slate-500">
              Not built yet — the phase tracker and delivery money land in increments
              7/8a. Nothing is being hidden here; there is simply no phase store
              behind it today.
            </p>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">People here</h2>
              <span className="text-xs text-slate-500">{peopleHere.length}</span>
            </div>
            {peopleHere.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nobody is linked to this company yet.
              </p>
            ) : (
              <>
                {!ownerIdentified && (
                  <p className="mt-2 text-xs text-slate-500">
                    No one here has a role recorded that names them as the owner — listed
                    by name.
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {peopleHere.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        href={`/people/${p.id}`}
                        className="text-sm text-sky-400 hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.role && <span className="text-xs text-slate-400">{p.role}</span>}
                      {p.relationship && (
                        <span className="text-xs text-slate-600">{p.relationship}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
