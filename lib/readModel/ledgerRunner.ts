// PRD Task MC.9 (invoicing leg, half 2) — the RUNNER SHELL.
//
// Half 1 (`invoiceLedger.ts`) parses ledger text. The decision core
// (`ledgerSync.ts`) turns "what prod stored" + "what the CSV says" into a plan.
// Neither touches the world. This file is the orchestration between them: read
// → digest → plan → apply → record the run. It still does no I/O itself — every
// side effect arrives as an injected port — so the whole sequence, including its
// failure paths, is testable without a filesystem, a git binary or Supabase.
// The concrete ports (fs + git + service-role client) and the schedule that
// fires them are the next increment; this is the part that must not be wrong.
//
// WHY THE ORDER IS APPLY-THEN-RECORD. A run row is a claim about what prod now
// holds. Recording first would let a failed write leave behind a record saying
// rows landed. So writes go first, and if they throw, the run is still recorded
// — as a refusal carrying the error sentence. A sync that dies silently is the
// exact failure the audit table exists to prevent: "no overdue invoices" and
// "the sync last succeeded on Tuesday" look identical on a panel.
//
// WHY A READ FAILURE IS NOT A RUN ROW. `invoice_ledger_sync_runs.content_sha256`
// is NOT NULL and digest-shaped, because an untagged run looks current forever.
// If the file could not be read there are no bytes to digest, and stamping the
// digest of nothing would be a fabricated provenance tag. So a read failure
// returns `read_failed` with its reason for the caller to surface (alerting is
// MC.14's job) and writes nothing anywhere — the previous run stays the newest,
// which is honest: the last thing we actually know remains the last thing we say.
//
// A no-op run IS recorded. Zero changes is a real, successful sync, and proving
// the sync ran today is most of the value of the audit table.

import { parseInvoiceLedger, type InvoiceLedgerRow } from "./invoiceLedger";
import {
  planLedgerSync,
  describeSyncPlan,
  type LedgerProvenance,
  type LedgerSyncPlan,
  type SyncedInvoiceRow,
} from "./ledgerSync";

// ── Ports ───────────────────────────────────────────────────────────────────

/** What a read of the contracts-repo CSV produced. `commit` is null when the
 *  working tree is dirty or the revision cannot be resolved — a real read,
 *  recorded honestly, never faked. */
export type LedgerRead = {
  text: string;
  /** sha256 of the exact bytes read, computed by the adapter. */
  sha256: string;
  commit: string | null;
};

export type LedgerSourcePort = {
  /** Resolve the CSV. Throwing is fine — the runner converts it to
   *  `read_failed`; the adapter never has to know about the outcome vocabulary. */
  read(): Promise<LedgerRead>;
};

export type LedgerRunRecord = {
  provenance: LedgerProvenance;
  refusalReason: string | null;
  summary: LedgerSyncPlan["summary"];
  requiresReview: boolean;
  conflicts: LedgerSyncPlan["conflicts"];
};

export type LedgerStorePort = {
  /** Everything currently mirrored, withdrawn rows included — a withdrawn
   *  invoice that reappears must diff against what we already hold, not be
   *  re-added as if it were new. */
  loadStored(): Promise<InvoiceLedgerRow[]>;
  /** Upsert the provenance-tagged writes and mark the withdrawals. Nothing is
   *  ever deleted; the port has no delete. */
  applyPlan(writes: readonly SyncedInvoiceRow[], withdrawals: LedgerSyncPlan["withdrawals"]): Promise<void>;
  /** Append one row to `invoice_ledger_sync_runs`, refusals included. */
  recordRun(record: LedgerRunRecord): Promise<void>;
};

export type LedgerRunnerInput = {
  source: LedgerSourcePort;
  store: LedgerStorePort;
  /** ISO instant for this run, injected per CR-3. */
  syncedAt: string;
  sourceRepo: string;
  sourcePath: string;
};

// ── Outcome ─────────────────────────────────────────────────────────────────

export type LedgerRunOutcome =
  /** Plan computed and written. */
  | { outcome: "applied"; plan: LedgerSyncPlan; log: string }
  /** The decision core refused (bad read, see its three rules). Nothing written,
   *  run recorded with the refusal sentence. */
  | { outcome: "refused"; plan: LedgerSyncPlan; log: string }
  /** Writes threw. Run recorded as a refusal naming the error. */
  | { outcome: "apply_failed"; plan: LedgerSyncPlan; log: string; error: string }
  /** No bytes, so no provenance, so no run row. Caller must surface this. */
  | { outcome: "read_failed"; log: string; error: string }
  /** Writes succeeded but the audit row did not land — the panel would show
   *  fresh money under an unrecorded run. Loud on purpose. */
  | { outcome: "unrecorded"; plan: LedgerSyncPlan; log: string; error: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One pass of the invoicing sync. Never throws: every failure is a named
 *  outcome with a log line, because the caller is a cron route whose only job
 *  is to report what happened. */
export async function runLedgerSync(input: LedgerRunnerInput): Promise<LedgerRunOutcome> {
  const { source, store, syncedAt, sourceRepo, sourcePath } = input;

  let read: LedgerRead;
  try {
    read = await source.read();
  } catch (e) {
    const error = errText(e);
    return {
      outcome: "read_failed",
      error,
      log: `NO RUN — could not read ${sourceRepo}/${sourcePath}: ${error} · nothing written, no run recorded (no bytes to digest); the previous run remains the newest`,
    };
  }

  let stored: InvoiceLedgerRow[];
  try {
    stored = await store.loadStored();
  } catch (e) {
    const error = errText(e);
    // Unknown store state is not an empty store: diffing against a failed load
    // would withdraw every invoice prod holds. Treat it like a failed read.
    return {
      outcome: "read_failed",
      error,
      log: `NO RUN — could not load stored invoices: ${error} · nothing written; an unreadable store is never treated as an empty one`,
    };
  }

  const incoming = parseInvoiceLedger(read.text);
  const provenance: LedgerProvenance = {
    sourceRepo,
    sourcePath,
    contentSha256: read.sha256,
    sourceCommit: read.commit,
    syncedAt,
    rowCount: incoming.length,
  };

  // Throws only on a malformed tag (bad digest / bad instant) — that is a bug in
  // the adapter, and an untagged sync must not proceed.
  let plan: LedgerSyncPlan;
  try {
    plan = planLedgerSync(stored, incoming, provenance);
  } catch (e) {
    const error = errText(e);
    return {
      outcome: "read_failed",
      error,
      log: `NO RUN — ${error} · nothing written, no run recorded; an untagged sync looks current forever`,
    };
  }

  const log = describeSyncPlan(plan);
  const record: LedgerRunRecord = {
    provenance: plan.provenance,
    refusalReason: plan.refusalReason,
    summary: plan.summary,
    requiresReview: plan.requiresReview,
    conflicts: plan.conflicts,
  };

  if (plan.refusalReason) {
    try {
      await store.recordRun(record);
    } catch (e) {
      const error = errText(e);
      return {
        outcome: "unrecorded",
        plan,
        error,
        log: `${log} · AND the refusal could not be recorded: ${error}`,
      };
    }
    return { outcome: "refused", plan, log };
  }

  try {
    await store.applyPlan(plan.writes, plan.withdrawals);
  } catch (e) {
    const error = errText(e);
    const failed = `apply failed: ${error}`;
    try {
      await store.recordRun({ ...record, refusalReason: failed, requiresReview: true });
    } catch {
      // Both halves down; the outcome below still carries the whole story.
    }
    return { outcome: "apply_failed", plan, error, log: `NO WRITE — ${failed} · ${log}` };
  }

  try {
    await store.recordRun(record);
  } catch (e) {
    const error = errText(e);
    return {
      outcome: "unrecorded",
      plan,
      error,
      log: `WROTE ${plan.writes.length} row(s) BUT the run row did not land: ${error} · ${log} — the panel's "as of" line cannot be trusted until this is reconciled`,
    };
  }

  return { outcome: "applied", plan, log };
}

/** True when a run needs a human before the AR panel should be believed. Used by
 *  the cron route's status code: a refusal is not a 200. */
export function runNeedsAttention(result: LedgerRunOutcome): boolean {
  if (result.outcome !== "applied") return true;
  return result.plan.requiresReview;
}
