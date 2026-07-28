// Q40 leg (4) inc.6: the last joint — the board asks the database, and can say
// so when the database does not answer.
//
// inc.5 turned stored rows into a `ComponentLiveMap`, but nothing ever fetched
// those rows: `buildBlueprint({ components: company.phaseComponents })` reads a
// field no code path writes, so a landed signal still lit nothing. This module is
// what a page calls. It is deliberately the only piece of the seam that is
// allowed to be uncertain, and its whole job is to keep three different states
// from rendering as the same dark board:
//
//   • OFF        — the seam is not armed (no secret, no service key). No signal
//                  can exist yet, so an empty map is the TRUTH, not a gap.
//   • OK         — we asked and these are the rows.
//   • UNAVAILABLE— we asked and could not get an answer. Some component may be
//                  live and showing dark, which on this board is a claim to a
//                  paying customer that work they paid for has not been done.
//
// `unavailable` exists because those three collapse into "map is empty" the
// moment you let a read failure be caught and forgotten. The page renders a
// visible strip for it; a swallowed error would be an invisible lie.
//
// WHY THE ARMING SWITCH GATES THE READ. 0025 is committed but NOT applied, and
// `fetchCustomerRows` correctly throws when the table is missing. Reading
// unconditionally would therefore put an "unavailable" strip on EVERY company
// board in production today — an alarm about a feature nobody has turned on. The
// secret is the one flag that flips when the seam goes live (it is what makes the
// webhook stop answering 503), so it is what flips the read on too.

import type { ComponentLiveMap } from "./blueprint";
import { liveMapFromRows } from "./componentLiveMap";
import { livePhaseComponentDb, type PhaseComponentDb } from "./componentStateDb";

export interface ComponentLiveResult {
  /** What the blueprint should render. Empty when off, or when the read failed. */
  map: ComponentLiveMap;
  /** True only when we tried to ask and could not — never for "armed but no rows". */
  unavailable: boolean;
}

/**
 * Is the signal seam armed AND readable?
 *
 * All three are required and each for its own reason: the secret is the arming
 * switch (see the header note), and the service URL/key are what
 * `phaseComponentClient` throws without — building the client to discover that
 * would turn a config gap into an "unavailable" strip rather than an honest off.
 */
export function phaseSignalsReadable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.PHASE_SIGNAL_WEBHOOK_SECRET && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * The record's stored map, overlaid with what the partner's tools have signalled.
 *
 * PER-SLUG REPLACEMENT, NOT A TRUTHY MERGE. A signalled row wins outright for its
 * slug — including a row that has been REVERTED (`liveAt` absent). The tempting
 * version ("keep whichever one is live") would make a revert impossible to see:
 * a component lit by a stale fixture value would stay lit forever after the
 * partner told us it went back down, and the one thing the board's dark lights
 * are for is being believable.
 *
 * Slugs the signals do not mention keep the record's entry, so demo boards and
 * anything Rob has set by hand survive a customer whose partner has signalled a
 * single component.
 */
export function mergeComponentLive(
  record: ComponentLiveMap | undefined,
  signals: ComponentLiveMap,
): ComponentLiveMap {
  return { ...(record ?? {}), ...signals };
}

export interface ComponentLiveDeps {
  enabled?: boolean;
  db?: () => PhaseComponentDb;
  onError?: (e: unknown) => void;
}

/**
 * Every signalled component for one customer, ready for `buildBlueprint`.
 *
 * NEVER THROWS. This is called from a server component, and the phase tracker is
 * one block on a record page that also carries the deal, the money and the
 * timeline — a signal-seam outage must not 500 the page those live on. The
 * failure is reported through `unavailable` instead, which is a thing the page
 * can render next to the lights it could not verify.
 *
 * An empty `customerId` short-circuits: `fetchCustomerRows("")` is a query that
 * can only ever match nothing, run on every render of an unsaved record.
 */
export async function loadComponentLive(
  customerId: string,
  deps: ComponentLiveDeps = {},
): Promise<ComponentLiveResult> {
  const enabled = deps.enabled ?? phaseSignalsReadable();
  if (!enabled || !customerId.trim()) return { map: {}, unavailable: false };

  try {
    const db = (deps.db ?? livePhaseComponentDb)();
    const rows = await db.fetchCustomerRows(customerId.trim());
    return { map: liveMapFromRows(rows), unavailable: false };
  } catch (e) {
    // Logged, not silent: `unavailable` tells the customer's screen, this tells
    // whoever is reading prod logs which customer's board was degraded.
    (deps.onError ?? ((err) => console.error(`phase signals read (${customerId}):`, err)))(e);
    return { map: {}, unavailable: true };
  }
}
