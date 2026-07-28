// Q40 leg (4) inc.3: the database carrier for 0025. Decides nothing.
//
// inc.1 decided WHETHER a signal applies, inc.2 decided WHAT the applied row looks
// like. This file is the only one in the phase-signal path that knows Supabase
// exists: read the current row for an identity triple, write the patch back. Both
// halves are injected so the strings that matter can be asserted without Postgres
// in the room (same idiom as `lib/calls/transcriptDb.ts`).
//
// THE CONFLICT TARGET IS THE WHOLE POINT. PostgREST's `upsert()` with no
// `onConflict` resolves against the PRIMARY KEY, and 0025 keys on a
// `gen_random_uuid()` id we never send — so a default upsert is an INSERT, and the
// partner's retry (they re-POST; that is why inc.1 has an idempotency memory at
// all) hits `phase_component_state_identity` and comes back 23505. Naming the
// triple is the difference between "a retry updates the light" and "a retry 500s
// forever while the component stays dark". Pinned by test against 0025's columns.
//
// A MISSING ROW AND A FAILED READ ARE NOT THE SAME ANSWER, and this is the one
// place they can be confused. `storedFromRow(null)` is a legitimate virgin
// component; a swallowed read error produces the SAME empty state, which would
// re-light an already-lit component and — through `ever_live_at` — restate when a
// paying customer's 30-day refund window began. So the read returns `null` only
// for a genuinely absent row and throws on everything else.
//
// SERVICE ROLE, NEVER ANON. 0025 has RLS on with zero policies on a prod that is
// unauthenticated by Rob's 7/21 call. Under the anon key every write here affects
// zero rows and every read comes back empty — indistinguishable from "no signals
// yet". The client is built from the service key or not at all.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { PhaseComponentPatch, PhaseComponentRow } from "./componentStateRow";
import type { PhaseNo } from "./components";

/** 0025's table and its unique index, as columns. These strings ARE the idempotence guarantee. */
export const PHASE_COMPONENT_TABLE = "phase_component_state";
export const PHASE_COMPONENT_CONFLICT = "customer_id,phase,component_id";

/**
 * The columns a read asks for.
 *
 * Listed explicitly rather than `*`: `storedFromRow` reads four of them and a
 * `select("*")` would quietly start shipping `seen_event_ids` growth plus every
 * column a later migration adds, on a query that runs on every inbound signal.
 */
export const PHASE_COMPONENT_READ_COLUMNS =
  "customer_id,phase,component_id,live_at,ever_live_at,last_signal_at,seen_event_ids,source";

type PostgrestError = { message: string };

/** The read slice of the client, narrow so the write path can't reach a `select` by accident. */
export type PhaseComponentClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: unknown,
      ): {
        eq(
          column: string,
          value: unknown,
        ): {
          eq(
            column: string,
            value: unknown,
          ): { maybeSingle(): Promise<{ data: unknown; error: PostgrestError | null }> };
        };
      };
    };
    upsert(
      rows: unknown,
      options?: { onConflict?: string },
    ): PromiseLike<{ error: PostgrestError | null }>;
  };
};

/** What the route needs from a database, so the route itself can be tested without one. */
export interface PhaseComponentDb {
  /** The row for one identity triple, or `null` if the component has never been signalled. */
  fetchState(
    customerId: string,
    phase: PhaseNo,
    componentId: string,
  ): Promise<PhaseComponentRow | null>;
  /** Upsert inc.2's patch against the identity triple. */
  writeState(patch: PhaseComponentPatch, updatedAt: string): Promise<void>;
}

function asRow(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * A PostgREST row → the shape inc.2 works in.
 *
 * `seen_event_ids` is coerced to an array of strings rather than trusted: it is
 * the idempotency memory, and a `null` from a row written before the column had a
 * default would otherwise throw inside `rowPatch` — turning a replay into a 500
 * and then, because the partner retries a 500, into an infinite one.
 */
export function toComponentRow(raw: unknown): PhaseComponentRow | null {
  const row = asRow(raw);
  if (!row) return null;
  const phase = Number(row.phase);
  return {
    customer_id: String(row.customer_id ?? ""),
    phase: (phase === 1 || phase === 2 || phase === 3 ? phase : 1) as PhaseNo,
    component_id: String(row.component_id ?? ""),
    live_at: str(row.live_at),
    ever_live_at: str(row.ever_live_at),
    last_signal_at: str(row.last_signal_at),
    seen_event_ids: Array.isArray(row.seen_event_ids)
      ? row.seen_event_ids.filter((v): v is string => typeof v === "string")
      : [],
    source: str(row.source),
  };
}

/**
 * Bind the read + write path to a real database.
 *
 * `updatedAt` is a PARAMETER, not `new Date()` in here: 0025's `updated_at`
 * defaults on insert only, so an upsert that UPDATES leaves it frozen at the
 * row's creation date, and a component signalled forty times would read as
 * untouched since the day it was created. It is receipt time and is deliberately
 * NOT `last_signal_at` — that column is the sender's `occurredAt` and is the
 * ordering baseline every later signal is compared against (inc.2); collapsing
 * the two would start refusing the partner's correctly-ordered events as stale.
 */
export function supabasePhaseComponentDb(client: PhaseComponentClient): PhaseComponentDb {
  return {
    async fetchState(customerId, phase, componentId) {
      const { data, error } = await client
        .from(PHASE_COMPONENT_TABLE)
        .select(PHASE_COMPONENT_READ_COLUMNS)
        .eq("customer_id", customerId)
        .eq("phase", phase)
        .eq("component_id", componentId)
        .maybeSingle();
      // A missing row is `data: null` with no error — a real answer. Only a
      // genuine failure throws, so "the query broke" can never be decided against
      // as "this component has never been lit".
      if (error) throw new Error(`${PHASE_COMPONENT_TABLE} read: ${error.message}`);
      return toComponentRow(data);
    },

    async writeState(patch, updatedAt) {
      const { error } = await client
        .from(PHASE_COMPONENT_TABLE)
        .upsert({ ...patch, updated_at: updatedAt }, { onConflict: PHASE_COMPONENT_CONFLICT });
      if (error) throw new Error(`${PHASE_COMPONENT_TABLE} upsert: ${error.message}`);
    },
  };
}

let client: SupabaseClient | null = null;

/** Service-role client for 0025. Server-side only — same idiom as `transcriptClient`. */
export function phaseComponentClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("phase signals: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** The `PhaseComponentDb` the webhook runs against in production. */
export function livePhaseComponentDb(): PhaseComponentDb {
  return supabasePhaseComponentDb(phaseComponentClient() as unknown as PhaseComponentClient);
}
