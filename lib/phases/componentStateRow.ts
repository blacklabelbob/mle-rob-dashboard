// Q40 leg (4) inc.2: what an APPLIED signal does to the stored row. Pure.
//
// inc.1 decided whether a signal applies. It stopped one step short of the thing
// that can be wrong invisibly for months: what gets WRITTEN. This module is that
// step — row in, row out, no clock, no network, no Supabase (CR-3). The database
// carrier and the route come after it and decide nothing.
//
// WHY THIS IS ITS OWN SEAM RATHER THAN THREE LINES IN THE ROUTE: two of the four
// columns here are load-bearing on a promise made to a paying customer.
// `ever_live_at` is the refund clock's origin and `seen_event_ids` is the only
// thing standing between a partner's retry loop and a component that re-lights
// forever. Both are get-it-right-once fields whose failures are silent, and a
// route handler is exactly where such a line gets "simplified" later by someone
// reading HTTP, not refunds.

import type { SignalApplied } from "./signalIntake";
import type { PhaseNo } from "./components";

/**
 * How many applied eventIds a row remembers.
 *
 * A cap is required — the array grows forever otherwise, on a row read on every
 * signal. It is SAFE because it is not the only defence: a replay carries its
 * ORIGINAL `occurredAt`, and inc.1 refuses anything at or before `lastSignalAt`
 * as `stale` / `ambiguous_timestamp`. So an eventId old enough to have fallen off
 * this list is, by construction, old enough that the ordering check refuses it
 * anyway. The list is the fast path for recent replays; the timestamp is the
 * backstop for ancient ones. Pinned by test.
 */
export const SEEN_EVENT_CAP = 200;

/** One row of `phase_component_state` (0025), in the shape Postgres holds it. */
export interface PhaseComponentRow {
  customer_id: string;
  phase: PhaseNo;
  component_id: string;
  live_at: string | null;
  ever_live_at: string | null;
  last_signal_at: string | null;
  seen_event_ids: string[];
  source: string | null;
}

/** The columns a write touches. Identity columns are the conflict target, not a patch. */
export type PhaseComponentPatch = Pick<
  PhaseComponentRow,
  "customer_id" | "phase" | "component_id" | "live_at" | "ever_live_at" | "last_signal_at" | "seen_event_ids" | "source"
>;

function trimmed(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}

/**
 * A stored row → the context inc.1's decider reads.
 *
 * Absent row is a legitimate answer (nothing has ever happened to this
 * component), so it maps to an empty state rather than throwing — but the
 * caller, not this function, is responsible for telling "no row" apart from
 * "read failed". A swallowed read error here would present as a virgin
 * component and re-light one that is already lit.
 */
export function storedFromRow(row: PhaseComponentRow | null | undefined) {
  return {
    liveAt: trimmed(row?.live_at),
    everLiveAt: trimmed(row?.ever_live_at),
    lastSignalAt: trimmed(row?.last_signal_at),
    seenEventIds: row?.seen_event_ids ?? [],
  };
}

/**
 * The exact row to write for an applied decision.
 *
 * `current` is the row the decision was made against — passing a NEWER read here
 * would decide against one state and write against another.
 */
export function rowPatch(
  decision: SignalApplied,
  current: PhaseComponentRow | null | undefined,
): PhaseComponentPatch {
  const prior = storedFromRow(current);

  // `ever_live_at` is WRITE-ONCE. Never cleared by a revert (that is `live_at`'s
  // job) and never overwritten by a re-light: moving it would slide the origin of
  // a refund window a customer already earned to a later date, shortening their
  // rights, and nothing on any screen would show it moved. The first lighting
  // instant is the promise; it outlives the light.
  const everLiveAt = prior.everLiveAt ?? (decision.liveAt ? decision.liveAt : null);

  // Newest last — `seenEventIds` is read as a membership set by the decider, but
  // the CAP needs an order, and "drop the oldest" is only correct if the order is
  // arrival. Trimming from the front keeps the recent ones, which are the replays
  // that actually arrive.
  const seen = prior.seenEventIds.includes(decision.eventId)
    ? [...prior.seenEventIds]
    : [...prior.seenEventIds, decision.eventId];

  return {
    customer_id: decision.customerId,
    phase: decision.phase,
    component_id: decision.componentId,
    // Written verbatim from the decision, INCLUDING null: a revert clears the
    // light, and `?? current` here would make a revert a no-op that answers
    // `applied` — the worst of both, a lie in the response and a stale light.
    live_at: decision.liveAt,
    ever_live_at: everLiveAt,
    // Always the sender's instant, never receipt time: this is the ordering
    // baseline every later signal is compared against, so a clock of ours in
    // this column would start refusing the partner's own correctly-ordered
    // events as `stale`.
    last_signal_at: decision.occurredAt,
    seen_event_ids: seen.slice(-SEEN_EVENT_CAP),
    source: decision.source,
  };
}
