import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/storage";
import EstimatePanel from "@/components/EstimatePanel";
import PersonEditor from "@/components/PersonEditor";
import { typeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStore().getNetwork();
  const person = data.people.find((p) => p.id === id);
  if (!person) notFound();

  const referrer = data.people.find((p) => p.id === person.referredById);
  const doorsOpened = data.people.filter((p) => p.referredById === person.id);
  const vertical = data.verticals.find((v) => v.id === person.verticalId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/people" className="text-xs text-slate-500 hover:text-slate-300">
          ← ledger
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{person.name}</h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              person.status === "lit"
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                : person.status === "warm"
                  ? "border-orange-400/30 bg-orange-900/30 text-orange-300"
                  : "border-slate-600/40 bg-slate-800 text-slate-400"
            }`}
          >
            {person.status}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: vertical?.color }} />
            {vertical?.name}
          </span>
          {person.nodeType && (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-300">
              {typeLabel(person.nodeType)}
            </span>
          )}
        </div>
        {person.role && <p className="mt-1 text-sm text-slate-400">{person.role}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PersonEditor
            person={person}
            verticals={data.verticals}
            peopleOptions={data.people.map((p) => ({ id: p.id, name: p.name }))}
          />

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-white">Connections</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Came through</div>
                {referrer ? (
                  <Link
                    href={`/people/${referrer.id}`}
                    className="mt-1 block text-sm text-sky-400 hover:underline"
                  >
                    {referrer.name}
                    {person.relationship && (
                      <span className="block text-xs text-slate-500">{person.relationship}</span>
                    )}
                  </Link>
                ) : (
                  <div className="mt-1 text-sm text-slate-600">direct</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Doors opened ({doorsOpened.length})
                </div>
                <ul className="mt-1 space-y-1">
                  {doorsOpened.map((d) => (
                    <li key={d.id}>
                      <Link href={`/people/${d.id}`} className="text-sm text-sky-400 hover:underline">
                        {d.name}
                      </Link>
                      {d.relationship && (
                        <span className="ml-2 text-xs text-slate-500">{d.relationship}</span>
                      )}
                    </li>
                  ))}
                  {doorsOpened.length === 0 && (
                    <li className="text-sm text-slate-600">none yet — that&apos;s the job</li>
                  )}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <EstimatePanel
            personId={person.id}
            description={person.description ?? ""}
            existing={person.estimate ?? null}
          />
        </div>
      </div>
    </div>
  );
}
