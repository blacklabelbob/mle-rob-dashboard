/**
 * Q81 leg (c), inc.2 — the read that puts inc.1's alerts on a rep's screen.
 *
 * Two things make this loader different from every other panel read, and both are Rob's
 * line in ROB-ANSWERS-2026-07-29-night.md §4 turned into code:
 *
 * 1. IT ASKS POSTGRES FOR FOUR COLUMNS, NOT THE ROW. `invoice_ledger.amount`,
 *    `client_legal_name`, `payment_plan_note` and `status_text` are all denied to
 *    `mle_rep_read` (`roleGrants.ts`), and `ReceivableAlert` has no dollar field to put them
 *    in — but a wide `select` would still pull the withheld money into a server render for a
 *    rep page, one refactor away from being displayed. So the select list IS the grant list:
 *    the money never leaves the database on this path. Pinned in tests against the read-model
 *    contract, so a renamed column fails loudly instead of quietly reading null.
 *
 * 2. "NO OVERDUE INVOICES" AND "THE SYNC BROKE TUESDAY" MUST NOT LOOK IDENTICAL — the
 *    `rm_invoices_ar` contract says so about `synced_at`, and it matters most here, because
 *    this panel replaced a human being reminding Rob every morning. A silent empty alert list
 *    would be a worse nag than the one Q81 deleted: it would say "you're clear" on a stale
 *    read. Hence `syncedAt` rides along, and a failed read returns `error`, never `ok` + [].
 *
 * `todayISO` stays injected (CR-3) — the clock belongs to the caller, `todayInET(now)`.
 */

import { supabaseViewReader } from "@/lib/readModel/live";
import { fromDbRow } from "@/lib/readModel/ledgerRows";
import type { InvoiceLedgerRow } from "@/lib/readModel/invoiceLedger";
import { buildReceivableAlerts, type ReceivableAlerts } from "./receivableAlerts";
import {
  distinctClientSlugs,
  resolveLedgerClientSlug,
} from "./ledgerClientMatch";

/**
 * Exactly the `rm_invoices_ar` columns a rep may read, and exactly the ones the alert needs.
 * `payment_state` is Q81's released grant; `due_date` is what makes "late" a fact rather than
 * a feeling; `invoice_number`/`client_slug` are identifiers. Nothing here is an amount.
 */
export const REP_ALERT_COLUMNS = [
  "invoice_number",
  "client_slug",
  "payment_state",
  "due_date",
  "synced_at",
] as const;

export type RepReceivableAlertsResult =
  | {
      state: "ok";
      alerts: ReceivableAlerts;
      /** Newest `synced_at` across the rows read — null when the ledger is empty. */
      syncedAt: string | null;
    }
  /** Config missing — we did not try. Distinct from a read that failed. */
  | { state: "unconfigured"; reason: string }
  | { state: "error"; reason: string }
  /**
   * The ledger read fine and holds NO invoice for this account. The overwhelmingly normal
   * case — most accounts on the board have never been invoiced — so it is a quiet statement
   * of fact, never a warning. Kept apart from `ok` + [] because "we have billed them and
   * nothing is late" is a stronger claim than "we have never billed them", and a deal record
   * must not make the first claim when only the second is true.
   */
  | { state: "unbilled"; reason: string }
  /**
   * The ledger read fine and MORE THAN ONE client could be this account. This one IS a
   * warning: money exists and we cannot say whose. Never collapsed into `unbilled` — the
   * difference between "no invoice" and "an invoice we can't place" is the whole point.
   */
  | { state: "unlinked"; reason: string };

/** Newest ISO timestamp, string-compared — `synced_at` is written as ISO-8601 UTC. */
export function newestSyncedAt(rows: readonly Record<string, unknown>[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    const value = row.synced_at;
    if (typeof value !== "string" || !value) continue;
    if (newest === null || value > newest) newest = value;
  }
  return newest;
}

/**
 * Read the live ledger and shape a rep's overdue-receivable alerts.
 *
 * `clientSlug` narrows to one account — the deal-record half of Rob's instruction; omitted,
 * it is the open-the-dashboard list.
 */
export async function loadReceivableAlerts(
  todayISO: string,
  clientSlug?: string
): Promise<RepReceivableAlertsResult> {
  const read = await readLedgerRows();
  if (read.state !== "ok") return read;
  return {
    state: "ok",
    alerts: buildReceivableAlerts(read.rows, todayISO, clientSlug),
    syncedAt: read.syncedAt,
  };
}

/**
 * The deal-record half of Rob's instruction: the same alerts, scoped to the one account whose
 * record is open.
 *
 * It takes the ORG NAME rather than a slug because the deal record has no slug — the ledger's
 * `client_slug` and the CRM's org name are separate namespaces, and `ledgerClientMatch.ts` is
 * the only place allowed to bridge them. When it cannot bridge them this returns `unlinked`
 * and the panel says which record it could not place, because a deal record that quietly reads
 * "Nothing overdue" on a failed join is the exact false all-clear Q81 exists to prevent.
 */
export async function loadDealReceivableAlerts(
  todayISO: string,
  orgName: string | null | undefined
): Promise<RepReceivableAlertsResult> {
  const read = await readLedgerRows();
  if (read.state !== "ok") return read;

  const match = resolveLedgerClientSlug(orgName, distinctClientSlugs(read.rows));
  if (match.state === "none") {
    // NOT a warning. Five of the seven companies on the board have never been invoiced, so
    // an alarm here would fire on most deal records — and a panel that cries wolf on the
    // majority of records is the noise Q81 exists to delete, not a safeguard.
    return {
      state: "unbilled",
      reason: orgName
        ? `no invoice in the ledger is billed to "${orgName}"`
        : "this deal has no linked company, so there is nothing to look up in the invoice ledger",
    };
  }
  if (match.state === "ambiguous") {
    return {
      state: "unlinked",
      reason: `"${orgName}" matches more than one ledger client (${match.candidates.join(", ")}) — not guessing whose money this is`,
    };
  }

  return {
    state: "ok",
    alerts: buildReceivableAlerts(read.rows, todayISO, match.slug),
    syncedAt: read.syncedAt,
  };
}

type LedgerRead =
  | { state: "ok"; rows: InvoiceLedgerRow[]; syncedAt: string | null }
  | { state: "unconfigured"; reason: string }
  | { state: "error"; reason: string };

/** One read, one column list, shared by both surfaces so neither can drift wider than the grant. */
async function readLedgerRows(): Promise<LedgerRead> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.STORAGE_SOURCE !== "supabase" || !url || !key) {
    return {
      state: "unconfigured",
      reason:
        "the invoice ledger lives in Postgres — set STORAGE_SOURCE=supabase with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const read = supabaseViewReader(url, key);
  const res = await read("rm_invoices_ar", REP_ALERT_COLUMNS.join(","));
  if (res.error) return { state: "error", reason: res.error };

  return {
    state: "ok",
    rows: res.rows.map((r) => fromDbRow(r) as InvoiceLedgerRow),
    syncedAt: newestSyncedAt(res.rows),
  };
}
