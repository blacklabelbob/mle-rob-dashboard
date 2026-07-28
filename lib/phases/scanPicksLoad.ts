// Q40 leg (6) inc.17: the record page asks the database for the shortlist — and
// can say so when the database does not answer.
//
// inc.14 decided WHEN to recommend, inc.15 put it on screen, inc.16 built the
// store and the ordering. All three take `recommendations` as a parameter nothing
// supplied, so every company on prod reads SCAN_NO_PICKS regardless of what has
// been recorded. This module is what a page calls.
//
// THE ARMING GATE IS NOT THE SIGNAL SECRET, and the difference matters.
// `loadComponentLive` gates on `PHASE_SIGNAL_WEBHOOK_SECRET` because 0025 is
// unapplied and only the partner webhook can write it. 0027 IS APPLIED on prod and
// its rows are recorded by a HUMAN, not by a partner — gating this read on the
// webhook secret would keep a shortlist somebody deliberately recorded invisible
// until an unrelated seam was armed. The gate is the service key alone: without
// it, `scanPicksClient()` throws, and there is genuinely nothing to read.
//
// "COULD NOT READ" IS NOT "NOTHING PICKED". Those two collapse into one empty
// array the moment a read failure is caught and forgotten, and the panel's copy
// for empty is *"your automation shortlist hasn't been picked yet"* — a factual
// claim, printed to a paying customer, on evidence we do not have. So the failure
// is returned as `unavailable` and `aimForNext` has a state for it.

import { scanPicksFromRows, type ScanPicksResult, type SkippedScanPick } from "./scanPicksRow";
import { liveScanPicksDb, type ScanPicksDb } from "./scanPicksDb";
import type { AutomationPick } from "./aimForNext";

export interface ScanPicksLoadResult extends ScanPicksResult {
  /** True only when we tried to ask and could not — never for "armed but no rows". */
  unavailable: boolean;
}

export interface ScanPicksDeps {
  enabled?: boolean;
  db?: () => ScanPicksDb;
  onError?: (e: unknown) => void;
}

const EMPTY: { picks: AutomationPick[]; withdrawn: number; skipped: SkippedScanPick[] } = {
  picks: [],
  withdrawn: 0,
  skipped: [],
};

/** Is there a database to read picks out of at all? */
export function scanPicksReadable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * One customer's recorded shortlist, ready for `buildBlueprint({ automationPicks })`.
 *
 * NEVER THROWS. This runs in a server component that also renders the company's
 * deal, money and timeline; a picks-table outage must not 500 the page they live
 * on. The failure is reported through `unavailable` instead.
 *
 * An empty `customerId` short-circuits before the query: a filter on `""` can only
 * ever match nothing, and it would run on every render of an unsaved record.
 *
 * NOT ARMED IS NOT UNAVAILABLE. With no service key there is no store to fail —
 * `unavailable` stays false so a local dev without Supabase reads as "no picks",
 * which is the truth there, rather than raising an alarm on every board.
 */
export async function loadScanPicks(
  customerId: string,
  deps: ScanPicksDeps = {},
): Promise<ScanPicksLoadResult> {
  const enabled = deps.enabled ?? scanPicksReadable();
  if (!enabled || !customerId.trim()) return { ...EMPTY, unavailable: false };

  try {
    const db = (deps.db ?? liveScanPicksDb)();
    const rows = await db.fetchCustomerPicks(customerId.trim());
    return { ...scanPicksFromRows(rows), unavailable: false };
  } catch (e) {
    // Logged, not silent: `unavailable` tells the customer's screen; this tells
    // whoever reads prod logs WHICH customer's shortlist could not be loaded.
    (deps.onError ?? ((err) => console.error(`scan picks read (${customerId}):`, err)))(e);
    return { ...EMPTY, unavailable: true };
  }
}
