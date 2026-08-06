import Link from "next/link";
import { groupIntelItems, type IntelGroup } from "@/lib/meetings/grouping";
import {
  BLOCK_TITLES,
  compactSourceLabel,
  contextExcerpt,
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

function ItemRow({
  item,
  ranked,
  // Q92(b) — the heading above this row, or null when the surface has none. Passed rather
  // than inferred: the label may only drop the company name when the reader can still see
  // it, and only this component knows whether the <h4> was actually rendered.
  groupContext = null,
}: {
  item: IntelItem;
  ranked: boolean;
  groupContext?: string | null;
}) {
  // The full address, always — this is what the reader hovers to get back what was elided,
  // and it is the string every test that pins an address asserts.
  const fullLabel = sourceLabel(item.provenance);
  const omitContext = groupContext !== null && groupContext === item.provenance.context?.trim();
  const label = compactSourceLabel(item.provenance, { omitContext });
  // The evidence, on the page. See `contextExcerpt` for why this is the honest form of
  // punch #4: no anchor exists to link to yet, so the source line comes to the reader
  // instead of the reader being sent to grep a 117KB transcript. Never computed here.
  const source = contextExcerpt(item);
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
      {source && (
        <blockquote className="mt-1.5 border-l border-white/10 pl-2 text-[12px] italic leading-relaxed text-slate-400">
          {source}
        </blockquote>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {item.owner && <span className="text-slate-400">{item.owner}</span>}
        {item.status && (
          <span className={item.status === "done" ? "text-emerald-400" : "text-amber-400"}>
            {item.status === "done" ? "done" : "open"}
          </span>
        )}
        {/* The link is the whole point: a claim on a company page must open. */}
        {item.provenance.url ? (
          <Link
            href={item.provenance.url}
            title={fullLabel}
            className="underline decoration-white/20 hover:text-slate-300"
          >
            {label}
          </Link>
        ) : (
          <span title={fullLabel}>{label}</span>
        )}
      </div>
    </li>
  );
}

function ItemList({
  items,
  ranked,
  groupContext = null,
}: {
  items: IntelItem[];
  ranked: boolean;
  groupContext?: string | null;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <ItemRow
          key={`${item.provenance.meetingId}-${item.provenance.sourceRef}-${i}`}
          item={item}
          ranked={ranked}
          groupContext={groupContext}
        />
      ))}
    </ul>
  );
}

// Q89 inc.23 — critic-rob punch #7: the Overview was one 22-row wall of every action item
// in the CRM, ungrouped and uncapped. Grouped by company here, capped by `grouping.ts`.
//
// The overflow is a native <details>, not a state toggle: this is a server component on a
// page with no client JS, and a disclosure that works with JS off is the honest version of
// "show all N" anyway. The count in the summary is the TOTAL, never the hidden count —
// a reader must be able to see how much there is without opening it.
function ItemGroup({ group, ranked }: { group: IntelGroup; ranked: boolean }) {
  return (
    <div>
      {group.context && (
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {group.context}
          <span className="ml-1.5 font-normal tabular-nums text-slate-600">{group.total}</span>
        </h4>
      )}
      <ItemList items={group.shown} ranked={ranked} groupContext={group.context} />
      {group.hidden.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer list-none text-[11px] text-slate-400 underline decoration-white/20 hover:text-slate-200">
            Show all {group.total} — {group.hidden.length} more
          </summary>
          <div className="mt-3">
            <ItemList items={group.hidden} ranked={ranked} groupContext={group.context} />
          </div>
        </details>
      )}
    </div>
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
        <div className="mt-3 space-y-4">
          {groupIntelItems(block.items).map((group) => (
            <ItemGroup key={group.context ?? "__none"} group={group} ranked={block.ordering === "ranked"} />
          ))}
        </div>
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
  // Q89 inc.21 — critic-rob punch #6. The one line a record with no captured meeting
  // prints instead of nothing at all. Built by `lib/meetings/coverage.ts` so both
  // surfaces quote the same numbers; this component still computes nothing.
  noMeetingNote,
}: {
  intel: MeetingIntel;
  meetingCount: number;
  title?: string;
  countLabel?: string;
  noMeetingNote?: string;
}) {
  // No meetings and nothing rejected. Four empty boxes here would make "no calls yet" and
  // "call went uncaptured" look identical on every record — the exact confusion this
  // section exists to end — so the answer is ONE line, not four blocks. Rendering nothing
  // was worse than either: ~28 of ~31 companies showed a blank space, and a blank space
  // reads as "nothing worth saying was said here", which is a claim about the customer.
  // What is actually true is a fact about us: we have not captured a call on this record.
  if (meetingCount === 0 && intel.isEmpty && intel.rejected.length === 0) {
    if (!noMeetingNote) return null;
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-[12px] leading-relaxed text-slate-400">
        {noMeetingNote}
      </p>
    );
  }

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
