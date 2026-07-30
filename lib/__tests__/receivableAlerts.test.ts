import { describe, it, expect } from "vitest";
import { parseInvoiceLedger, type InvoiceLedgerRow } from "../readModel/invoiceLedger";
import {
  ALERTING_BUCKETS,
  buildReceivableAlerts,
  headlineFor,
  severityFor,
} from "../rep/receivableAlerts";

/** The real `invoices/invoice-ledger.csv` (contracts repo), verbatim — the same fixture the
 *  parser and sync suites pin. Q81 exists because of the first row, so it is tested on the
 *  first row and not on an invented one. */
const REAL_LEDGER = `invoice_number,issue_date,iso_week,client_slug,client_legal_name,owner,scope_summary,amount,currency,status,pdf
MLE-2026-100122,2026-06-26,2026-W26,cg_roofing,CG Roofing and Waterproofing LLC and Red Rock Roofing LLC,Caleb,CG Roofing and Waterproofing LLC: Main Website (500pp) + Living Second Brain; Red Rock Roofing LLC: Main Website (500pp) + Living Second Brain,10000.00,USD,"issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",invoices/Phase 1 Invoice - CG Roofing & Red Rock Roofing - MLE-2026-100122.pdf
MLE-2026-100123,2026-07-16,2026-W29,gulf_coast,Gulf Coast RE Group,,"Gulf Coast RE Group: Main Website (2,000pp) + Living Second Brain + 60 agent sites/brains/social",19000.00,USD,paid 2026-07-16 (check),invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf
`;

const TODAY = "2026-07-30";

function row(over: Partial<InvoiceLedgerRow> = {}): InvoiceLedgerRow {
  return {
    invoiceNumber: "MLE-2026-100200",
    issueDate: "2026-07-01",
    clientSlug: "acme",
    clientLegalName: "Acme LLC",
    owner: null,
    amount: 1000,
    currency: "USD",
    statusText: "issued — due by 2026-07-20",
    paymentState: "outstanding",
    dueDate: "2026-07-20",
    paymentPlanNote: null,
    pdf: null,
    ...over,
  };
}

describe("rep receivable alerts — the real ledger", () => {
  const rows = parseInvoiceLedger(REAL_LEDGER);

  it("raises exactly one alert, on the row that was being nagged about daily", () => {
    const { alerts } = buildReceivableAlerts(rows, TODAY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].clientSlug).toBe("cg_roofing");
    expect(alerts[0].invoiceNumber).toBe("MLE-2026-100122");
    expect(alerts[0].dueDate).toBe("2026-07-24");
    expect(alerts[0].daysOverdue).toBe(6);
    expect(alerts[0].bucket).toBe("overdue_1_30");
    expect(alerts[0].severity).toBe("medium");
    expect(alerts[0].headline).toBe("cg_roofing — payment 6 days overdue");
  });

  it("never carries an amount — the withheld ledger column cannot reach a rep screen", () => {
    const { alerts } = buildReceivableAlerts(rows, TODAY);
    // Structural, not cosmetic: `amount`/`paymentPlanNote`/`clientLegalName` are all denied to
    // mle_rep_read in roleGrants.ts, so none of them may exist on the alert shape at all.
    for (const alert of alerts) {
      expect(Object.keys(alert).sort()).toEqual([
        "bucket",
        "clientSlug",
        "daysOverdue",
        "dueDate",
        "headline",
        "invoiceNumber",
        "severity",
      ]);
    }
  });

  it("says nothing about the paid invoice", () => {
    const { alerts } = buildReceivableAlerts(rows, TODAY);
    expect(alerts.some((a) => a.clientSlug === "gulf_coast")).toBe(false);
  });

  it("scopes to one client for the deal-record case", () => {
    expect(buildReceivableAlerts(rows, TODAY, "cg_roofing").alerts).toHaveLength(1);
    expect(buildReceivableAlerts(rows, TODAY, "gulf_coast").alerts).toHaveLength(0);
    // The ledger slug is not what a URL carries, so matching is case/space tolerant.
    expect(buildReceivableAlerts(rows, TODAY, " CG_Roofing ").alerts).toHaveLength(1);
  });

  it("was silent before the due date passed", () => {
    expect(buildReceivableAlerts(rows, "2026-07-23").alerts).toHaveLength(0);
    // Due today is not late yet — a rep chased on the due date is a rep who stops trusting it.
    expect(buildReceivableAlerts(rows, "2026-07-24").alerts).toHaveLength(0);
    expect(buildReceivableAlerts(rows, "2026-07-25").alerts).toHaveLength(1);
  });
});

describe("rep receivable alerts — what it refuses to assert", () => {
  it("counts an unclassifiable status instead of calling it late", () => {
    const result = buildReceivableAlerts(
      [row({ paymentState: "unknown", statusText: "waiting on Caleb" })],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
    expect(result.unclassifiedCount).toBe(1);
  });

  it("counts a missing due date instead of calling it late", () => {
    const result = buildReceivableAlerts([row({ dueDate: null })], TODAY);
    expect(result.alerts).toHaveLength(0);
    expect(result.noDueDateCount).toBe(1);
    // The two skip reasons are reported separately — they are different claims.
    expect(result.unclassifiedCount).toBe(0);
  });

  it("does not count a paid invoice as a skip", () => {
    const result = buildReceivableAlerts([row({ paymentState: "paid" })], TODAY);
    expect(result).toEqual({ alerts: [], unclassifiedCount: 0, noDueDateCount: 0 });
  });
});

describe("rep receivable alerts — ordering and severity", () => {
  it("is worst-first, and ties break deterministically", () => {
    const { alerts } = buildReceivableAlerts(
      [
        row({ invoiceNumber: "B", clientSlug: "b", dueDate: "2026-07-28" }),
        row({ invoiceNumber: "C", clientSlug: "c", dueDate: "2026-05-01" }),
        row({ invoiceNumber: "A", clientSlug: "a", dueDate: "2026-07-28" }),
      ],
      TODAY
    );
    expect(alerts.map((a) => a.invoiceNumber)).toEqual(["C", "A", "B"]);
  });

  it("escalates past 60 days", () => {
    expect(severityFor("overdue_1_30")).toBe("medium");
    expect(severityFor("overdue_31_60")).toBe("medium");
    expect(severityFor("overdue_60_plus")).toBe("high");
    const { alerts } = buildReceivableAlerts([row({ dueDate: "2026-01-01" })], TODAY);
    expect(alerts[0].severity).toBe("high");
    expect(alerts[0].bucket).toBe("overdue_60_plus");
  });

  it("alerts on every overdue bucket the aging vocabulary defines, and only those", () => {
    expect([...ALERTING_BUCKETS]).toEqual([
      "overdue_60_plus",
      "overdue_31_60",
      "overdue_1_30",
    ]);
  });

  it("says day, not days, once", () => {
    expect(headlineFor("acme", 1)).toBe("acme — payment 1 day overdue");
    expect(headlineFor("acme", 2)).toBe("acme — payment 2 days overdue");
  });
});
