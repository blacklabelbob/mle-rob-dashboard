// PRD Task MC.9 (invoicing leg) → Task MC.12 (the Invoices/AR panel).
//
// GATE G3 (MC.7, 2026-07-23) settled where invoicing actually lives: the ONLY
// live store is `invoices/invoice-ledger.csv` in the contracts repo. Supabase
// has no invoice/AR table, so `rm_invoices_ar` is `blocked_no_source` in the
// MC.8 contract and a SQL view is structurally impossible. The AR panel
// therefore reads a CSV-diff ingestion — and this module is the PARSE +
// SHAPE half of it: ledger text in, panel view-model out.
//
// Pure per CR-3: no filesystem, no network, no clock. The caller supplies the
// CSV text and `todayISO` (Rob's ET day, same anchor as overdue.ts/panels.ts).
// The ingest half — getting that text to prod, provenance-tagged, on a
// schedule — is the remaining MC.9 leg and lives outside this file.
//
// TRUTH POSTURE. The ledger's `status` column is FREE TEXT written by a human
// ("paid 2026-07-16 (check)", "issued — split-payment plan approved …"). This
// module refuses to guess at it:
//   * a payment state is only claimed when the text says so explicitly,
//     otherwise `unknown` — never defaulted to outstanding or to paid;
//   * a due date is only read when the text carries an explicit ISO date,
//     otherwise null, and a null due date is its OWN aging bucket rather than
//     being quietly filed under "current" (this is exactly the structured
//     due-date extraction MC.14's unpaid-alerts are blocked on);
//   * split-payment plans are surfaced VERBATIM and never turned into
//     arithmetic. Invoice 100122 is "2 x $5,000, first due by 2026-07-24" in
//     prose only; inventing a $5,000 partial balance would put a fabricated
//     number on a money panel. The full amount stays outstanding and the plan
//     text rides along so a reader can see why.

import { panelHeader, type PanelHeader } from "./panels";

// ── CSV parsing ─────────────────────────────────────────────────────────────

/** RFC4180 fields: quoted cells may contain commas, newlines and "" escapes.
 *  The ledger's scope_summary and status cells both use them, so a naive
 *  split(",") silently shears rows apart — hence a real parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // A trailing newline must not manufacture a phantom empty row.
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

// ── Ledger rows ─────────────────────────────────────────────────────────────

/** Columns the ledger promises today. Pinned so a renamed/dropped column
 *  fails loudly here instead of silently emptying the AR panel. */
export const LEDGER_COLUMNS = [
  "invoice_number",
  "issue_date",
  "iso_week",
  "client_slug",
  "client_legal_name",
  "owner",
  "scope_summary",
  "amount",
  "currency",
  "status",
  "pdf",
] as const;

export type PaymentState =
  /** The status text explicitly says paid. */
  | "paid"
  /** The status text explicitly says issued/sent/outstanding. */
  | "outstanding"
  /** The status text says something this parser does not recognise. Never
   *  collapsed into either of the above — an unreadable status is a finding,
   *  not a balance. */
  | "unknown";

export type InvoiceLedgerRow = {
  invoiceNumber: string;
  issueDate: string;
  clientSlug: string;
  clientLegalName: string;
  owner: string | null;
  amount: number | null;
  currency: string;
  /** The status cell exactly as a human wrote it. */
  statusText: string;
  paymentState: PaymentState;
  /** Explicit ISO due date found in the status text, else null. */
  dueDate: string | null;
  /** Verbatim plan text when the status describes instalments — never parsed
   *  into amounts. Null when the status carries no plan language. */
  paymentPlanNote: string | null;
  pdf: string | null;
};

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const DUE_DATE = /due\s+(?:by\s+)?(\d{4}-\d{2}-\d{2})/i;
const PLAN = /split-payment|instal?lment|payment plan/i;

/** Explicit-only. "paid" and "issued" must be stated; anything else is
 *  `unknown` and the panel shows the raw text. */
export function classifyStatus(statusText: string): PaymentState {
  const s = statusText.trim().toLowerCase();
  if (!s) return "unknown";
  if (/^paid\b|\bpaid in full\b/.test(s)) return "paid";
  if (/^(issued|sent|outstanding|unpaid|overdue)\b/.test(s)) return "outstanding";
  return "unknown";
}

export function extractDueDate(statusText: string): string | null {
  const m = DUE_DATE.exec(statusText);
  return m ? m[1] : null;
}

export function extractPlanNote(statusText: string): string | null {
  return PLAN.test(statusText) ? statusText.trim() : null;
}

/** Money is parsed strictly: a cell that is not a clean number becomes null
 *  (an unreadable amount is excluded from every total and counted separately)
 *  rather than silently becoming 0. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseInvoiceLedger(csvText: string): InvoiceLedgerRow[] {
  const rows = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  for (const col of LEDGER_COLUMNS) {
    if (!header.includes(col)) {
      throw new Error(
        `invoice-ledger.csv is missing the \`${col}\` column — the ledger shape changed; ` +
          `fix the parser rather than shipping an AR panel that quietly drops it`
      );
    }
  }
  const at = (r: string[], col: (typeof LEDGER_COLUMNS)[number]) =>
    (r[header.indexOf(col)] ?? "").trim();

  return rows.slice(1).map((r) => {
    const statusText = at(r, "status");
    return {
      invoiceNumber: at(r, "invoice_number"),
      issueDate: at(r, "issue_date"),
      clientSlug: at(r, "client_slug"),
      clientLegalName: at(r, "client_legal_name"),
      owner: at(r, "owner") || null,
      amount: parseAmount(at(r, "amount")),
      currency: at(r, "currency") || "USD",
      statusText,
      paymentState: classifyStatus(statusText),
      dueDate: extractDueDate(statusText),
      paymentPlanNote: extractPlanNote(statusText),
      pdf: at(r, "pdf") || null,
    };
  });
}

// ── Aging ───────────────────────────────────────────────────────────────────

export type AgingBucket =
  | "not_yet_due"
  | "due_today"
  | "overdue_1_30"
  | "overdue_31_60"
  | "overdue_60_plus"
  /** Outstanding, but the ledger never stated a due date. Its own bucket on
   *  purpose: "not due yet" and "we don't know when this is due" are different
   *  claims, and only one of them is safe to act on. */
  | "no_due_date"
  /** Settled — aging does not apply. */
  | "paid";

/** Whole days between two ISO dates, date-only (no clock, no timezone drift:
 *  both sides are already Rob's ET day). */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function bucketFor(row: InvoiceLedgerRow, todayISO: string): AgingBucket {
  if (row.paymentState === "paid") return "paid";
  if (!row.dueDate || !ISO_DATE.test(row.dueDate)) return "no_due_date";
  const overdueDays = daysBetweenISO(row.dueDate, todayISO);
  if (overdueDays < 0) return "not_yet_due";
  if (overdueDays === 0) return "due_today";
  if (overdueDays <= 30) return "overdue_1_30";
  if (overdueDays <= 60) return "overdue_31_60";
  return "overdue_60_plus";
}

export const AGING_ORDER: readonly AgingBucket[] = [
  "overdue_60_plus",
  "overdue_31_60",
  "overdue_1_30",
  "due_today",
  "not_yet_due",
  "no_due_date",
  "paid",
];

export type AgingRow = InvoiceLedgerRow & {
  bucket: AgingBucket;
  /** Positive = days past due. Null when there is no stated due date. */
  daysOverdue: number | null;
};

export type AgingGroup = {
  bucket: AgingBucket;
  count: number;
  /** Sum of readable amounts only — unreadable amounts are counted, not guessed. */
  amount: number;
  unreadableAmounts: number;
};

export type InvoicesArPanel = PanelHeader & {
  /** Every outstanding/unknown invoice's readable amount. Split plans count in
   *  FULL — see the truth posture at the top of this file. */
  outstandingTotal: number;
  paidTotal: number;
  /** Outstanding invoices whose status text this parser could not classify. */
  unclassifiedCount: number;
  /** Outstanding invoices with no stated due date — MC.14's blocker, surfaced. */
  noDueDateCount: number;
  /** Invoices whose amount cell was unreadable; excluded from every total. */
  unreadableAmountCount: number;
  byAging: AgingGroup[];
  rows: AgingRow[];
};

export function buildInvoicesArPanel(
  rows: readonly InvoiceLedgerRow[],
  todayISO: string
): InvoicesArPanel {
  const aged: AgingRow[] = rows.map((row) => {
    const bucket = bucketFor(row, todayISO);
    return {
      ...row,
      bucket,
      daysOverdue: row.dueDate ? daysBetweenISO(row.dueDate, todayISO) : null,
    };
  });

  const groups = new Map<AgingBucket, AgingGroup>();
  for (const row of aged) {
    const g =
      groups.get(row.bucket) ??
      { bucket: row.bucket, count: 0, amount: 0, unreadableAmounts: 0 };
    g.count += 1;
    if (row.amount === null) g.unreadableAmounts += 1;
    else g.amount += row.amount;
    groups.set(row.bucket, g);
  }

  const sum = (pred: (r: AgingRow) => boolean) =>
    aged.reduce((t, r) => (pred(r) && r.amount !== null ? t + r.amount : t), 0);

  return {
    // The panel is `unavailable` until the MC.9 ingest half lands, so the
    // header is derived from the contract exactly like every other panel —
    // shaping the rows here does not entitle it to claim `live`.
    ...panelHeader("rm_invoices_ar", rows.length),
    outstandingTotal: sum((r) => r.paymentState !== "paid"),
    paidTotal: sum((r) => r.paymentState === "paid"),
    unclassifiedCount: aged.filter((r) => r.paymentState === "unknown").length,
    noDueDateCount: aged.filter((r) => r.bucket === "no_due_date").length,
    unreadableAmountCount: aged.filter((r) => r.amount === null).length,
    byAging: AGING_ORDER.filter((b) => groups.has(b)).map((b) => groups.get(b)!),
    rows: aged,
  };
}
