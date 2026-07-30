import type { GuidanceView, GuidanceKind } from "@/lib/rep/stageGuidance";

// Q46 R9 inc.2 — the guidance line, on the page the rep works from, directly
// under the stage chip it is about.
//
// This file renders and decides nothing: the line, its length cap and WHOSE
// move it is were all settled in `lib/rep/stageGuidance` (CR-3). A second
// opinion here — a tweaked word, an extra clause — would be a second answer to
// "what does done mean at this stage" sitting one line under the first.
//
// NO STATE, SO NO CLIENT COMPONENT, same as the collateral shelf: this ships no
// JS at all.
//
// THE THREE KINDS LOOK LIKE THREE DIFFERENT THINGS, WHICH IS THE WHOLE POINT.
// One shared grey line would flatten "you owe them a call" into "we owe them an
// invoice" into "this is dead", and a rep scanning eight accounts reads colour
// and shape before they read a sentence. So:
//  · advance — emerald, and the ONLY kind that gets an action-coloured chip. It
//    is the rep's move; it should look like the one thing on the card to do.
//  · waiting — amber, matching the shelf's `awaiting_link`: amber on this page
//    already means "real, but not yours to push".
//  · closed  — slate, quiet, no chip tint. A lost deal must not read as work.
//
// AND NO GUIDANCE RENDERS NOTHING HERE. `guidanceViewFor` hands back a blocker
// ("no deal on this account yet") — but `RepAccountStageChip` sits immediately
// above and already says exactly that, in more detail, for both the no-deal and
// the two-deals cases. Printing it twice in one eyeful is not honesty, it is
// noise, and it would train a rep to skip the line that matters on the accounts
// that DO have a stage.

const KIND_CHIP: Record<GuidanceKind, string> = {
  advance: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  waiting: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  closed: "border-white/10 bg-white/5 text-slate-400",
};

const KIND_LABEL: Record<GuidanceKind, string> = {
  advance: "your move",
  waiting: "waiting",
  closed: "closed",
};

const KIND_TEXT: Record<GuidanceKind, string> = {
  advance: "text-slate-200",
  waiting: "text-amber-100/80",
  closed: "text-slate-500",
};

export default function RepStageGuidance({ view }: { view: GuidanceView }) {
  const { guidance, stageLabel } = view;
  if (!guidance) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_CHIP[guidance.kind]}`}
        title={stageLabel ? `stage: ${stageLabel}` : undefined}
      >
        {KIND_LABEL[guidance.kind]}
      </span>
      <span className={`text-xs leading-relaxed ${KIND_TEXT[guidance.kind]}`}>
        {guidance.line}
      </span>
    </div>
  );
}
