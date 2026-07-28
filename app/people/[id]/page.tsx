import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/storage";
import ActivityTimeline from "@/components/ActivityTimeline";
import AttributionLineage from "@/components/AttributionLineage";
import DocumentsSection from "@/components/esign/DocumentsSection";
import EnrichmentSection from "@/components/EnrichmentSection";
import EstimatePanel from "@/components/EstimatePanel";
import PersonEditor from "@/components/PersonEditor";
import ThingsToAddress from "@/components/ThingsToAddress";
import EquityOnRecord from "@/components/EquityOnRecord";
import { typeLabel } from "@/lib/labels";
import { ORIGIN_ID, formatChain, indexNodes, lineage } from "@/lib/lineage";
import { splitNotes } from "@/lib/notes";

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

  const doorsOpened = data.people.filter((p) => p.referredById === person.id);
  const vertical = data.verticals.find((v) => v.id === person.verticalId);
  // §5: the chain is computed by the pure engine, once, off an index reused for
  // every door below — the page never walks referredById itself.
  const nodeIndex = indexNodes(data.people);
  const chain = lineage(nodeIndex, person.id);
  // §4 header: "role @ company", one click to the company context. Only a real
  // org link renders — a role with no orgId stays plain text rather than
  // implying a company we don't have on file.
  const org = person.orgId ? data.people.find((p) => p.id === person.orgId) : undefined;

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
          {person.entityKind === "company" && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs uppercase tracking-wide text-slate-400">
              business
            </span>
          )}
          {person.nodeType && (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-300">
              {typeLabel(person.nodeType)}
            </span>
          )}
        </div>
        {(person.role || org) && (
          <p className="mt-1 text-sm text-slate-400">
            {person.role}
            {org && (
              <>
                {person.role ? " @ " : ""}
                <Link href={`/companies/${org.id}`} className="text-sky-400 hover:underline">
                  {org.name}
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ThingsToAddress mode="entity" person={person.id} />

          {/* Q41 inc.5: the registry links here, so the split has to BE here — the
              40/60 lasted five days precisely because this page showed only the
              sentence. Renders nothing when the record has no equity language. */}
          <EquityOnRecord
            candidate={{
              id: person.id,
              name: person.name,
              description: person.description,
              notes: person.notes,
              equity: person.equity,
              href: `/people/${person.id}`,
            }}
          />

          {/* §4: the lineage IS the person page's centerpiece — it sits above
              the timeline, where the company page puts its Phase tracker. The
              two pages share no centerpiece component (increment-5 ≠-test #3). */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-white">How this door opened</h2>
            <div className="mt-3">
              <AttributionLineage lineage={chain} isOrigin={person.id === ORIGIN_ID} />
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Doors opened ({doorsOpened.length})
              </div>
              <ul className="mt-2 space-y-1.5">
                {doorsOpened.map((d) => {
                  // §4: "each opened door also renders with its chain suffix so
                  // the network math is visible" — the door's own chain, from
                  // the same engine, not a re-derivation.
                  const doorChain = lineage(nodeIndex, d.id);
                  return (
                    <li key={d.id} className="flex flex-wrap items-baseline gap-x-2">
                      <Link href={`/people/${d.id}`} className="text-sm text-sky-400 hover:underline">
                        {d.name}
                      </Link>
                      {d.relationship && (
                        <span className="text-xs text-slate-500">{d.relationship}</span>
                      )}
                      <span className="text-xs text-slate-600">
                        {doorChain.status === "rooted"
                          ? formatChain(doorChain.path)
                          : "⚠ broken chain"}
                      </span>
                    </li>
                  );
                })}
                {doorsOpened.length === 0 && (
                  <li className="text-sm text-slate-600">none yet — that&apos;s the job</li>
                )}
              </ul>
            </div>
          </section>

          <ActivityTimeline personId={person.id} demoEntries={[]} isDemo={false} />

          {/* Q47 e-sign: agreements on the record — company rows anchor as org
              (0008 mirrors the activities ≤1-of-person/org rule). */}
          <DocumentsSection
            personId={person.entityKind === "company" ? undefined : person.id}
            orgId={person.entityKind === "company" ? person.id : undefined}
          />

          {/* §4 ORDER: "...→ activity/notes → details grid → enrichment
              collapsed". The edit grid is reference/maintenance, not the story
              of the relationship, so it renders BELOW the timeline — it used to
              sit second, pushing the lineage centerpiece under the fold. */}
          <PersonEditor
            person={person}
            verticals={data.verticals}
            peopleOptions={data.people.map((p) => ({ id: p.id, name: p.name }))}
          />

          {/* Q43: machine-gathered provenance quarantined at the very bottom,
              collapsed — most recent visible, rest behind the expander. */}
          <EnrichmentSection blocks={splitNotes(person.notes).enrichment} />
        </div>

        <div className="space-y-6">
          {/* §4 right rail: "Company card". §4's money ruling is "None directly
              — link to their company's deals", so this card is the person page's
              route to money: the company record is where deals/invoiced/paid
              render. The rail deliberately does NOT repeat the referrer chain —
              on this page the chain is the centerpiece two columns over, and
              printing it twice is the kind of duplication Rob's bar rejects. */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Company</div>
            {org ? (
              <>
                <Link
                  href={`/companies/${org.id}`}
                  className="mt-2 block text-sm font-semibold text-sky-400 hover:underline"
                >
                  {org.name}
                </Link>
                <p className="mt-2 text-xs text-slate-500">
                  Deals, invoiced and paid live on the company record — a person page
                  carries no money of its own.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                {person.entityKind === "company"
                  ? "This row is a business — its company record carries the money."
                  : "Not linked to a company yet."}
              </p>
            )}
          </section>

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
