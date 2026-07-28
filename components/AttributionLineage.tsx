"use client";

import Link from "next/link";
import { useState } from "react";
import type { Lineage, LineageRef } from "@/lib/lineage";

// Master View 2.0 §5 — the attribution-lineage breadcrumb. This is the ONLY
// renderer of lib/lineage.ts, which has been pure + unit-tested since increment
// 3 but had no surface until now (§8 increment 5d).
//
// Rob's rule, verbatim (BUILD-QUEUE Q39(e)): "attribution lines must show the
// FULL referral chain back to ROB origin... never make Rob guess the origin
// node." Two consequences are structural here, not cosmetic:
//   1. A chain that does NOT reach the origin renders a "⚠ broken chain" chip
//      with the engine's own plain-language reason. It never silently shows the
//      head of the list as if it were Rob.
//   2. Truncation (§5: hops ≥4 middle-truncate) is EXPANDABLE, never lossy —
//      the hidden hops are one click away, so the compact form can't hide a
//      hop Rob needed to see.

/** Chips are links except the node itself, which the caller omits anyway. */
// `hop` is deliberately NOT named `ref`: React 19 treats `ref` as a reserved
// prop, so a prop of that name reads as a ref access during render.
function Hop({ hop, dim }: { hop: LineageRef; dim?: boolean }) {
  return (
    <Link
      href={`/people/${hop.id}`}
      title={hop.relationship ? `${hop.name} — ${hop.relationship}` : hop.name}
      className={
        hop.isOrigin
          ? "rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:border-emerald-400/70"
          : `rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs hover:border-white/30 ${
              dim ? "text-slate-500" : "text-slate-300"
            }`
      }
    >
      {hop.name}
    </Link>
  );
}

function Arrow() {
  return <span className="text-xs text-slate-600">→</span>;
}

/**
 * The breadcrumb itself, reusable wherever §5 says a chain appears (person
 * page, company right rail, doors-opened lines).
 *
 * `refs` is origin-first and excludes the node you're on — pass
 * `lineage(...).ancestors`.
 */
export function ChainBreadcrumb({
  refs,
  truncateAt = 4,
}: {
  refs: readonly LineageRef[];
  truncateAt?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncatable = refs.length >= truncateAt;
  const shown = truncatable && !expanded ? [refs[0], refs[refs.length - 1]] : refs;
  const hiddenCount = refs.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((hop, i) => (
        <span key={hop.id} className="flex items-center gap-1.5">
          {i > 0 && <Arrow />}
          {/* The ellipsis sits where the hidden hops were removed: after the
              origin chip, before the last named hop. */}
          {i === 1 && hiddenCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400 hover:border-white/30 hover:text-slate-200"
                aria-label={`show ${hiddenCount} hidden hop${hiddenCount === 1 ? "" : "s"}`}
              >
                +{hiddenCount}
              </button>
              <Arrow />
            </>
          )}
          <Hop hop={hop} />
        </span>
      ))}
      {expanded && truncatable && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-600 hover:text-slate-400"
        >
          collapse
        </button>
      )}
    </div>
  );
}

/**
 * The person-page centerpiece: the chain, or an honest statement of why there
 * isn't one. `status` decides which — never the length of the path.
 */
export default function AttributionLineage({
  lineage,
  isOrigin,
}: {
  lineage: Lineage;
  /** True when the page IS Rob — the origin has no upstream, and that's fine. */
  isOrigin: boolean;
}) {
  if (isOrigin) {
    return (
      <div className="text-sm text-slate-400">
        This is the origin — every chain in the network starts here.
      </div>
    );
  }

  if (lineage.status === "rooted") {
    return (
      <div className="space-y-2">
        <ChainBreadcrumb refs={lineage.ancestors} />
        <p className="text-xs text-slate-600">
          {lineage.ancestors.length === 1
            ? "Direct from the origin."
            : `${lineage.ancestors.length - 1} hop${
                lineage.ancestors.length - 1 === 1 ? "" : "s"
              } between the origin and this record.`}
        </p>
      </div>
    );
  }

  // No referrer on file at all. Nothing is broken here — a Phase-4 venture
  // entity genuinely IS its own origin — so this states the fact plainly
  // instead of stamping correct data with a warning (flag #45). It still never
  // implies the chain is complete: "not recorded" is said out loud.
  if (lineage.status === "unattributed") {
    return (
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-400">
          origin not recorded
        </span>
        <p className="text-xs text-slate-500">
          No referrer is on file — this record is the start of its own chain.
        </p>
      </div>
    );
  }

  // Broken: show what IS known (so the partial chain still has value) under an
  // explicit chip carrying the engine's reason. No guessing, per §5.
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs text-amber-300">
        ⚠ broken chain
      </span>
      {lineage.reason && <p className="text-xs text-slate-400">{lineage.reason}</p>}
      {lineage.ancestors.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-600">known so far</div>
          <div className="mt-1">
            <ChainBreadcrumb refs={lineage.ancestors} />
          </div>
        </div>
      )}
    </div>
  );
}
