// Q93 inc.1 — who still needs the fully-executed copy, decided from the
// signature_events ledger rather than from hope.
//
// The completion email shipped in 38fcaec, but a failed send only reached
// console.error: nobody was told, and nothing could retry, because the
// countersign route's atomic claim rejects a second POST with 409 before the
// mailer is ever reached. So one flaky webhook call meant the counterparty
// silently never learned the agreement closed.
//
// These are pure functions (CR-3): the caller supplies the ledger rows and the
// addresses; no clock, no network, no Supabase. `copy_delivered` with
// meta.kind === "fully_executed" is the receipt — an address that has one is
// done, an address that does not is still owed the mail.

export interface DeliveryLedgerRow {
  type: string;
  meta?: Record<string, unknown> | null;
}

export const EXECUTED_COPY_KIND = "fully_executed";

/** Lowercased, trimmed, de-duplicated — the same normalisation the sign route
 *  uses so "Rob@AIVoiceTech.io" and "rob@aivoicetech.io" are one recipient. */
export function normalizeRecipients(addresses: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      addresses
        .filter((a): a is string => typeof a === "string" && a.trim() !== "")
        .map((a) => a.trim().toLowerCase())
    ),
  ];
}

/** Addresses already receipted in the ledger for the fully-executed copy. */
export function deliveredExecutedCopies(events: DeliveryLedgerRow[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type !== "copy_delivered") continue;
    const meta = e.meta ?? {};
    if (meta.kind !== EXECUTED_COPY_KIND) continue;
    const to = meta.to;
    if (typeof to !== "string" || to.trim() === "") continue;
    out.push(to.trim().toLowerCase());
  }
  return [...new Set(out)];
}

/**
 * The retry contract: recipients minus everyone the ledger already receipts.
 * Re-running the delivery is therefore safe — a second call mails only the
 * addresses the first call failed to reach, and mails nobody twice.
 */
export function pendingExecutedCopies(
  recipients: (string | null | undefined)[],
  events: DeliveryLedgerRow[]
): string[] {
  const done = new Set(deliveredExecutedCopies(events));
  return normalizeRecipients(recipients).filter((to) => !done.has(to));
}
