import Link from "next/link";
import { notFound } from "next/navigation";
import CallButton from "@/components/CallButton";
import PhaseEightBar from "@/components/PhaseEightBar";
import PhaseLights from "@/components/PhaseLights";
import ActivityTimeline from "@/components/ActivityTimeline";
import Phase2RoiEstimator from "@/components/Phase2RoiEstimator";
import QuotedAmountInline from "@/components/QuotedAmountInline";
import RepAccountStageChip from "@/components/RepAccountStageChip";
import RepStageGuidance from "@/components/RepStageGuidance";
import RepLogInteraction from "@/components/RepLogInteraction";
import RepEmailDrafts from "@/components/RepEmailDrafts";
import RepCollateralShelf from "@/components/RepCollateralShelf";
import DemoFooter from "@/components/DemoFooter";
import { InlineDateChip, InlineSelect, InlineText } from "@/components/inline/fields";
import { getStore } from "@/lib/storage";
import { accountStageChip } from "@/lib/deals/accountStageChip";
import { draftViewsFor } from "@/lib/rep/emailTemplates";
import { collateralViewsFor } from "@/lib/rep/collateral";
import { guidanceViewFor } from "@/lib/rep/stageGuidance";
import { buildBlueprint } from "@/lib/phases/blueprint";
import { loadComponentLive, mergeComponentLive } from "@/lib/phases/componentLiveLoad";
import { loadScanPicks } from "@/lib/phases/scanPicksLoad";
import { loadPhase2Returns } from "@/lib/phases/phase2ReturnsLoad";
import { provenanceOf } from "@/lib/phases/phase2ReturnsSelect";
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
  const store = getStore();
  // Q46 R5 — the deal book is loaded beside the network because a stage lives on
  // a DEAL and this page is anchored on a person; `accountStageChip` owns the
  // resolution between them, and the failure modes it refuses are listed there.
  const [data, deals] = await Promise.all([store.getNetwork(), store.listDeals()]);
  const person = data.people.find((p) => p.id === id);
  // Rep view is scoped to the rep's own book — not a back door into the full ledger.
  if (!person || !(person.assignedRep ?? "").startsWith("Jake")) notFound();

  const vertical = data.verticals.find((v) => v.id === person.verticalId);
  // Q46 R6 inc.2 — the email drafts read the stage from the SAME chip resolution
  // the stage control uses, so a rep's template and the chip above it can never
  // disagree about what stage this account is at. Only `kind === "one"` supplies
  // a stage: with several anchored deals, picking one to write an email from
  // would be this surface adopting a deal the chip deliberately refuses to
  // claim, so the drafts fall back to first-touch and SAY so.
  const stageChip = accountStageChip(person, deals);
  const chipDeal = stageChip.kind === "one" ? deals.find((d) => d.id === stageChip.deal.id) : undefined;
  const emailDrafts = draftViewsFor({
    person,
    deal: chipDeal,
    verticalName: vertical?.name,
    repName: (person.assignedRep ?? "").replace(" (DEMO)", ""),
  });
  const emailStageNote =
    stageChip.kind === "one"
      ? `written for: ${emailDrafts.stageLabel}`
      : stageChip.kind === "ambiguous"
        ? "more than one deal here — using first-touch until one is picked"
        : "no deal yet — using first-touch";
  // Q46 R7 inc.2 — the shelf reads its stage from the SAME `chipDeal` the stage
  // chip and the email drafts read, for the same reason: three surfaces in one
  // eyeful disagreeing about what stage this account is at is the drift that puts
  // a Signed-onward deliverable on the shelf of a deal nobody has signed.
  //
  // `accountUrls` IS DELIBERATELY EMPTY, NOT FORGOTTEN. The Growth Scan is a
  // `perAccount` asset and no column on any record holds a link to one today, so
  // there is no honest value to pass and the row resolves to `not_yet`. Inventing
  // one — the master company record, a guessed Drive path — would render client
  // A's page as client B's scan or a 404 mid-call. Filed to the flags ledger so
  // the missing field is somebody's problem rather than a quiet omission here.
  const collateral = collateralViewsFor({
    verticalId: person.verticalId,
    stage: chipDeal?.stage,
  });
  // Q46 R9 inc.2 — the fourth reader of the SAME `chipDeal`. The guidance line
  // says what "done" means at this stage, so it must be the stage the chip
  // shows; resolving it here (rather than in the component) is what keeps the
  // chip, the drafts, the shelf and the line from being four opinions.
  const stageGuidance = guidanceViewFor(chipDeal?.stage);
  const reason = touchReason(person);
  const ctx = sourceContext(person);
  const isDemo = isDemoPerson(person);
  const paidDate = person.keyDates?.paid;

  // The rep tracker reads the SAME builder the master company record uses, so a
  // rep and Rob can never see two different versions of delivery progress. The
  // lead's own key dates stand in for the deal row here — this view is anchored
  // on a person, and buildBlueprint only reads key dates and component state.
  // Q40 inc.6 — the rep sees the SAME signalled lights Rob does, from the same
  // loader, so "is it live yet?" has one answer across both views. A phase signal
  // is keyed on a company row, so a rep account that is a person simply matches
  // nothing here; that is an honest empty, not a failure.
  // Q40 leg (6) inc.17 — the rep is handed the SAME recorded shortlist Rob is,
  // from the same loader, so a rep and Rob can never pitch two different lists.
  // (What the rep is allowed to SEE of it is `aimForNextFor("rep")`'s call, made
  // once in the pure module — never re-decided here.)
  // Q63 leg (5) inc.7 — the rep's guarantee is read from the SAME store, keyed the
  // same way, as the one on the master record: a rep and Rob can never be told two
  // different things about whether the money guarantee is being met. A failed read
  // travels as `unavailable`, never as "not measured yet".
  const signals = await loadComponentLive(person.id);
  const picks = await loadScanPicks(person.id);
  const returns = await loadPhase2Returns(person.id);
  const blueprint = buildBlueprint({
    deals: [
      {
        id: person.id,
        name: person.business || person.name,
        stage: person.signed ? "signed" : "quote_sent",
        value: person.quotedAmount || undefined,
        keyDates: person.keyDates ?? {},
      },
    ],
    components: mergeComponentLive(person.phaseComponents, signals.map),
    phase2Returns: returns.selection.returns,
    phase2ReturnsUnavailable: returns.unavailable,
    phase2ReturnsProvenance: provenanceOf(returns.selection),
    asOf: new Date().toISOString().slice(0, 10),
  });

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
            {/* Q46 R5 (research §5 Δ5) — the stage a rep is actually working,
                on the page they work it from, writing through the SAME audited
                PATCH the rep board uses. */}
            <RepAccountStageChip chip={stageChip} />
            {/* Q46 R9 inc.2 (research §5 Δ9) — what "done" means AT that stage,
                under the chip that names it, off the SAME `chipDeal` the chip,
                the drafts and the shelf read. Renders nothing when there is no
                stage: the chip above already says why. */}
            <RepStageGuidance view={stageGuidance} />
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
              {/* Q46 R6 inc.2 — this used to be a bare `mailto:` that opened an
                  EMPTY compose window: the rep then wrote the same intro from
                  scratch for the fifth time, off the top of their head, under
                  MLE's name. It now lands on the drafts written for this stage.
                  Rendered whether or not an address exists, because "there is
                  no address on this record" is a thing the rep needs told —
                  hiding the button hides the gap. */}
              <a
                href="#rep-email"
                className="rounded-lg bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Email
              </a>
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

          {/* §3.1 "Rep view of the same tracker" — the gap this closes: a rep
              closed the deal and then had no way to see whether anything had
              actually been delivered. Lights and phase names only; PhaseLights is
              never handed the money fields, so there is no path here that could
              print an invoice figure or the refund mechanics. */}
          {signals.unavailable && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-xs text-amber-200">
              Delivery signals could not be read just now — something may be live and
              showing dark below.
            </p>
          )}
          <PhaseLights blueprint={blueprint} />

          {/* Q46 R10 inc.2 — logging sits directly above the timeline it writes
              to, so the rep sees the result of the save in the same eyeful.
              `assignedRep` is the only name this page knows for who is logging;
              real identity arrives with Phase-4 profiles (Q6). */}
          <RepLogInteraction
            personId={person.id}
            orgId={person.orgId}
            createdBy={person.assignedRep}
            personName={person.name.replace(" (DEMO)", "")}
          />

          {/* Q46 R6 inc.2 — the drafts written for the stage this account is
              actually at, replacing the empty compose window the header's
              `mailto:` used to open. Resolved server-side, in the render that
              already holds the record: the client picks a template and nothing
              else. */}
          <RepEmailDrafts drafts={emailDrafts.views} stageNote={emailStageNote} />

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

          {/* Q46 R7 inc.2 (research §2.6 / §5 Δ7) — what to put in front of this
              prospect, above Contact because it is grabbed in the same breath as
              the phone number and below Next step because what to say outranks
              what to show. Every offered asset renders, including the ones we
              cannot link: a shelf that silently drops those teaches a rep MLE has
              no roofing deck, and nobody ever closes a gap they cannot see. */}
          <RepCollateralShelf
            views={collateral.views}
            hasDeal={collateral.hasDeal}
            stageLabel={collateral.stageLabel}
          />

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
