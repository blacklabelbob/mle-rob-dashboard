// Q63 leg (5) inc.5: the record page asks the database what Phase 2 actually
// returned — and can tell "we could not ask" apart from "nobody has measured".
//
// inc.1 decided what may be stored, inc.2 built the carrier, inc.3 the write door,
// inc.4 the freshest-wins selector. Every one of them takes rows from a caller, and
// no caller exists: `buildBlueprint({ phase2Returns })` is still a parameter nothing
// supplies, so every Phase 2 customer on prod reads AWAITING_DATA no matter what has
// been recorded about them. This module is what a page calls.
//
// THE GATE IS THE SERVICE KEY ALONE — the same call `phase2ReturnsReadable` makes,
// re-exported here so a page has one import. These measurements are recorded by a
// human, not by the partner webhook, so gating on `PHASE_SIGNAL_WEBHOOK_SECRET`
// (as `loadComponentLive` must) would hide a reading somebody deliberately took
// behind an unrelated seam.
//
// "COULD NOT READ" IS NOT "NOT MEASURED YET", and on this leg the difference is a
// money promise. `phase2Guarantee` with no returns prints AWAITING_DATA — a factual
// claim, to a paying customer, that nobody has measured their Phase 2. Make that
// the answer to a failed query and the dashboard states as fact something we have
// no evidence for. So a failure is returned as `unavailable`, never as an empty
// selection, and the surface increment that follows is REQUIRED to render the two
// differently before this reaches a screen.
//
// NEVER THROWS. This runs in the server component that also renders the company's
// deal, money, timeline and people; a 0029 outage must not 500 all of it.

import {
  livePhase2ReturnsDb,
  phase2ReturnsReadable,
  type Phase2ReturnsDb,
} from "./phase2ReturnsDb";
import { selectPhase2Returns, type Phase2ReturnsSelection } from "./phase2ReturnsSelect";

export { phase2ReturnsReadable };

export interface Phase2ReturnsLoadResult {
  /** The freshest-wins decision, verbatim from `selectPhase2Returns`. */
  selection: Phase2ReturnsSelection;
  /** True only when we tried to ask and could not — never for "armed but no rows". */
  unavailable: boolean;
}

export interface Phase2ReturnsLoadDeps {
  enabled?: boolean;
  db?: () => Phase2ReturnsDb;
  onError?: (e: unknown) => void;
}

/**
 * An empty selection, built by the real selector rather than hand-written.
 *
 * Hand-writing the shape here would let it drift from `Phase2ReturnsSelection` the
 * next time the selector grows a field — and the not-armed and read-failed paths
 * would start disagreeing with the found-nothing path about what "nothing" looks
 * like. Feeding the selector `[]` costs nothing and cannot drift.
 */
function emptySelection(): Phase2ReturnsSelection {
  return selectPhase2Returns([]);
}

/**
 * One customer's measured Phase 2 returns, ready for
 * `buildBlueprint({ phase2Returns: result.selection.returns })`.
 *
 * An empty `customerId` short-circuits before the query: a filter on `""` can only
 * match nothing, and it would run on every render of an unsaved record.
 *
 * NOT ARMED IS NOT UNAVAILABLE. With no service key there is no store to fail, so
 * `unavailable` stays false and a local dev without Supabase reads as "not measured
 * yet" — which is the truth there — rather than raising an alarm on every board.
 *
 * The customer id is passed to the selector as well as to the query. The query
 * already filters by it; the selector's check is what catches a store that answers
 * with somebody else's rows, and one customer's returns computing another's money
 * guarantee is the worst outcome this leg has.
 */
export async function loadPhase2Returns(
  customerId: string,
  deps: Phase2ReturnsLoadDeps = {},
): Promise<Phase2ReturnsLoadResult> {
  const enabled = deps.enabled ?? phase2ReturnsReadable();
  const id = customerId.trim();
  if (!enabled || !id) return { selection: emptySelection(), unavailable: false };

  try {
    const db = (deps.db ?? livePhase2ReturnsDb)();
    const rows = await db.fetchCustomerReturns(id);
    return { selection: selectPhase2Returns(rows, { customerId: id }), unavailable: false };
  } catch (e) {
    // Logged, not silent: `unavailable` tells the customer's screen; this tells
    // whoever reads prod logs WHICH customer's returns could not be loaded.
    (deps.onError ?? ((err) => console.error(`phase2 returns read (${id}):`, err)))(e);
    return { selection: emptySelection(), unavailable: true };
  }
}
