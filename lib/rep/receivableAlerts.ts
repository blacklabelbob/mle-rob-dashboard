/**
 * Q81 leg (c) — the surface that replaces the daily nag.
 *
 * Rob, ROB-ANSWERS-2026-07-29-night.md §4: *"you can stop bringing it up every day. We just
 * show it at the rep level so they see it when they open up and see the alerts and then also
 * within the deal itself."* The receivable he was being reminded about (CG Roofing instalment 1)
 * is data he already knows; the person who does NOT know is the rep. So the reminder dies and
 * this takes its place — and it is deliberately GENERAL: nothing here names a client, and the
 * CG Roofing row reaches the rep only because the ledger says it is overdue, exactly as the
 * next one will.
 *
 * WHAT THIS MODULE MAY SAY, AND WHAT IT MAY NOT. `invoice_ledger.amount` stays withheld from
 * both new roles (`roleGrants.ts`, Rob's line: equity/receivables are the owners' ledger; deal
 * money is not). `payment_state` is granted to the rep as of this item, because "this is late"
 * is the whole alert. So `ReceivableAlert` carries no dollar field AT ALL — not zeroed, not
 * optional, absent — which makes leaking the withheld column into a rep screen a type error
 * rather than a code-review question.
 *
 * TRUTH POSTURE, inherited from `invoiceLedger.ts`: an alert asserts lateness, so it is only
 * ever raised on a row that is *explicitly* outstanding AND carries an explicit due date now
 * past. A row whose status text this parser could not classify, and a row with no stated due
 * date, are never asserted overdue — they are COUNTED and returned, because a rep quietly shown
 * six of eight late invoices is worse off than one told "six, and two the ledger can't answer."
 *
 * Pure per CR-3: no clock, no fs, no network — `todayISO` is passed in.
 */

import {
  AGING_ORDER,
  bucketFor,
  daysBetweenISO,
  type AgingBucket,
  type InvoiceLedgerRow,
} from "@/lib/readModel/invoiceLedger";

/** The buckets that justify an alert. `due_today` is not late yet; `no_due_date` cannot be
 *  called late at all. Derived from the shared bucket vocabulary so a new overdue bucket in
 *  `invoiceLedger.ts` cannot silently fail to alert. */
export const ALERTING_BUCKETS: readonly AgingBucket[] = AGING_ORDER.filter((b) =>
  b.startsWith("overdue_")
);

export type AlertSeverity = "high" | "medium";

export type ReceivableAlert = {
  invoiceNumber: string;
  /** The ledger's own client slug — the join key every rep screen already uses. */
  clientSlug: string;
  /** Whole days past the stated due date. Always > 0 on an alert. */
  daysOverdue: number;
  dueDate: string;
  bucket: AgingBucket;
  severity: AlertSeverity;
  /** One line a rep reads without opening anything. Carries no amount, by design. */
  headline: string;
};

export type ReceivableAlerts = {
  /** Worst-first: most days overdue, then invoice number for a stable order. */
  alerts: ReceivableAlert[];
  /** Outstanding rows whose status text could not be classified — not asserted late, counted. */
  unclassifiedCount: number;
  /** Outstanding rows with no stated due date — "we don't know when this was due" is not "late". */
  noDueDateCount: number;
};

/** 60+ days is a different conversation from 3 days late, so it reads differently. */
export function severityFor(bucket: AgingBucket): AlertSeverity {
  return bucket === "overdue_60_plus" ? "high" : "medium";
}

export function headlineFor(clientSlug: string, daysOverdue: number): string {
  const day = daysOverdue === 1 ? "day" : "days";
  return `${clientSlug} — payment ${daysOverdue} ${day} overdue`;
}

/**
 * Build the rep alert set from parsed ledger rows.
 *
 * `clientSlug` narrows to one account (the deal-record case in Rob's third instruction);
 * omitted, it is the whole open-the-dashboard alert list.
 */
export function buildReceivableAlerts(
  rows: readonly InvoiceLedgerRow[],
  todayISO: string,
  clientSlug?: string
): ReceivableAlerts {
  const wanted = clientSlug?.trim().toLowerCase();
  const scoped = wanted
    ? rows.filter((r) => r.clientSlug.trim().toLowerCase() === wanted)
    : rows;

  const alerts: ReceivableAlert[] = [];
  let unclassifiedCount = 0;
  let noDueDateCount = 0;

  for (const row of scoped) {
    if (row.paymentState === "paid") continue;
    if (row.paymentState === "unknown") {
      unclassifiedCount += 1;
      continue;
    }
    if (!row.dueDate) {
      noDueDateCount += 1;
      continue;
    }
    const bucket = bucketFor(row, todayISO);
    if (!ALERTING_BUCKETS.includes(bucket)) continue;
    const daysOverdue = daysBetweenISO(row.dueDate, todayISO);
    alerts.push({
      invoiceNumber: row.invoiceNumber,
      clientSlug: row.clientSlug,
      daysOverdue,
      dueDate: row.dueDate,
      bucket,
      severity: severityFor(bucket),
      headline: headlineFor(row.clientSlug, daysOverdue),
    });
  }

  alerts.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      a.invoiceNumber.localeCompare(b.invoiceNumber)
  );

  return { alerts, unclassifiedCount, noDueDateCount };
}
