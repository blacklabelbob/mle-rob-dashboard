import Link from "next/link";
import {
  BLOCK_TITLES,
  type IntelBlock,
  type IntelItem,
  type MeetingIntel,
  sourceLabel,
} from "@/lib/meetings/meetingIntel";

// Q89 increment 2 — the surface. `meetingIntel.ts` decides WHAT may be claimed; this
// decides only how it reads. It computes nothing: no ranking, no summarising, no
// filling of a thin block with a plausible sentence. Every string below is either
// the module's own output or a fixed label.
//
// Rob, 2026-08-05: *"Whats critical is to make sure all of this stuff is brought front
// and center when you look at the overview in the CRM and when you look up the
// associated Companies."* Front and centre includes the bad news — a block that is
// empty says so, and says why, because "nothing was said" and "three claims failed the
// provenance check" are different facts and only one of them means go re-read the call.

function ItemRow({ item, ranked }: { item: IntelItem; ranked: boolean }) {
  const label = sourceLabel(item.provenance);
  return (
    <li className="border-l-2 border-white/10 pl-3">
      <div className="text-sm text-slate-200">
        {/* A rank that exists only as row position is deniable — and unreadable the
            moment a reader scrolls. When the block claims `ranked`, the number is on
            the screen. `ordering` is the module's verdict, so a merged or partial
            ranking never reaches this branch. critic-rob 2026-08-05, punch list #1. */}
        {ranked && typeof item.rank === "number" && (
          <span className="mr-2 font-semibold tabular-nums text-slate-400">{item.rank}.</span>
        )}
        {item.text}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {item.owner && <span className="text-slate-400">{item.owner}</span>}
        {item.status && (
          <span className={item.status === "done" ? "text-emerald-400" : "text-amber-400"}>
            {item.status === "done" ? "done" : "open"}
          </span>
        )}
        {/* The link is the whole point: a claim on a company page must open. */}
        {item.provenance.url ? (
          <Link href={item.provenance.url} className="underline decoration-white/20 hover:text-slate-300">
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </li>
  );
}

function Block({ block }: { block: IntelBlock }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{block.title}</h3>
        {!block.isEmpty && (
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">
            {/* Said out loud so an unranked list is never mistaken for a priority order. */}
            {block.ordering === "ranked" ? "ranked" : "as said, not ranked"}
          </span>
        )}
      </div>

      {block.isEmpty ? (
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{block.emptyReason}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {block.items.map((item, i) => (
            <ItemRow
              key={`${item.provenance.meetingId}-${item.provenance.sourceRef}-${i}`}
              item={item}
              ranked={block.ordering === "ranked"}
            />
          ))}
        </ul>
      )}

      {/* A rejection under a block that still has items would otherwise vanish. */}
      {!block.isEmpty && block.rejected.length > 0 && (
        <p className="mt-3 text-[11px] text-amber-400/80">
          {block.rejected.length} more candidate{block.rejected.length === 1 ? "" : "s"} not shown — failed the
          provenance check.
        </p>
      )}
    </div>
  );
}

export default function MeetingIntelSection({
  intel,
  meetingCount,
  // Q89 inc.4 — the Overview shows the same four blocks across every company, so it needs
  // its own heading and its own denominator ("3 meetings · 2 companies"). Both are plain
  // labels supplied by the caller; this component still computes nothing.
  title = "What the meetings taught us",
  countLabel,
}: {
  intel: MeetingIntel;
  meetingCount: number;
  title?: string;
  countLabel?: string;
}) {
  // No meetings and nothing rejected: there is no gap to report. Four empty boxes on a
  // company we have never spoken to would make "no calls yet" and "call went uncaptured"
  // look identical on every record — the exact confusion this section exists to end.
  if (meetingCount === 0 && intel.isEmpty && intel.rejected.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-white">{title}</h2>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          {countLabel ?? `${meetingCount} meeting${meetingCount === 1 ? "" : "s"}`}
        </span>
      </div>

      {intel.isEmpty && (
        <p className="mt-2 text-[12px] leading-relaxed text-amber-400/80">
          Nothing from {meetingCount === 1 ? "this call" : "these calls"} has made it onto this record yet. The
          blocks below say which check each candidate failed.
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {intel.blocks.map((block) => (
          <Block key={block.kind} block={block} />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-600">
        {BLOCK_TITLES["pain-points"]} are quoted as said — never rewritten into a benefit.
      </p>
    </section>
  );
}
