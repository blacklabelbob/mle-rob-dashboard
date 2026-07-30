import type { CollateralView } from "@/lib/rep/collateral";

// Q46 R7 inc.2 — the "Present" shelf on the page the rep works from. This file
// renders and decides nothing: which assets are offered, which are linkable, and
// what a rep is told when one is not all come from `lib/rep/collateral`, resolved
// on the server in the render that already holds the record (CR-3).
//
// NO STATE, SO NO CLIENT COMPONENT. The email drafts hold one piece of state —
// which template is selected — and earned `"use client"`. A shelf of links holds
// none, so it stays on the server and ships no JS.
//
// A ROW WE CANNOT LINK IS NOT AN ANCHOR. `state === "ready"` is the only branch
// that renders an `<a href>`; the other two render as text with their reason.
// This is the whole point of the module behind it: a rep clicking "Roofing demo
// deck" WITH THE PROSPECT WATCHING and landing on a 404 is worse than never
// having offered it, because the shelf promised.
//
// AND THE TWO UNLINKABLE STATES LOOK DIFFERENT ON PURPOSE. `awaiting_link` is
// OURS (amber — a thing to chase us about); `not_yet` is a fact about this
// account (slate, quiet — nothing to chase). One shared grey would tell a rep
// that a deck we simply have not sent them is a deliverable their client is
// missing, and they would apologise for it on the call.

const STATE_ROW: Record<CollateralView["state"], string> = {
  ready: "border-white/10 bg-white/5",
  awaiting_link: "border-amber-400/25 bg-amber-400/5",
  not_yet: "border-white/5 bg-white/[0.02]",
};

export default function RepCollateralShelf({
  views,
  hasDeal,
  stageLabel,
}: {
  views: CollateralView[];
  /**
   * Whether a stage was resolvable for this account at all. Owned by the caller
   * for the same reason the email drafts' `stageNote` is: only the caller knows
   * WHY there is no stage, and "no deal yet" printed over a record with two
   * anchored deals would be a lie.
   */
  hasDeal: boolean;
  stageLabel?: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">Present</h2>
        <span className="text-[11px] text-slate-500">
          {hasDeal && stageLabel ? `for: ${stageLabel}` : "no deal yet — sales assets only"}
        </span>
      </div>

      {views.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Nothing shelved for this account yet — ask for what you need and it appears
          here for everyone.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {views.map((v) => (
            <li key={v.id} className={`rounded-lg border px-3 py-2.5 ${STATE_ROW[v.state]}`}>
              {v.state === "ready" && v.url ? (
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-sky-300 underline decoration-sky-300/30 underline-offset-2 transition hover:text-sky-200"
                >
                  {v.label} ↗
                </a>
              ) : (
                <div className="text-sm font-medium text-slate-300">{v.label}</div>
              )}
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{v.purpose}</p>
              {v.blocker && (
                <p
                  className={`mt-1.5 text-xs leading-relaxed ${
                    v.state === "awaiting_link" ? "text-amber-200/90" : "text-slate-500"
                  }`}
                >
                  {v.blocker}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
