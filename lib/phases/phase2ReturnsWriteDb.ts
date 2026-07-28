// Q63 leg (5) inc.3: the carrier that performs the write for 0029. Decides nothing.
//
// inc.1 shipped `planPhase2ReturnsWrite` — what may be stored. inc.2 shipped 0029
// and the read carrier — where it lives and how it comes back. Nothing has ever
// SENT a measurement anywhere. This file is the write half of the pair
// `phase2ReturnsDb` already covers for reads: the only piece of the write path that
// knows Supabase exists, kept apart from the judgement for the same CR-3 reason —
// whether a paying customer's ROI guarantee reads SURPLUS, SHORTFALL or
// AWAITING_DATA is decided in a tested pure module, never inside a PostgREST call.
//
// THE CONFLICT TARGET IS 0029's IDENTITY, `(customer_id, measured_at)`. Without
// `onConflict`, a CORRECTION APPENDS — a restated payroll figure or a fixed wage
// leaves two rows claiming the same instant with different numbers, and the
// freshest-wins read then has no way to choose between them. What the customer sees
// is a guarantee status that flips between page loads with nobody having edited
// anything. This is the single line the whole table was shaped around.
//
// ONE STATEMENT, NEVER A LOOP. An import of three months goes in ONE upsert, so
// Postgres applies all of them or none: month 3 failing after months 1 and 2 landed
// is a customer whose ROI is computed from a partial history that nobody can see is
// partial.
//
// A SUPERSEDED MEASUREMENT IS NOT SILENTLY RESURRECTED, AND NOT SILENTLY IGNORED.
// The upsert does not carry `superseded_at`, so re-recording a retracted reading
// would leave it hidden — a human enters a measurement and the guarantee never
// reflects it. Clearing the date instead would erase the fact that it was ever taken
// back. So the carrier REPORTS which of the submitted instants are currently
// superseded (`fetchSupersededMeasuredAt`), and reinstating is its own verb — the
// mirror of retracting. Same rule as `scanPicksWriteDb`, for the same reason.
//
// RETRACTING NEVER RE-DATES A RETRACTION. The update is filtered to rows still live,
// so a second retraction is a no-op rather than moving the date on which a figure
// under a money guarantee was taken back.
//
// NOTHING HERE DELETES. A bad reading is retired by date, never removed — the record
// that a measurement was taken survives being wrong about it.
//
// SERVICE ROLE, NEVER ANON — 0029 has RLS on with zero policies (see
// `phase2ReturnsDb`). Under the anon key every write here is refused and every read
// comes back empty.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PHASE2_RETURNS_TABLE, phase2ReturnsClient } from "./phase2ReturnsDb";
import type { Phase2ReturnsWriteRow } from "./phase2ReturnsWrite";

/** 0029's `phase2_returns_identity`, as the columns PostgREST needs. */
export const PHASE2_RETURNS_CONFLICT = "customer_id,measured_at";

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
export type Phase2ReturnsWriteClient = {
  from(table: string): {
    select(columns: string): SelectFilter;
    upsert(rows: unknown, options?: { onConflict?: string }): PromiseLike<WriteResult>;
    update(patch: Record<string, unknown>): UpdateFilter;
  };
};

export interface Phase2ReturnsWriteDb {
  /**
   * The instants among `measuredAts` this customer has a SUPERSEDED measurement for.
   *
   * Exists so a caller cannot re-record a retracted measurement and believe it is
   * back in play. Throws on failure — an empty array would read as "none of these
   * were retracted", a claim about a customer's measurement history on no evidence,
   * under the guarantee that decides whether Rob owes them money.
   */
  fetchSupersededMeasuredAt(
    customerId: string,
    measuredAts: readonly string[],
  ): Promise<string[]>;

  /** One upsert for the whole submission. Throws on failure — nothing lands. */
  upsertMeasurements(rows: readonly Phase2ReturnsWriteRow[]): Promise<void>;

  /** Date a live measurement as superseded. One already retracted keeps its date. */
  supersedeMeasurement(
    match: { customer_id: string; measured_at: string },
    patch: { superseded_at: string },
  ): Promise<void>;

  /** Put a retracted measurement back in play. The only path that clears the date. */
  reinstateMeasurement(match: { customer_id: string; measured_at: string }): Promise<void>;
}

function measuredAtsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) =>
      row && typeof row === "object"
        ? String((row as Record<string, unknown>).measured_at ?? "")
        : "",
    )
    .filter((at) => at.length > 0);
}

/** Bind the writes to a real database. */
export function supabasePhase2ReturnsWriteDb(
  client: Phase2ReturnsWriteClient,
): Phase2ReturnsWriteDb {
  return {
    async fetchSupersededMeasuredAt(customerId, measuredAts) {
      // No instants submitted means no question was asked. Sending an empty `in()`
      // would ask PostgREST for `measured_at=in.()` — a syntax error on a read whose
      // failure is meant to mean something.
      if (measuredAts.length === 0) return [];
      const { data, error } = await client
        .from(PHASE2_RETURNS_TABLE)
        .select("measured_at")
        .eq("customer_id", customerId)
        .in("measured_at", [...measuredAts])
        .not("superseded_at", "is", null);
      if (error) {
        throw new Error(`${PHASE2_RETURNS_TABLE} superseded read: ${error.message}`);
      }
      return measuredAtsOf(data);
    },

    async upsertMeasurements(rows) {
      // A submission with no rows is already refused by `planPhase2ReturnsWrite`;
      // reaching the database with it would be an empty statement that reports
      // success, which reads upstream as "the measurement was stored".
      if (rows.length === 0) throw new Error(`${PHASE2_RETURNS_TABLE} upsert: no rows`);
      const { error } = await client
        .from(PHASE2_RETURNS_TABLE)
        .upsert([...rows], { onConflict: PHASE2_RETURNS_CONFLICT });
      if (error) throw new Error(`${PHASE2_RETURNS_TABLE} upsert: ${error.message}`);
    },

    async supersedeMeasurement(match, patch) {
      const { error } = await client
        .from(PHASE2_RETURNS_TABLE)
        .update({ superseded_at: patch.superseded_at })
        .eq("customer_id", match.customer_id)
        .eq("measured_at", match.measured_at)
        .is("superseded_at", null);
      if (error) throw new Error(`${PHASE2_RETURNS_TABLE} supersede: ${error.message}`);
    },

    async reinstateMeasurement(match) {
      const { error } = await client
        .from(PHASE2_RETURNS_TABLE)
        .update({ superseded_at: null })
        .eq("customer_id", match.customer_id)
        .eq("measured_at", match.measured_at);
      if (error) throw new Error(`${PHASE2_RETURNS_TABLE} reinstate: ${error.message}`);
    },
  };
}

/** The `Phase2ReturnsWriteDb` a route runs against in production. */
export function livePhase2ReturnsWriteDb(): Phase2ReturnsWriteDb {
  return supabasePhase2ReturnsWriteDb(
    phase2ReturnsClient() as unknown as SupabaseClient as unknown as Phase2ReturnsWriteClient,
  );
}
