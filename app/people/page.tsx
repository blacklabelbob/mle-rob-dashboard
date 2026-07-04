import Link from "next/link";
import { getStore } from "@/lib/storage";
import { contribution, money } from "@/lib/stats";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

// Rob's field set, optimized order:
// status → name → vertical → door (referred by + relationship) → quoted → signed
// → est. contribution → time-to-payment → phase one → key dates → contact → links
type SortKey = "contribution" | "quoted" | "name" | "signed" | "met";

function sortPeople(people: Person[], key: SortKey): Person[] {
  const arr = [...people];
  switch (key) {
    case "quoted":
      return arr.sort((a, b) => (b.quotedAmount ?? 0) - (a.quotedAmount ?? 0));
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "signed":
      return arr.sort((a, b) => Number(b.signed) - Number(a.signed));
    case "met":
      return arr.sort((a, b) => (b.keyDates.met ?? "").localeCompare(a.keyDates.met ?? ""));
    default:
      return arr.sort((a, b) => contribution(b) - contribution(a));
  }
}

const statusBadge: Record<Person["status"], string> = {
  lit: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  warm: "bg-orange-900/40 text-orange-300 border-orange-400/20",
  unlit: "bg-slate-800 text-slate-400 border-slate-600/40",
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortKey = (["contribution", "quoted", "name", "signed", "met"].includes(sort ?? "")
    ? sort
    : "contribution") as SortKey;

  const data = await getStore().getNetwork();
  const people = sortPeople(data.people, sortKey);
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const verticalById = new Map(data.verticals.map((v) => [v.id, v]));

  const sortLink = (key: SortKey, label: string) => (
    <Link
      href={`/people?sort=${key}`}
      className={`hover:text-white ${sortKey === key ? "text-sky-300" : ""}`}
    >
      {label}
      {sortKey === key ? " ↓" : ""}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">People ledger</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.people.length} people · every line is a node · click through for the full record
          </p>
        </div>
        <div className="text-xs text-slate-500">add-person form lands in Phase 1.4</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">{sortLink("name", "Name")}</th>
              <th className="px-3 py-2.5">Vertical</th>
              <th className="px-3 py-2.5">Door (referred by)</th>
              <th className="px-3 py-2.5 text-right">{sortLink("quoted", "Quoted")}</th>
              <th className="px-3 py-2.5">{sortLink("signed", "Signed")}</th>
              <th className="px-3 py-2.5 text-right">{sortLink("contribution", "Est. contribution")}</th>
              <th className="px-3 py-2.5 text-right">Est. days→$</th>
              <th className="px-3 py-2.5">Phase One</th>
              <th className="px-3 py-2.5">{sortLink("met", "Met")}</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {people.map((p) => {
              const referrer = p.referredById ? byId.get(p.referredById) : undefined;
              const vertical = verticalById.get(p.verticalId);
              return (
                <tr key={p.id} className="transition hover:bg-white/5">
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/people/${p.id}`} className="font-medium text-slate-100 hover:underline">
                      {p.name}
                    </Link>
                    {p.business && p.business !== p.name && (
                      <div className="text-xs text-slate-500">{p.business}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: vertical?.color ?? "#64748b" }}
                      />
                      {vertical?.name ?? p.verticalId}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {referrer ? (
                      <>
                        {referrer.name}
                        {p.relationship && (
                          <div className="text-xs text-slate-500">{p.relationship}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-200">
                    {p.quotedAmount != null && p.quotedAmount > 0 ? money(p.quotedAmount) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.signed ? (
                      <span className="text-emerald-400">✓ {p.keyDates.signed ?? ""}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-sky-300">
                    {contribution(p) > 0 ? money(contribution(p)) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300">
                    {p.estTimeToPaymentDays ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {p.phaseOne === "complete" ? (
                      <span className="text-emerald-400">complete</span>
                    ) : p.phaseOne === "in-progress" ? (
                      <span className="text-amber-300">in progress</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{p.keyDates.met ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {p.phone && <div>{p.phone}</div>}
                    {p.email && <div>{p.email}</div>}
                    {p.website && (
                      <a
                        href={p.website}
                        className="text-sky-400 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        site
                      </a>
                    )}
                    {!p.phone && !p.email && !p.website && <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {p.meetingVideoUrl && (
                      <a href={p.meetingVideoUrl} className="mr-2 text-sky-400 hover:underline">
                        video
                      </a>
                    )}
                    {p.transcriptUrl && (
                      <a href={p.transcriptUrl} className="text-sky-400 hover:underline">
                        transcript
                      </a>
                    )}
                    {!p.meetingVideoUrl && !p.transcriptUrl && (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
