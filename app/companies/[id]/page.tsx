import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/storage";
import ThingsToAddress from "@/components/ThingsToAddress";
import { companyRecordFromNetwork } from "@/lib/companyRecord";
import { typeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Master View 2.0 §8 increment 5a — the company record SHELL: header, Things to
// Address, and the People-here rail. The Phase Blueprint tracker (5b/8a), deals,
// timeline, notes and enrichment land in later increments; this page shows what
// it actually has and names what is still to come rather than stubbing it.

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStore().getNetwork();
  const record = companyRecordFromNetwork(data, id);
  // A person id must never render the company shell — buildCompanyRecord
  // returns null for one, and that is a 404 here.
  if (!record) notFound();

  const { company, verticalName, verticalColor, rep, peopleHere, ownerIdentified } = record;

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

          <section className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5">
            <h2 className="font-semibold text-white">Phase Blueprint</h2>
            <p className="mt-1 text-sm text-slate-500">
              Not built yet — the phase tracker, deals and delivery money land in the
              next increments. Nothing is being hidden here; there is simply no phase
              store behind it today.
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
