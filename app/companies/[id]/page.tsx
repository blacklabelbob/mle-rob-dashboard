import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canonicalRedirectId } from "@/lib/records/resolveRecord";
import { getStore } from "@/lib/storage";
import ThingsToAddress from "@/components/ThingsToAddress";
import EquityOnRecord from "@/components/EquityOnRecord";
import DocumentsSection from "@/components/esign/DocumentsSection";
import ActivityTimeline from "@/components/ActivityTimeline";
import EnrichmentSection from "@/components/EnrichmentSection";
import Phase2RoiEstimator from "@/components/Phase2RoiEstimator";
import { InlineText, InlineTextarea } from "@/components/inline/fields";
import PhaseBlueprint from "@/components/PhaseBlueprint";
import { companyRecordFromNetwork } from "@/lib/companyRecord";
import { buildCompanyDeals } from "@/lib/companyDeals";
import DealPhaseControl from "@/components/DealPhaseControl";
import { buildBlueprint } from "@/lib/phases/blueprint";
import { loadComponentLive, mergeComponentLive } from "@/lib/phases/componentLiveLoad";
import { loadScanPicks } from "@/lib/phases/scanPicksLoad";
import { loadPhase2Returns } from "@/lib/phases/phase2ReturnsLoad";
import { provenanceOf } from "@/lib/phases/phase2ReturnsSelect";
import { splitNotes } from "@/lib/notes";
import { typeLabel, STAGE_LABELS } from "@/lib/labels";
import MeetingIntelSection from "@/components/meetings/MeetingIntelSection";
import { intelSourceFromActivities } from "@/lib/meetings/intelSource";
import { meetingCoverage, noMeetingNote } from "@/lib/meetings/coverage";
import { isCompany } from "@/lib/companies";
import { buildMeetingIntel, type IntelCandidate } from "@/lib/meetings/meetingIntel";

export const dynamic = "force-dynamic";

// Master View 2.0 §8 increments 5a + 5b + 5c — the company record: header,
// Things to Address, the People-here rail, the deals this company actually has,
// and (5c) the §3.4–§3.6 spine: timeline → Notes (human words only) → details
// grid (demoted) → enrichment collapsed at the very bottom. The Phase Blueprint
// tracker (8a) lands later; this page shows what it has and names what is still
// to come, never stubbed.
//
// §3.5's inherited punch #7 is fixed here rather than inherited: the enrichment
// block sits OUTSIDE the two-column grid, so "at the very bottom" is true at
// every breakpoint — on a phone the grid collapses and anything left inside the
// left column would render above the People rail.

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
  // Q70/0031: an old company slug (/companies/the-title-base) settles on the
  // record number before the shell is built — resolved BEFORE the person-id
  // check below, so a legacy slug that resolves to a person still 404s here
  // rather than rendering a person inside the company shell.
  const canonical = canonicalRedirectId(data.people, id);
  if (canonical) redirect(`/companies/${canonical}`);
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
  // Q43 discipline (§3.5): human words and machine provenance are split by the
  // same pure function the person record uses — never re-implemented here.
  const { human: humanNotes, enrichment } = splitNotes(company.notes);

  // §8 increment 8a. `asOf` is passed in rather than read inside the FSM so the
  // refund countdown is a pure function of stored dates (CR-3) — two renders of
  // the same record on the same day always agree.
  //
  // Q40 inc.6: the lights now come from what the partner's tools have actually
  // signalled (`phase_component_state`), overlaid on whatever the record itself
  // carries. `loadComponentLive` never throws — a signal-seam outage must not
  // 500 the page that also carries this company's deal, money and timeline — and
  // reports itself through `unavailable` so a degraded board says so.
  //
  // Q40 leg (6) inc.17: the recommended-automations panel stops being fed by a
  // parameter nothing supplies — `loadScanPicks` reads this customer's recorded
  // shortlist out of 0027. It never throws either, and a read that failed is
  // passed through as such rather than rendering as "nothing has been picked".
  //
  // Q63 leg (5) inc.7: the ROI guarantee stops being fed by a parameter nothing
  // supplies — `loadPhase2Returns` reads THIS customer's measured returns out of
  // 0028. Same contract as the two loaders above: it never throws (a returns-store
  // outage must not 500 the record carrying this company's money), and a read that
  // FAILED is carried through as `unavailable` rather than rendering as "not
  // measured yet" — that wording is a claim about the customer, and our outage does
  // not entitle us to make it under a money guarantee.
  const signals = await loadComponentLive(company.id);
  // Q89 — what the meetings taught us. The read is guarded because an activity-store
  // outage must not 500 the whole record; `meetingsUnavailable` is carried so the
  // section can say "we could not read your calls" instead of the far worse
  // "nothing was said on them", which is a claim we would have no basis for.
  //
  // Q89 inc.21 (punch #6): the network-wide read is taken in the SAME guarded block, so
  // a record with no captured call can say how many the CRM has at all. It is a second
  // read rather than a filter of the first because the filtered read is this company's
  // and must stay that way — the coverage line is about the whole ledger. Same outage
  // rule: if either read throws, we say we could not read, never "nothing was said".
  let meetingIntelSource = { candidates: [] as IntelCandidate[], meetingCount: 0, unusable: [] as { activityId: string; reason: string }[] };
  let coverage = { meetings: 0, companiesWithMeetings: 0, totalCompanies: 0 };
  let meetingsUnavailable = false;
  try {
    const [mine, all] = await Promise.all([
      store.listActivities({ orgId: company.id }),
      store.listActivities(),
    ]);
    meetingIntelSource = intelSourceFromActivities(mine);
    coverage = meetingCoverage(all, data.people.filter(isCompany).length);
  } catch {
    meetingsUnavailable = true;
  }
  const meetingIntel = buildMeetingIntel(meetingIntelSource.candidates);
  const picks = await loadScanPicks(company.id);
  const returns = await loadPhase2Returns(company.id);
  const blueprint = buildBlueprint({
    deals: deals.rows,
    components: mergeComponentLive(company.phaseComponents, signals.map),
    automationPicks: picks.picks,
    automationPicksUnavailable: picks.unavailable,
    phase2Returns: returns.selection.returns,
    phase2ReturnsUnavailable: returns.unavailable,
    phase2ReturnsProvenance: provenanceOf(returns.selection),
    asOf: new Date().toISOString().slice(0, 10),
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

          {/* Q89 inc.20 — punch #5. "brought front and center when you look up the
              associated Companies" (Rob, 2026-08-05). This is the FIRST content panel
              on the record, not the fifth: it used to sit ~33% down, below Deals, the
              ROI estimator and the Phase Blueprint, which is below the fold on the
              laptop Rob actually opens these on. The one thing above it is
              `ThingsToAddress`, and that is deliberate — it renders nothing at all
              unless this record has an OPEN flag, so it never pushes the intel down
              on a clean record, and on a dirty one an unresolved conflict genuinely
              does outrank what the last call taught us. */}
          {meetingsUnavailable ? (
            <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-xs text-amber-200">
              What the meetings taught us could not be read just now. This is our outage,
              not a statement about this company — do not read it as &ldquo;nothing was
              said&rdquo;.
            </section>
          ) : (
            <MeetingIntelSection
              intel={meetingIntel}
              meetingCount={meetingIntelSource.meetingCount}
              noMeetingNote={noMeetingNote(coverage)}
            />
          )}
          {meetingIntelSource.unusable.length > 0 && (
            <p className="-mt-3 text-[11px] text-amber-400/80">
              {meetingIntelSource.unusable.length} captured item
              {meetingIntelSource.unusable.length === 1 ? "" : "s"} could not be filed under any
              block and {meetingIntelSource.unusable.length === 1 ? "is" : "are"} not shown above.
            </p>
          )}

          {/* Q41 inc.5: a spinoff resolves to EITHER anchor, so the split renders on
              both record shells or it renders on whichever one Rob didn't open. Same
              `recordEquityView` as the master panel — never a second reading. */}
          <EquityOnRecord
            candidate={{
              id: company.id,
              name: company.name,
              description: company.description,
              notes: company.notes,
              equity: company.equity,
              href: `/companies/${company.id}`,
            }}
          />

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
                      {/* Q40 inc.12 — the phase a human states, per deal. It sits
                          on the row rather than on the section because ONE company
                          can hold a Phase 1 agreement and a Phase 2 one, and it is
                          the per-deal answer that decides which money the Phase 2
                          ROI guarantee is measured against. */}
                      <DealPhaseControl dealId={d.id} phase={d.phase} />
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
            {!deals.phaseStoreAvailable && deals.rows.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                No agreement here records which phase it is for. Phase appears per deal
                once someone sets it — until then it is unstated, not Phase 1. Said once
                here rather than as a warning on every row.
              </p>
            )}
          </section>

          {/* Q63 — the Phase 2 ROI Estimator, mounted here on Rob's instruction
              (2026-07-25: "yes definitely mounted inside the dashboard"). It renders
              `estimatePhase2Roi` output directly, so §4 point 5 of the spec applies
              literally in the app — unlike the standalone artifact, which has to carry
              its own copy of the formula and is guarded by a parity test instead. */}
          <Phase2RoiEstimator
            recordId={company.id}
            companyName={company.name}
            initial={company.phase2Estimate}
          />

          {/* §8 increment 8a — the Phase Blueprint tracker, the §3.1 centerpiece.
              Everything it says comes from `buildBlueprint`; this page only hands
              it the deals it already loaded and the stored component state. The
              kickoff strip is real today (it reads key dates that exist); the
              component lights stay dark until something reports them live, which
              the tracker states in words rather than implying with an empty row. */}
          {signals.unavailable && (
            <p className="-mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-xs text-amber-200">
              Component signals could not be read just now — a component may be live
              and showing dark below. Kickoff dates and money above are unaffected.
            </p>
          )}
          <PhaseBlueprint blueprint={blueprint} customerId={company.id} />

          {/* §3.4 — the record spine. Company rows anchor activities the same way
              a person row does (≤1-of-person/org), so this is the same feed the
              person record shows, not a second copy. */}
          <ActivityTimeline subject={{ kind: "org", id: company.id }} demoEntries={[]} isDemo={false} />

          {/* §3.5 — Notes: Rob's words only, directly under the timeline, and
              prominent. `humanNotes` is what the editor sends back (field
              `notesHuman`), so saving here can never overwrite the enrichment
              blocks quarantined at the bottom of the page. */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">Notes</h2>
              <span className="text-[11px] text-slate-600">click to edit · autosaves</span>
            </div>
            <div className="mt-2 text-sm text-slate-300">
              <InlineTextarea
                personId={company.id}
                field="notesHuman"
                value={humanNotes}
                placeholder="+ add notes"
              />
            </div>
          </section>

          {/* §3.6 — details grid, DEMOTED below Notes and trimmed to the fields
              that mean something on a company. Vertical and rep are shown as
              stored; changing which vertical a company belongs to is a graph
              edit, not a field edit, so it is not offered inline here. */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-white">Details</h2>
              <span className="text-[11px] text-slate-600">click a value to edit</span>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Website</dt>
                <dd className="text-slate-200">
                  <InlineText
                    personId={company.id}
                    field="website"
                    value={company.website}
                    placeholder="+ url"
                  />
                </dd>
              </div>
              {/* Q84 inc.21 — the second domain a company answers to. Ledger flag
                  #137 asks for exactly this edit ("add cgroofing.net to that org's
                  Domain field") and until now there was no such box on any page:
                  the column existed in Postgres, held NULL on both named orgs, and
                  was in no edit allowlist. Separate from Website on purpose — the
                  whole point is a SECOND host, so overwriting the first would
                  destroy the match it already provides. Meetings named by this
                  host attach on the next archive→CRM run. */}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Domain <span className="normal-case text-slate-600">(2nd host)</span>
                </dt>
                <dd className="text-slate-200">
                  <InlineText
                    personId={company.id}
                    field="domain"
                    value={company.domain}
                    placeholder="+ domain"
                    title="a second domain this company answers to — meetings named by it attach on the next run"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="text-slate-200">
                  <InlineText
                    personId={company.id}
                    field="phone"
                    value={company.phone}
                    placeholder="+ phone"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="text-slate-200">
                  <InlineText
                    personId={company.id}
                    field="email"
                    value={company.email}
                    placeholder="+ email"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Assigned rep</dt>
                <dd className="text-slate-200">
                  <InlineText
                    personId={company.id}
                    field="assignedRep"
                    value={company.assignedRep}
                    placeholder="+ rep"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Vertical</dt>
                <dd className="text-slate-300">{verticalName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Record type</dt>
                <dd className="text-slate-300">
                  {company.nodeType ? typeLabel(company.nodeType) : "—"}
                </dd>
              </div>
            </dl>
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

      {/* §3.5/§3.6 — machine-gathered provenance, collapsed, BELOW the grid so it
          is last on a phone as well as on a desktop (the punch #7 defect the
          person record still carries). */}
      <EnrichmentSection blocks={enrichment} />
    </div>
  );
}
