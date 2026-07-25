// PRD Task MC.9 (invoicing leg, half 2) — the CONCRETE PORTS.
//
// `ledgerRunner.ts` is the whole read→digest→plan→apply→record sequence with
// every side effect injected. This file supplies those effects for real: the
// filesystem + git read of the contracts repo, and the service-role writes into
// the two 0012 tables. It holds no policy — every conservative rule (nothing is
// deleted, an empty read is refused, duplicates are held back) already lives in
// the decision core and stays there.
//
// WHAT CAN LIE HERE, AND WHAT STOPS IT.
//
// 1. COLUMN MAPPING. The domain row is camelCase, Postgres is snake_case. A
//    typo'd key does not error — PostgREST would reject an unknown column, but a
//    DROPPED one just writes NULL, i.e. an invoice silently loses its due date
//    on a money panel. So the mapping is written out field by field (never a
//    generic camel→snake loop, which cannot be reviewed) and pinned in tests
//    against BOTH `TRACKED_FIELDS` and the parsed columns of 0012.
//
// 2. NUMERIC ROUND-TRIP. PostgREST returns `numeric` as a STRING. `Number("")`
//    is 0, which would turn an unreadable amount into a real $0.00 — precisely
//    the fabricated number half 1 refuses to produce. `readAmount` returns null
//    for anything that is not a finite number, and null means "unreadable",
//    which every total already excludes and counts.
//
// 3. THE COMMIT TAG. A commit is only reported when the file at that revision
//    is what we actually read. If the working tree has the file modified, or
//    git is unavailable, the commit is NULL — an honest "read from a dirty
//    tree", never a nearby revision that did not produce these bytes.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceLedgerRow } from "./invoiceLedger";
import type { LedgerSyncPlan, SyncedInvoiceRow } from "./ledgerSync";
import type {
  LedgerRead,
  LedgerRunRecord,
  LedgerSourcePort,
  LedgerStorePort,
} from "./ledgerRunner";

// ── Row mapping ─────────────────────────────────────────────────────────────

/** Domain row → `invoice_ledger` columns. Explicit on purpose: see note 1. */
export function toDbRow(row: SyncedInvoiceRow): Record<string, unknown> {
  return {
    invoice_number: row.invoiceNumber,
    issue_date: row.issueDate,
    client_slug: row.clientSlug,
    client_legal_name: row.clientLegalName,
    owner: row.owner,
    amount: row.amount,
    currency: row.currency,
    status_text: row.statusText,
    payment_state: row.paymentState,
    due_date: row.dueDate,
    payment_plan_note: row.paymentPlanNote,
    pdf: row.pdf,
    source_sha256: row.sourceSha256,
    source_commit: row.sourceCommit,
    synced_at: row.syncedAt,
    withdrawn_at: row.withdrawnAt,
    updated_at: row.syncedAt,
  };
}

/** `numeric` arrives as a string. Unreadable stays unreadable — never 0. */
export function readAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const nullableStr = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** `invoice_ledger` row → the domain row the diff compares against. Withdrawn
 *  rows are loaded too: an invoice that reappears must diff against what we
 *  already hold rather than come back as brand new. */
export function fromDbRow(db: Record<string, unknown>): InvoiceLedgerRow {
  const paymentState = str(db.payment_state);
  return {
    invoiceNumber: str(db.invoice_number),
    issueDate: str(db.issue_date),
    clientSlug: str(db.client_slug),
    clientLegalName: str(db.client_legal_name),
    owner: nullableStr(db.owner),
    amount: readAmount(db.amount),
    currency: str(db.currency),
    statusText: str(db.status_text),
    // The CHECK constraint is the guarantee; anything else came from a hand
    // edit and must not be read as a state we can act on.
    paymentState:
      paymentState === "paid" || paymentState === "outstanding" ? paymentState : "unknown",
    dueDate: nullableStr(db.due_date),
    paymentPlanNote: nullableStr(db.payment_plan_note),
    pdf: nullableStr(db.pdf),
  };
}

/** Run record → `invoice_ledger_sync_runs` columns. A refusal is a row too. */
export function toRunRow(record: LedgerRunRecord): Record<string, unknown> {
  const { provenance: p, summary: s } = record;
  return {
    source_repo: p.sourceRepo,
    source_path: p.sourcePath,
    content_sha256: p.contentSha256,
    source_commit: p.sourceCommit,
    synced_at: p.syncedAt,
    row_count: p.rowCount,
    refusal_reason: record.refusalReason,
    added: s.added,
    changed: s.changed,
    withdrawn: s.withdrawn,
    unchanged: s.unchanged,
    material: s.material,
    conflicts: s.conflicts,
    requires_review: record.requiresReview,
    conflict_detail: record.conflicts,
  };
}

// ── Source port: filesystem + git ───────────────────────────────────────────

export type FsLedgerSourceOptions = {
  /** Absolute path to the contracts repo checkout. */
  repoDir: string;
  /** Path to the CSV inside that repo, e.g. "invoices/invoice-ledger.csv". */
  sourcePath: string;
};

/** HEAD, but only when the file at HEAD is the file we read. Null otherwise —
 *  including when git is missing entirely. Never throws: a provenance tag we
 *  cannot establish is recorded as absent, and absent is honest. */
export function resolveCommit(repoDir: string, sourcePath: string): string | null {
  try {
    const dirty = execFileSync("git", ["-C", repoDir, "status", "--porcelain", "--", sourcePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (dirty) return null;
    const head = execFileSync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{7,40}$/.test(head) ? head : null;
  } catch {
    return null;
  }
}

export function createFsLedgerSource(options: FsLedgerSourceOptions): LedgerSourcePort {
  const file = path.join(options.repoDir, options.sourcePath);
  return {
    async read(): Promise<LedgerRead> {
      // Read bytes, digest the bytes. Digesting a decoded string would let two
      // different files share a tag through an encoding quirk.
      const bytes = await readFile(file);
      return {
        text: bytes.toString("utf8"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        commit: resolveCommit(options.repoDir, options.sourcePath),
      };
    },
  };
}

// ── Store port: service-role Supabase ───────────────────────────────────────

/** Supabase errors are thrown, not swallowed: the runner turns a throw into a
 *  named outcome and still records the refusal. Returning quietly here is what
 *  produces "the sync said it worked" on a panel holding stale money. */
export function createSupabaseLedgerStore(client: SupabaseClient): LedgerStorePort {
  return {
    async loadStored(): Promise<InvoiceLedgerRow[]> {
      const res = await client.from("invoice_ledger").select("*");
      if (res.error) throw new Error(`invoice_ledger load failed: ${res.error.message}`);
      return (res.data ?? []).map((row) => fromDbRow(row as Record<string, unknown>));
    },

    async applyPlan(
      writes: readonly SyncedInvoiceRow[],
      withdrawals: LedgerSyncPlan["withdrawals"],
    ): Promise<void> {
      if (writes.length) {
        const res = await client
          .from("invoice_ledger")
          .upsert(writes.map(toDbRow), { onConflict: "invoice_number" });
        if (res.error) throw new Error(`invoice_ledger upsert failed: ${res.error.message}`);
      }
      // A mark, never a delete — and applied one number at a time so a partial
      // failure names the invoice it stopped on.
      for (const w of withdrawals) {
        const res = await client
          .from("invoice_ledger")
          .update({ withdrawn_at: w.withdrawnAt, updated_at: w.withdrawnAt })
          .eq("invoice_number", w.invoiceNumber);
        if (res.error) {
          throw new Error(`withdrawal mark failed for ${w.invoiceNumber}: ${res.error.message}`);
        }
      }
    },

    async recordRun(record: LedgerRunRecord): Promise<void> {
      const res = await client.from("invoice_ledger_sync_runs").insert(toRunRow(record));
      if (res.error) throw new Error(`sync run record failed: ${res.error.message}`);
    },
  };
}

/** Service-role client for the sync. Distinct from `live.ts`'s reader: this one
 *  writes, so it is never handed a publishable key. */
export function createLedgerSyncClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
