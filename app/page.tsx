import Link from "next/link";
import { getStore } from "@/lib/storage";
import ThingsToAddress from "@/components/ThingsToAddress";
import GenericDomainBlocklist from "@/components/GenericDomainBlocklist";
import DedupQueue from "@/components/DedupQueue";
import NeedsActionPanel from "@/components/NeedsActionPanel";
import EquitySplits from "@/components/EquitySplits";
import MeetingIntelSection from "@/components/meetings/MeetingIntelSection";
import { networkIntelFromActivities } from "@/lib/meetings/networkIntel";
import { coverageCountLabel } from "@/lib/meetings/coverage";
import { isCompany } from "@/lib/companies";
import { buildMeetingIntel } from "@/lib/meetings/meetingIntel";
import { dealCandidate } from "@/lib/equity";
import { computeStats, contribution, isDemo, money } from "@/lib/stats";
import { isOriginId } from "@/lib/records/origin";
import type { Person, Project, WillItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-amber-400/90">⚠ {sub}</div>}
    </div>
  );
}

export default async function Overview() {
  const store = getStore();
  const [data, deals] = await Promise.all([store.getNetwork(), store.listDeals()]);
  data.people = data.people.filter((p) => !isDemo(p));
  const stats = computeStats(data);

  // Q41 inc.1: a stake is not always an entity. The Gulf Coast 30% lives on a DEAL
  // (`deal-gulf-coast-equity-phase4`) — feeding only people/orgs silently dropped a
  // stake Rob had discussed by name, and a missing row here reads as "we own nothing
  // there", which is the more dangerous lie. Deals carry their own route.
  //
  // Q41 inc.6: the mapping moved into `dealCandidate` because the literal that used
  // to be here dropped `equity` — a split corrected on a deal saved fine and then
  // rendered as the stale prose number.
  const equityCandidates = [...data.people, ...deals.map(dealCandidate)];

  // Q89 inc.4 — the Overview half of "what the meetings taught us". Guarded for the same
  // reason the company record is: an activity-store outage must not 500 the master
  // surface, and it must not degrade into four empty blocks, which would convert OUR
  // failure into a claim that nothing was said on Rob's calls.
  let networkSource = networkIntelFromActivities([], {});
  let meetingIntelUnavailable = false;
  try {
    const orgNameById = Object.fromEntries(data.people.map((p) => [p.id, p.name]));
    networkSource = networkIntelFromActivities(await store.listActivities(), orgNameById);
  } catch {
    meetingIntelUnavailable = true;
  }
  const networkIntel = buildMeetingIntel(networkSource.candidates);

  const willItems: { project: Project; item: WillItem }[] = data.projects.flatMap(
    (project) => (project.willItems ?? []).filter((i) => !i.done).map((item) => ({ project, item }))
  );
  const today = new Date().toISOString().slice(0, 10);
  const daysLate = (due?: string) =>
    due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000) : 0;

  // "Top nodes" ranks the NETWORK, so the house — Rob and Will — is excluded from
  // its own leaderboard.
  //
  // Q70/0031: both were matched by name-slug, and the renumber made every one of
  // those comparisons false — Rob's id is `P-1001` now and Will's is `P-1008`, so
  // the two of them silently reappeared at the top of the list they exist to
  // exclude. Matched on identity instead: the origin via `isOriginId` (which knows
  // both spellings), Will via the `legacy_slug` his row still carries.
  const isHouse = (p: Person) => isOriginId(p.id) || p.id === "will" || p.legacySlug === "will";

  const topNodes = [...data.people]
    .filter((p) => !isHouse(p))
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
        <Stat
          label="Signed value"
          value={money(stats.signedValue)}
          accent="text-emerald-400"
          sub={stats.disputedSignedValue > 0 ? `+ ${money(stats.disputedSignedValue)} disputed` : undefined}
        />
        <Stat label="Open pipeline" value={money(stats.pipelineQuoted)} />
        <Stat
          label="Est. network value"
          value={money(stats.estNetworkValue)}
          accent="text-sky-300"
        />
      </div>
      <p className="-mt-6 text-[11px] text-slate-600">
        Est. network value = signed/quoted dollars + probability-weighted AI estimates. Caveat: a
        referrer&apos;s estimate can overlap with revenue their doors later sign — automatic re-estimation
        on close lands in Phase 2.3. Treat as directional, not bookable.
      </p>

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

        <ThingsToAddress mode="overview" />

        {/* Q89 inc.4 (Rob, 2026-08-05): *"make sure all of this stuff is brought front and
            center when you look at the overview in the CRM"* — the same four blocks that
            sit on a company record, across every company, from the same gate. Sits under
            Things to Address because that panel is where the CRM says what is wrong; this
            is where it says what the calls actually taught us. */}
        {meetingIntelUnavailable ? (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] text-amber-300/90">
            What the meetings taught us could not be read — the activity store did not answer. That is
            our outage, not a statement that nothing was said on your calls.
          </section>
        ) : (
          <MeetingIntelSection
            intel={networkIntel}
            meetingCount={networkSource.meetingCount}
            title="What the meetings taught us — across the network"
            // Q89 inc.21 — punch #6. The denominator is the point: "3 companies" reads
            // like coverage, "3 of 31 companies" reads like the gap it actually is, and
            // that gap is the single most important fact about this feature today.
            countLabel={coverageCountLabel(
              {
                meetings: networkSource.meetingCount,
                companiesWithMeetings: networkSource.companyCount,
                totalCompanies: data.people.filter(isCompany).length,
              },
              networkSource.unattributedMeetings
            )}
          />
        )}

        {/* Q41 inc.1 (Rob dev-chat #53): equity splits sit high on the master
            surface because Rob had to ask whether we had any — and then correct
            one from memory. Fed the whole ledger; the panel decides what is an
            equity record, so a new spinoff appears here without a code change. */}
        <EquitySplits candidates={equityCandidates} />

        {/* Q69 inc.26: collapsed by default — the reason to open it is a domain
            proposal in the list above, so it lives here without competing with
            it. */}
        <GenericDomainBlocklist />

        <DedupQueue />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NeedsActionPanel />
        <section className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Events</h2>
          <p className="mt-1 text-xs text-slate-500">
            Not built yet — lands in Phase 5.4: upcoming events as network opportunities (who&apos;s
            there, which nodes they can light).
          </p>
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
