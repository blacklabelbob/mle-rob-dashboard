import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseInvoiceLedger,
  classifyStatus,
  extractDueDate,
  extractPlanNote,
  bucketFor,
  daysBetweenISO,
  buildInvoicesArPanel,
  LEDGER_COLUMNS,
} from "../readModel/invoiceLedger";

/** The real `invoices/invoice-ledger.csv` from the contracts repo, verbatim as
 *  of 2026-07-24 (GATE G3's only live invoicing store). Pinned here so the
 *  parser is tested against the actual prose humans write into it — quoted
 *  cells with embedded commas, an em-dash status, an empty owner. */
const REAL_LEDGER = `invoice_number,issue_date,iso_week,client_slug,client_legal_name,owner,scope_summary,amount,currency,status,pdf
MLE-2026-100122,2026-06-26,2026-W26,cg_roofing,CG Roofing and Waterproofing LLC and Red Rock Roofing LLC,Caleb,CG Roofing and Waterproofing LLC: Main Website (500pp) + Living Second Brain; Red Rock Roofing LLC: Main Website (500pp) + Living Second Brain,10000.00,USD,"issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",invoices/Phase 1 Invoice - CG Roofing & Red Rock Roofing - MLE-2026-100122.pdf
MLE-2026-100123,2026-07-16,2026-W29,gulf_coast,Gulf Coast RE Group,,"Gulf Coast RE Group: Main Website (2,000pp) + Living Second Brain + 60 agent sites/brains/social",19000.00,USD,paid 2026-07-16 (check),invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf
`;

describe("parseCsv", () => {
  it("keeps commas inside quoted cells instead of shearing the row", () => {
    const rows = parseCsv(`a,b,c\n1,"two, and a half",3\n`);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "two, and a half", "3"],
    ]);
  });

  it("unescapes doubled quotes and does not invent a row for a trailing newline", () => {
    expect(parseCsv(`x\n"he said ""hi"""\n`)).toEqual([["x"], ['he said "hi"']]);
  });
});

describe("parseInvoiceLedger — against the real ledger", () => {
  const rows = parseInvoiceLedger(REAL_LEDGER);

  it("reads both invoices with their amounts intact", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0].invoiceNumber).toBe("MLE-2026-100122");
    expect(rows[0].amount).toBe(10000);
    expect(rows[1].invoiceNumber).toBe("MLE-2026-100123");
    expect(rows[1].amount).toBe(19000);
  });

  it("classifies only what the status text explicitly says", () => {
    expect(rows[0].paymentState).toBe("outstanding");
    expect(rows[1].paymentState).toBe("paid");
  });

  it("pulls the stated due date out of free-text status prose", () => {
    expect(rows[0].dueDate).toBe("2026-07-24");
  });

  it("carries a split-payment plan VERBATIM and never as arithmetic", () => {
    // The whole point: $10,000 stays $10,000. A parsed "$5,000 balance" would
    // be a fabricated number on a money panel.
    expect(rows[0].paymentPlanNote).toContain("2 x $5,000");
    expect(rows[0].amount).toBe(10000);
    expect(rows[1].paymentPlanNote).toBeNull();
  });

  it("keeps an empty owner cell null rather than an empty string", () => {
    expect(rows[1].owner).toBeNull();
  });

  it("throws — loudly — if the ledger loses a promised column", () => {
    const maimed = REAL_LEDGER.replace("amount,", "amt,");
    expect(() => parseInvoiceLedger(maimed)).toThrow(/missing the `amount` column/);
  });

  it("pins the ledger's column list", () => {
    expect(LEDGER_COLUMNS).toContain("status");
    expect(LEDGER_COLUMNS).toContain("amount");
  });
});

describe("classifyStatus / extract helpers", () => {
  it("never guesses at unrecognised status prose", () => {
    expect(classifyStatus("under review with counsel")).toBe("unknown");
    expect(classifyStatus("")).toBe("unknown");
  });

  it("does not read 'paid' out of a promise to pay", () => {
    // "will be paid" is not payment. Only a leading/explicit paid claim counts.
    expect(classifyStatus("issued — client says it will be paid next week")).toBe(
      "outstanding"
    );
  });

  it("returns null when no due date is stated", () => {
    expect(extractDueDate("issued, no terms agreed")).toBeNull();
    expect(extractPlanNote("paid 2026-07-16 (check)")).toBeNull();
  });
});

describe("aging", () => {
  const base = parseInvoiceLedger(REAL_LEDGER)[0];

  it("counts whole days without timezone drift", () => {
    expect(daysBetweenISO("2026-07-24", "2026-07-24")).toBe(0);
    expect(daysBetweenISO("2026-07-24", "2026-07-25")).toBe(1);
  });

  it("buckets by the stated due date", () => {
    expect(bucketFor(base, "2026-07-23")).toBe("not_yet_due");
    expect(bucketFor(base, "2026-07-24")).toBe("due_today");
    expect(bucketFor(base, "2026-08-01")).toBe("overdue_1_30");
    expect(bucketFor(base, "2026-09-01")).toBe("overdue_31_60");
    expect(bucketFor(base, "2026-12-01")).toBe("overdue_60_plus");
  });

  it("files a missing due date in its OWN bucket, never as 'not yet due'", () => {
    const undated = { ...base, dueDate: null };
    expect(bucketFor(undated, "2026-07-24")).toBe("no_due_date");
  });

  it("does not age a paid invoice", () => {
    const paid = parseInvoiceLedger(REAL_LEDGER)[1];
    expect(bucketFor(paid, "2027-01-01")).toBe("paid");
  });
});

describe("buildInvoicesArPanel", () => {
  const rows = parseInvoiceLedger(REAL_LEDGER);
  const panel = buildInvoicesArPanel(rows, "2026-07-24");

  it("totals outstanding at the FULL invoice amount, split plan and all", () => {
    expect(panel.outstandingTotal).toBe(10000);
    expect(panel.paidTotal).toBe(19000);
  });

  it("surfaces the honest counts rather than burying them", () => {
    expect(panel.unclassifiedCount).toBe(0);
    expect(panel.noDueDateCount).toBe(0);
    expect(panel.unreadableAmountCount).toBe(0);
  });

  it("orders aging worst-first and reports 100122 as due today", () => {
    expect(panel.byAging.map((g) => g.bucket)).toEqual(["due_today", "paid"]);
    expect(panel.byAging[0]).toMatchObject({ count: 1, amount: 10000 });
  });

  it("excludes an unreadable amount from totals and counts it instead of zeroing it", () => {
    const broken = buildInvoicesArPanel(
      [{ ...rows[0], amount: null }, rows[1]],
      "2026-07-24"
    );
    expect(broken.outstandingTotal).toBe(0);
    expect(broken.unreadableAmountCount).toBe(1);
    expect(broken.byAging.find((g) => g.bucket === "due_today")!.unreadableAmounts).toBe(1);
  });

  it("stays `unavailable` until MC.9's ingest half lands — shaping rows earns no claim of live", () => {
    // The header comes from the MC.8 contract, not from the row count. Until
    // the CSV actually reaches prod, the panel must keep saying so on screen.
    expect(panel.status).toBe("unavailable");
    expect(panel.unblockedBy).toMatch(/MC\.9/);
  });
});
