// PRD Task MC.9 — the `invoice_ledger` COLUMN MAPPING, and nothing else.
//
// Split out of `ledgerAdapters.ts` when the AR read path landed (MC.12): the
// sync writes these columns and the panel now reads them back, so both sides
// must use ONE mapping — two would drift, and a drifted money mapping shows a
// wrong number rather than an error. Adapters re-export from here, so every
// existing import keeps working and there is still only one definition.
//
// This module is pure and node-free on purpose. `ledgerAdapters.ts` pulls in
// `node:child_process` (git) and `node:fs` for the local sync job; the panel
// read path has no business loading either, and a type-only import from a
// React component must never reach them.
//
// WHAT CAN LIE HERE, AND WHAT STOPS IT.
//
// 1. A DROPPED KEY DOES NOT ERROR — IT WRITES NULL. PostgREST rejects an
//    unknown column but happily accepts a missing one, so a typo'd key means an
//    invoice silently loses its due date on a money panel. Hence: written out
//    field by field, never a generic camel→snake loop (a loop cannot be
//    reviewed), and pinned in tests against `TRACKED_FIELDS` + the parsed
//    columns of 0012.
//
// 2. NUMERIC ROUND-TRIP. PostgREST returns `numeric` as a STRING and
//    `Number("") === 0`, which would turn a deliberately-unreadable amount into
//    a real $0.00 — the fabricated number half 1 exists to refuse. `readAmount`
//    returns null for anything non-finite, and null means "unreadable", which
//    every total already excludes and counts.

import type { InvoiceLedgerRow } from "./invoiceLedger";
import type { SyncedInvoiceRow } from "./ledgerSync";

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

/** `invoice_ledger` row → the domain row the diff compares against, and the
 *  same row the AR panel shapes. Withdrawn rows are loaded too on the sync
 *  side: an invoice that reappears must diff against what we already hold
 *  rather than come back as brand new. (The `rm_invoices_ar` view filters them
 *  out for the panel — that is the view's job, not this mapping's.) */
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
