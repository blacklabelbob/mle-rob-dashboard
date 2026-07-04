import Link from "next/link";
import { getStore } from "@/lib/storage";
import { computeStats, contribution, money } from "@/lib/stats";
import type { Person, Project, WillItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

export default async function Overview() {
  const data = await getStore().getNetwork();
  const stats = computeStats(data);

  const willItems: { project: Project; item: WillItem }[] = data.projects.flatMap(
    (project) => (project.willItems ?? []).filter((i) => !i.done).map((item) => ({ project, item }))
  );

  const topNodes = [...data.people]
    .filter((p) => p.id !== "rob-acheson" && p.id !== "will")
    .sort((a, b) => contribution(b) - contribution(a))
    .slice(0, 5);

  const nextToLight = data.people.filter((p) => p.status !== "lit").slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every person is worth two things: money they can pay us and doors they can open.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Network size" value={String(stats.totalPeople)} />
        <Stat
          label="Lit / warm / unlit"
          value={`${stats.litCount} / ${stats.warmCount} / ${stats.unlitCount}`}
          accent="text-amber-300"
        />
        <Stat label="Signed value" value={money(stats.signedValue)} accent="text-emerald-400" />
        <Stat label="Open pipeline" value={money(stats.pipelineQuoted)} />
        <Stat
          label="Est. network value"
          value={money(stats.estNetworkValue)}
          accent="text-sky-300"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-white">Biggest nodes by estimated contribution</h2>
            <Link href="/network" className="text-xs text-sky-400 hover:underline">
              open the graph →
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-white/5">
            {topNodes.map((p: Person) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      p.status === "lit"
                        ? "bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.7)]"
                        : p.status === "warm"
                          ? "bg-amber-700"
                          : "bg-slate-600"
                    }`}
                  />
                  <Link
                    href={`/people/${p.id}`}
                    className="text-sm text-slate-200 hover:text-white hover:underline"
                  >
                    {p.name}
                  </Link>
                </div>
                <span className="text-sm font-medium text-sky-300">{money(contribution(p))}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5">
          <h2 className="font-semibold text-amber-200">Will&apos;s open action items</h2>
          {willItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Nothing outstanding. 🎉</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {willItems.map(({ project, item }) => (
                <li key={`${project.id}-${item.item}`} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 text-amber-400">⚑</span>
                  <div>
                    <div className="text-slate-200">{item.item}</div>
                    <div className="text-xs text-slate-500">
                      {project.name}
                      {item.due ? ` · due ${item.due}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-white">Nodes to light next</h2>
          <Link href="/people" className="text-xs text-sky-400 hover:underline">
            full ledger →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nextToLight.map((p) => {
            const referrer = data.people.find((r) => r.id === p.referredById);
            return (
              <Link
                key={p.id}
                href={`/people/${p.id}`}
                className="rounded-lg border border-white/10 bg-black/20 p-3 transition hover:border-sky-400/40"
              >
                <div className="text-sm font-medium text-slate-200">{p.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {referrer ? `door: ${referrer.name}` : "no referrer yet"}
                  {p.relationship ? ` — ${p.relationship}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
