// Q40 leg (6) inc.19: the carrier that performs the write for 0027. Decides nothing.
//
// inc.18 shipped `planScanPickWrites` — what may be stored — and nothing ever sent
// a row anywhere. This file is the write half of the pair `scanPicksDb` already
// covers for reads: the only piece of the write path that knows Supabase exists,
// kept apart from the plan for the same CR-3 reason — what a paying customer gets
// pitched is decided in a tested pure module, never inside a PostgREST call.
//
// ONE STATEMENT, NEVER A LOOP. inc.18 made a submission all-or-nothing in the plan;
// a carrier that upserted row by row would hand that guarantee back at the door —
// row 3 failing after rows 1 and 2 landed is exactly the half-stored shortlist the
// plan exists to prevent. Every row of a submission goes in ONE upsert, so the
// database applies all of them or none.
//
// THE CONFLICT TARGET IS 0027's IDENTITY. Without `onConflict`, a re-imported scan
// appends the same automation again and the customer is shown their own shortlist
// with duplicates in it — while the extras push real picks past the slot count.
//
// A WITHDRAWN PICK IS NOT SILENTLY RESURRECTED, AND NOT SILENTLY IGNORED. The
// upsert does not carry `withdrawn_at`, so re-recording a withdrawn pick would
// leave it hidden — a human picks it, and the panel never shows it. Clearing the
// date instead would erase the fact that it was once taken back. So the carrier
// REPORTS which submitted picks are currently withdrawn (`fetchWithdrawnPickIds`)
// and reinstating is its own verb, the mirror of withdrawing.
//
// WITHDRAWING NEVER RE-DATES A WITHDRAWAL. The update is filtered to rows still
// live; a second withdrawal is a no-op rather than moving the date on which a
// recommendation was taken back.
//
// SERVICE ROLE, NEVER ANON — 0027 has RLS on with zero policies (see `scanPicksDb`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { SCAN_PICKS_TABLE, scanPicksClient } from "./scanPicksDb";
import type { ScanPickWriteRow } from "./scanPicksWrite";

/** 0027's `phase_scan_picks_identity`, as the columns PostgREST needs. */
export const SCAN_PICKS_CONFLICT = "customer_id,pick_id";

type PostgrestError = { message: string };

type WriteResult = { error: PostgrestError | null };

type SelectFilter = PromiseLike<{ data: unknown; error: PostgrestError | null }> & {
  eq(column: string, value: unknown): SelectFilter;
  in(column: string, values: readonly unknown[]): SelectFilter;
  not(column: string, op: string, value: unknown): SelectFilter;
};

type UpdateFilter = PromiseLike<WriteResult> & {
  eq(column: string, value: unknown): UpdateFilter;
  is(column: string, value: unknown): UpdateFilter;
};

/** The write slice of the client, narrow enough that no delete can be reached. */
export type ScanPicksWriteClient = {
  from(table: string): {
    select(columns: string): SelectFilter;
    upsert(rows: unknown, options?: { onConflict?: string }): PromiseLike<WriteResult>;
    update(patch: Record<string, unknown>): UpdateFilter;
  };
};

export interface ScanPicksWriteDb {
  /**
   * The pick ids among `pickIds` that this customer has WITHDRAWN.
   *
   * Exists so a caller cannot re-record a withdrawn pick and believe it is being
   * shown again. Throws on failure — an empty array would read as "none of these
   * were withdrawn", a claim about the customer's history on no evidence.
   */
  fetchWithdrawnPickIds(customerId: string, pickIds: readonly string[]): Promise<string[]>;

  /** One upsert for the whole submission. Throws on failure — nothing lands. */
  upsertPicks(rows: readonly ScanPickWriteRow[]): Promise<void>;

  /** Date a live pick as withdrawn. A pick already withdrawn keeps its own date. */
  withdrawPick(
    match: { customer_id: string; pick_id: string },
    patch: { withdrawn_at: string },
  ): Promise<void>;

  /** Put a withdrawn pick back on the shortlist. The only path that clears the date. */
  reinstatePick(match: { customer_id: string; pick_id: string }): Promise<void>;
}

function pickIdsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) =>
      row && typeof row === "object" ? String((row as Record<string, unknown>).pick_id ?? "") : "",
    )
    .filter((id) => id.length > 0);
}

/** Bind the writes to a real database. */
export function supabaseScanPicksWriteDb(client: ScanPicksWriteClient): ScanPicksWriteDb {
  return {
    async fetchWithdrawnPickIds(customerId, pickIds) {
      // No ids submitted means no question was asked. Sending an empty `in()`
      // would ask PostgREST for `pick_id=in.()` — a syntax error on a read whose
      // failure is meant to mean something.
      if (pickIds.length === 0) return [];
      const { data, error } = await client
        .from(SCAN_PICKS_TABLE)
        .select("pick_id")
        .eq("customer_id", customerId)
        .in("pick_id", [...pickIds])
        .not("withdrawn_at", "is", null);
      if (error) throw new Error(`${SCAN_PICKS_TABLE} withdrawn read: ${error.message}`);
      return pickIdsOf(data);
    },

    async upsertPicks(rows) {
      // A submission with no rows is already refused by `planScanPickWrites`;
      // reaching the database with it would be an empty statement that reports
      // success, which reads upstream as "the shortlist was stored".
      if (rows.length === 0) throw new Error(`${SCAN_PICKS_TABLE} upsert: no rows`);
      const { error } = await client
        .from(SCAN_PICKS_TABLE)
        .upsert([...rows], { onConflict: SCAN_PICKS_CONFLICT });
      if (error) throw new Error(`${SCAN_PICKS_TABLE} upsert: ${error.message}`);
    },

    async withdrawPick(match, patch) {
      const { error } = await client
        .from(SCAN_PICKS_TABLE)
        .update({ withdrawn_at: patch.withdrawn_at })
        .eq("customer_id", match.customer_id)
        .eq("pick_id", match.pick_id)
        .is("withdrawn_at", null);
      if (error) throw new Error(`${SCAN_PICKS_TABLE} withdraw: ${error.message}`);
    },

    async reinstatePick(match) {
      const { error } = await client
        .from(SCAN_PICKS_TABLE)
        .update({ withdrawn_at: null })
        .eq("customer_id", match.customer_id)
        .eq("pick_id", match.pick_id);
      if (error) throw new Error(`${SCAN_PICKS_TABLE} reinstate: ${error.message}`);
    },
  };
}

/** The `ScanPicksWriteDb` a route runs against in production. */
export function liveScanPicksWriteDb(): ScanPicksWriteDb {
  return supabaseScanPicksWriteDb(
    scanPicksClient() as unknown as SupabaseClient as unknown as ScanPicksWriteClient,
  );
}
