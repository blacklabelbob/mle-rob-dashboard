// Q40 leg (4) inc.5: the READ half — stored rows → the lights the board renders.
//
// inc.1 decided whether a signal applies, inc.2 what row it writes, inc.3 how that
// row lands in 0025, inc.4 opened the door it arrives through. Everything so far
// runs in the WRITE direction, and nothing on any screen has ever read a single
// one of those rows: `phaseComponents` on a company is a field of the right type
// that no code path has ever set. So today a partner could POST a perfect signal,
// get `applied: true`, watch the row land — and the customer's board would stay
// dark. This module is the return path, and like the rest of the seam it is pure:
// rows in, `ComponentLiveMap` out, no clock, no network, no Supabase (CR-3).
//
// THE FAILURE THIS FILE EXISTS TO PREVENT is a light appearing on the WRONG phase.
// `ComponentLiveMap` is keyed by slug ALONE — the blueprint looks up each phase's
// components in one flat map — but a stored row is keyed by the triple
// `(customer, phase, component_id)`. Those two shapes disagree, and the place they
// disagree is exactly where a partner mistake becomes a lie on a customer's
// screen: a row saying `phase: 2, component_id: "website-aeo-seo"` would otherwise
// light Phase 1's refund-clock component — the one light on this board that starts
// a 30-day money-back promise running. A signal is only allowed to light the
// component in the phase that component actually belongs to.

import { componentDefsFor, type PhaseNo } from "./components";
import type { ComponentLiveMap } from "./blueprint";
import type { PhaseComponentRow } from "./componentStateRow";

const PHASES: readonly PhaseNo[] = [1, 2, 3];

/**
 * The phase a slug belongs to per the canon, or `null` if the canon does not
 * name it.
 *
 * P2/P3 slots are matched by their `p2-`/`p3-` prefix rather than by membership
 * in `slotDefs()`: that helper returns the DEFAULT slot count (3), and a customer
 * whose signed phase has four automations would otherwise have `p2-auto-4`
 * treated as unknown. The prefix is the part of a slot slug that is structural.
 */
export function canonicalPhaseOf(componentId: string): PhaseNo | null {
  const slug = componentId.trim();
  if (!slug) return null;
  for (const phase of PHASES) {
    if (componentDefsFor(phase).some((d) => d.slug === slug)) return phase;
  }
  const slot = /^p([23])-auto-\d+$/.exec(slug);
  return slot ? (Number(slot[1]) as PhaseNo) : null;
}

/**
 * True when a stored row claims a component under a phase the canon puts
 * elsewhere.
 *
 * A slug the canon does not name at all is NOT a contradiction — it is simply a
 * component we do not render (a slot beyond the default count, or one Rob adds to
 * the checklist before this map is redeployed). Dropping those would be the same
 * silent-omission bug in the other direction, so they pass through and land in
 * the map harmlessly: the blueprint only ever looks up slugs it knows.
 */
function contradictsCanon(row: PhaseComponentRow): boolean {
  const canonical = canonicalPhaseOf(row.component_id);
  return canonical !== null && canonical !== row.phase;
}

/** Later wins; a row that has never been signalled loses to one that has. */
function isNewer(candidate: PhaseComponentRow, incumbent: PhaseComponentRow): boolean {
  const a = candidate.last_signal_at ?? "";
  const b = incumbent.last_signal_at ?? "";
  return a > b;
}

/**
 * Stored rows → the flat map the blueprint reads.
 *
 * `live_at: null` is kept as an entry with NO `liveAt` rather than dropped: that
 * is a component which was lit and then reverted, and the blueprint reads
 * `live: Boolean(liveAt)`, so it renders dark either way. Keeping the entry keeps
 * its `source` — the difference between "nobody ever signalled this" and "Will's
 * tools told us it went back down", which is the answer to the only question Rob
 * asks about a dark light on a board that has other lights lit.
 *
 * Two surviving rows for the same slug can only happen for a slug the canon does
 * not name (see `contradictsCanon`), and then the newest `last_signal_at` wins —
 * stated rather than left to object-key order, because "whichever came back from
 * Postgres last" is not a rule anyone can reason about later.
 */
export function liveMapFromRows(rows: readonly PhaseComponentRow[]): ComponentLiveMap {
  const kept = new Map<string, PhaseComponentRow>();

  for (const row of rows) {
    const slug = row.component_id?.trim();
    if (!slug || contradictsCanon(row)) continue;
    const incumbent = kept.get(slug);
    if (!incumbent || isNewer(row, incumbent)) kept.set(slug, row);
  }

  const map: ComponentLiveMap = {};
  for (const [slug, row] of kept) {
    map[slug] = {
      liveAt: row.live_at ?? undefined,
      source: row.source ?? undefined,
    };
  }
  return map;
}
