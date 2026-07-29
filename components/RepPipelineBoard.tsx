import Link from "next/link";
import { STAGE_LABELS } from "@/lib/labels";
import { repMoney } from "@/lib/repSource";
import type {
  RepPipelineBoard,
  RepPipelineCard,
  StageTint,
} from "@/lib/deals/repPipelineBoard";

// Q46 R3 inc.2 — the pipeline board reaches the rep's screen. inc.1 built the
// pure seam (`repPipelineBoard`) with no caller; a board nobody renders closes
// no deals.
//
// This file renders and nothing else. Which column, whose deal, and which tint
// were all decided in the pure module (CR-3), because a tint invented here
// would disagree with the Today band's clock and nothing on screen could say
// which one was right.
//
// THE THREE TINTS RENDER AS THREE THINGS. `untimed` is drawn as its own muted
// state, never as green: no stage limit exists for new_lead / meeting_held /
// signed, and painting them healthy would state an all-clear the rules engine
// never made.
//
// AN `over` CARD THE TODAY BAND WILL NOT LIST SAYS SO ON ITS FACE. The Today
// engine drops `demo-*` rows and this cockpit runs on the demo book, so those
// cards age for real while the band above stays silent. Left unlabelled, a rep
// hunts a band row that does not exist.

const TINT: Record<StageTint, { dot: string; text: string; ring: string }> = {
  over: {
    dot: "bg-rose-400",
    text: "text-rose-300",
    ring: "border-rose-400/30 hover:border-rose-400/50",
  },
  within: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "border-white/10 hover:border-white/20",
  },
  untimed: {
    dot: "bg-slate-600",
    text: "text-slate-500",
    ring: "border-white/10 hover:border-white/20",
  },
};

function ageLabel(card: RepPipelineCard): string {
  if (!card.age) return "no stage limit";
  const { days, limit, over, basis } = card.age;
  const clock = basis === "meeting" ? "since meeting" : "in stage";
  return `${days}d ${clock} · limit ${limit}${over ? "" : " · ok"}`;
}

function Card({ card }: { card: RepPipelineCard }) {
  const tint = TINT[card.tint];
  // Deals anchor to a person or an org — link to whichever we have, and stay
  // plain text when we have neither. A dead link on a rep's board costs trust.
  const href = card.deal.personId
    ? `/rep/accounts/${card.deal.personId}`
    : card.deal.orgId
      ? `/people/${card.deal.orgId}`
      : undefined;

  const title = (
    <span className="text-sm font-medium text-white">
      {card.deal.name.replace(" (DEMO)", "")}
    </span>
  );

  return (
    <li className={`rounded-lg border bg-white/5 p-2.5 transition ${tint.ring}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tint.dot}`} />
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
          <div className={`mt-0.5 text-[11px] ${tint.text}`}>{ageLabel(card)}</div>
          {card.deal.value != null && (
            <div className="tabular mt-0.5 text-xs text-amber-300/90">
              {repMoney(card.deal.value)}
            </div>
          )}
          {!card.mine && (
            <div className="mt-1 text-[11px] text-amber-400/80">Assigned to nobody</div>
          )}
          {card.tint === "over" && !card.surfacedInToday && (
            <div className="mt-1 text-[11px] leading-snug text-slate-500">
              Aging, but excluded from today&apos;s rules (demo record) — it will not
              appear in the band above.
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function RepPipelineBoardPanel({
  board,
  repName,
}: {
  board: RepPipelineBoard;
  repName: string;
}) {
  const totalCards = board.columns.reduce((n, c) => n + c.cards.length, 0);
  const totalOver = board.columns.reduce((n, c) => n + c.overCount, 0);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          My pipeline
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-500">
          {totalOver > 0 && (
            <span className="text-rose-300">{totalOver} past their stage limit</span>
          )}
          {/* Counts, never their rows — another rep's book is not this rep's business. */}
          {board.othersCount > 0 && <span>{board.othersCount} on other reps&apos; books</span>}
          {/* Closed and stalled money is off the ladder, but never silently dropped. */}
          {board.offBoardCount > 0 && (
            <span>{board.offBoardCount} off the open ladder (won, lost or stalled)</span>
          )}
        </div>
      </div>

      {totalCards === 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-slate-400">
            No open deals on {repName.replace(" (DEMO)", "")}&apos;s board
            {board.othersCount > 0 || board.offBoardCount > 0
              ? " — everything in the system sits with another rep or off the open ladder."
              : "."}
          </p>
          <p className="text-xs text-slate-500">
            Deals appear here from the moment they are created — this is the open ladder
            only, so won, lost and stalled deals are counted above rather than shown.
          </p>
        </div>
      ) : (
        <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
          {board.columns.map((col) => (
            <div key={col.stage} className="w-56 shrink-0">
              <div className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  {STAGE_LABELS[col.stage]}
                </span>
                <span className="tabular text-[11px] text-slate-500">{col.cards.length}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 pt-1">
                {/* `—` means NOBODY PRICED THIS COLUMN, not "it sums to zero".
                    Keying the dash off `value > 0` would print the absence
                    glyph over a column of real, deliberately $0 deals — the
                    known read as the unknown, which is the same defect
                    `valueUnknownCount` exists to prevent in the other
                    direction. */}
                <span className="tabular text-xs text-amber-300/90">
                  {col.cards.length > col.valueUnknownCount ? repMoney(col.value) : "—"}
                </span>
                {/* A total is never read as complete: say how many cards had no value. */}
                {col.valueUnknownCount > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {col.valueUnknownCount} unpriced
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1.5">
                {col.cards.map((card) => (
                  <Card key={card.deal.id} card={card} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
