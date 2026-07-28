// Q63 leg (5) inc.2: the database carrier for 0029. Decides nothing.
//
// inc.1 shipped `planPhase2ReturnsWrite` — what may be stored — and there was
// nowhere to store it and nothing to read back. This file is the only piece of the
// measured-returns path that knows Supabase exists, kept apart from the judgement
// for the same CR-3 reason `scanPicksDb` is kept apart from `scanPicksWrite`:
// whether a paying customer's ROI guarantee reads SURPLUS, SHORTFALL or
// AWAITING_DATA is decided in a tested pure module, never inside a PostgREST call
// whose row order is whatever Postgres happened to return.
//
// THE READ DOES NOT ORDER AND DOES NOT FILTER, and both are deliberate:
//
//   • NO `.order()`. Freshest-wins is a DECISION about which measurement a
//     customer's guarantee is computed from. Ordering here as well would create a
//     second ordering authority that can silently disagree with the tested one —
//     and the row that wins IS the number on the page.
//
//   • NO `superseded_at is null` FILTER. A retracted reading is a fact with a
//     date; filtering it out in SQL makes "this measurement was retracted"
//     indistinguishable from "this measurement never happened", which is exactly
//     the collapse `phase2Guarantee` exists to prevent at the other end.
//
// COLUMNS LISTED, NEVER `*` — the row type reads ten of them, and a `select("*")`
// would start shipping every column a later migration adds on a query that runs on
// each render of a company record.
//
// NUMBERS ARE COERCED, NEVER TRUSTED, AND NEVER DEFAULTED TO ZERO. `Number(null)`
// is 0, and 0 hours saved is a REAL measurement the engine reads as a total
// shortfall — so an unreadable column that became 0 here would render as a
// customer who saved nothing, under a guarantee that says Rob owes them. Anything
// unreadable becomes `null` and the pure layer refuses the row instead.
//
// SERVICE ROLE, NEVER ANON. 0029 has RLS on with zero policies on a prod that is
// unauthenticated by Rob's 7/21 call. Under the anon key every read here comes back
// empty — which renders as "not measured yet" about a customer we may in fact have
// measured. The client is built from the service key or not at all.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { RevenueBasis } from "./phase2ReturnsWrite";

/** 0029's table, as a string the loader and its tests share. */
export const PHASE2_RETURNS_TABLE = "phase2_returns";

/** Exactly the columns `Phase2ReturnsRow` carries. */
export const PHASE2_RETURNS_READ_COLUMNS =
  "customer_id,labor_hours_saved,labor_cost_per_hour,revenue_since_phase2_start," +
  "revenue_basis,measured_at,measured_by,source,note,superseded_at";

/**
 * One stored measurement as it comes off 0029.
 *
 * Deliberately WIDER than `Phase2ReturnsWriteRow`: the numbers are nullable here
 * because a column that cannot be read is not a zero, and `revenue_basis` is a
 * bare string because a value the database somehow holds outside the CHECK must
 * survive into the pure layer to be refused there rather than be cast into a
 * basis it is not.
 */
export interface Phase2ReturnsRow {
  customer_id: string;
  labor_hours_saved: number | null;
  labor_cost_per_hour: number | null;
  revenue_since_phase2_start: number | null;
  revenue_basis: RevenueBasis | string | null;
  measured_at: string | null;
  measured_by: string | null;
  source: string | null;
  note: string | null;
  superseded_at: string | null;
}

type PostgrestError = { message: string };

type Phase2ReturnsResponse = { data: unknown; error: PostgrestError | null };

type Phase2ReturnsFilter = PromiseLike<Phase2ReturnsResponse> & {
  eq(column: string, value: unknown): Phase2ReturnsFilter;
};

/** The read slice of the client — narrow, so no write can be reached from here. */
export type Phase2ReturnsClient = {
  from(table: string): { select(columns: string): Phase2ReturnsFilter };
};

/** What the loader needs from a database, so the loader can be tested without one. */
export interface Phase2ReturnsDb {
  /**
   * Every stored measurement for one customer, superseded ones included.
   *
   * Throws on failure. An empty array and a broken query would otherwise render
   * identically — as "this customer's returns have not been measured yet", which
   * is a statement to a paying customer, under a money guarantee, about work we
   * may in fact have done.
   */
  fetchCustomerReturns(customerId: string): Promise<Phase2ReturnsRow[]>;
}

function asRow(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * A column → a finite number, or `null`.
 *
 * `null`/`undefined` are checked BEFORE `Number()` because `Number(null)` is 0 and
 * `Number("")` is 0 — and 0 is a measurement here, not a blank. The distinction is
 * the entire reason `phase2Guarantee` can tell never-measured apart from a total
 * shortfall, and it would be erased in this one line.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A PostgREST row → the shape the pure layer works in. */
export function toPhase2ReturnsRow(raw: unknown): Phase2ReturnsRow | null {
  const row = asRow(raw);
  if (!row) return null;
  return {
    customer_id: String(row.customer_id ?? ""),
    labor_hours_saved: num(row.labor_hours_saved),
    labor_cost_per_hour: num(row.labor_cost_per_hour),
    revenue_since_phase2_start: num(row.revenue_since_phase2_start),
    // Kept as whatever the database holds. Casting an unknown basis to a known one
    // would put a number under a question it does not answer.
    revenue_basis: str(row.revenue_basis),
    measured_at: str(row.measured_at),
    measured_by: str(row.measured_by),
    source: str(row.source),
    note: str(row.note),
    superseded_at: str(row.superseded_at),
  };
}

/** Bind the read to a real database. */
export function supabasePhase2ReturnsDb(client: Phase2ReturnsClient): Phase2ReturnsDb {
  return {
    async fetchCustomerReturns(customerId) {
      const { data, error } = await client
        .from(PHASE2_RETURNS_TABLE)
        .select(PHASE2_RETURNS_READ_COLUMNS)
        .eq("customer_id", customerId);
      if (error) throw new Error(`${PHASE2_RETURNS_TABLE} read: ${error.message}`);
      return Array.isArray(data)
        ? data.map(toPhase2ReturnsRow).filter((r): r is Phase2ReturnsRow => r !== null)
        : [];
    },
  };
}

/**
 * Whether 0029 can be read at all in this environment.
 *
 * Gated on the service key alone — the measurements are recorded by a human, not
 * by the partner webhook, so gating on `PHASE_SIGNAL_WEBHOOK_SECRET` (as the
 * component-live loader must) would hide a deliberately recorded measurement
 * behind an unrelated seam. Same call as `scanPicksReadable`.
 */
export function phase2ReturnsReadable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;

/** Service-role client for 0029. Server-side only — same idiom as `scanPicksClient`. */
export function phase2ReturnsClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("phase2 returns: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** The `Phase2ReturnsDb` the record pages run against in production. */
export function livePhase2ReturnsDb(): Phase2ReturnsDb {
  return supabasePhase2ReturnsDb(phase2ReturnsClient() as unknown as Phase2ReturnsClient);
}
