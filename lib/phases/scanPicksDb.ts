// Q40 leg (6) inc.17: the database carrier for 0027. Decides nothing.
//
// inc.16 shipped `scanPicksFromRows` — the ordering, the withdrawn filter, the
// skip accounting — and nothing ever fetched a row for it to work on. This file is
// the only piece of the picks path that knows Supabase exists, and it is separate
// from the loader for the same reason `componentStateDb` is separate from
// `componentLiveLoad` (CR-3): what a paying customer is pitched is decided in a
// pure module with tests on it, never inside a query whose row order is whatever
// Postgres happened to return.
//
// THE READ DOES NOT FILTER AND DOES NOT ORDER, and both are deliberate:
//
//   • NO `withdrawn_at is null` FILTER. `scanPicksFromRows` COUNTS withdrawn rows
//     ("retired is not broken") and filtering them out in SQL would make that
//     count permanently zero — a taken-back recommendation would become
//     indistinguishable from one that was never made.
//
//   • NO `.order()`. The sort is total in the pure module (rank → recorded_at →
//     pick_id). Ordering here as well would create a SECOND ordering authority
//     that can silently disagree with the tested one, and the shortlist order IS
//     the pitch.
//
// COLUMNS LISTED, NEVER `*`: `ScanPickRow` reads nine of them, and a `select("*")`
// would start shipping every column a later migration adds on a query that runs on
// each render of a company record.
//
// SERVICE ROLE, NEVER ANON. 0027 has RLS on with zero policies on a prod that is
// unauthenticated by Rob's 7/21 call. Under the anon key every read here comes
// back empty — which the panel would render as "your shortlist hasn't been picked
// yet". The client is built from the service key or not at all.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ScanPickRow } from "./scanPicksRow";

/** 0027's table, as a string the loader and its tests share. */
export const SCAN_PICKS_TABLE = "phase_scan_picks";

/** Exactly the columns `ScanPickRow` carries. */
export const SCAN_PICKS_READ_COLUMNS =
  "customer_id,pick_id,label,why,rank,recorded_by,recorded_at,withdrawn_at,source";

type PostgrestError = { message: string };

type ScanPicksResponse = { data: unknown; error: PostgrestError | null };

type ScanPicksFilter = PromiseLike<ScanPicksResponse> & {
  eq(column: string, value: unknown): ScanPicksFilter;
};

/** The read slice of the client — narrow, so no write can be reached from here. */
export type ScanPicksClient = {
  from(table: string): { select(columns: string): ScanPicksFilter };
};

/** What the loader needs from a database, so the loader can be tested without one. */
export interface ScanPicksDb {
  /**
   * Every stored pick for one customer, withdrawn ones included.
   *
   * Throws on failure. An empty array and a broken query would otherwise render
   * identically — as "nobody has picked this customer's automations yet", which is
   * a statement to a paying customer about work we may in fact have done.
   */
  fetchCustomerPicks(customerId: string): Promise<ScanPickRow[]>;
}

function asRow(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * A PostgREST row → the shape inc.16 works in.
 *
 * `rank` is coerced rather than trusted: a non-numeric value would sort as `NaN`,
 * and every comparison against `NaN` is false — which does not push that pick to
 * the end, it makes the whole sort's result depend on the array's starting order.
 * Unreadable ranks become `null`, which inc.16 sorts as 0 (recorded order), the
 * documented behaviour for a rank nobody set.
 *
 * A row with no `pick_id` is NOT dropped here: inc.16 reports it as a skip, and
 * dropping it in the carrier would shorten a customer's shortlist invisibly — the
 * exact failure the skip accounting exists to prevent.
 */
export function toScanPickRow(raw: unknown): ScanPickRow | null {
  const row = asRow(raw);
  if (!row) return null;
  // `Number(null)` is 0, so a bare `Number()` would turn a NULL rank into a rank
  // somebody set. It sorts identically (inc.16 reads a missing rank as 0) but it
  // is a different FACT, and `rank` is the column a writer will later read back to
  // decide whether this pick has ever been ordered.
  const rank = row.rank === null || row.rank === undefined ? NaN : Number(row.rank);
  return {
    customer_id: String(row.customer_id ?? ""),
    pick_id: String(row.pick_id ?? ""),
    label: String(row.label ?? ""),
    why: str(row.why),
    rank: Number.isFinite(rank) ? rank : null,
    recorded_by: str(row.recorded_by),
    recorded_at: str(row.recorded_at),
    withdrawn_at: str(row.withdrawn_at),
    source: str(row.source),
  };
}

/** Bind the read to a real database. */
export function supabaseScanPicksDb(client: ScanPicksClient): ScanPicksDb {
  return {
    async fetchCustomerPicks(customerId) {
      const { data, error } = await client
        .from(SCAN_PICKS_TABLE)
        .select(SCAN_PICKS_READ_COLUMNS)
        .eq("customer_id", customerId);
      if (error) throw new Error(`${SCAN_PICKS_TABLE} read: ${error.message}`);
      return Array.isArray(data)
        ? data.map(toScanPickRow).filter((r): r is ScanPickRow => r !== null)
        : [];
    },
  };
}

let client: SupabaseClient | null = null;

/** Service-role client for 0027. Server-side only — same idiom as `phaseComponentClient`. */
export function scanPicksClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("scan picks: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** The `ScanPicksDb` the record pages run against in production. */
export function liveScanPicksDb(): ScanPicksDb {
  return supabaseScanPicksDb(scanPicksClient() as unknown as ScanPicksClient);
}
