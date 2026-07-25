import { describe, it, expect } from "vitest";
import { parseInvoiceLedger, type InvoiceLedgerRow } from "../readModel/invoiceLedger";
import {
  buildProvenance,
  planLedgerSync,
  describeSyncPlan,
  TRACKED_FIELDS,
  MATERIAL_FIELDS,
  type LedgerProvenance,
} from "../readModel/ledgerSync";

/** The real `invoices/invoice-ledger.csv` (contracts repo), verbatim as of
 *  2026-07-24 — the same fixture the parser suite pins, so the sync is tested
 *  against the actual two invoices prod would receive. */
const REAL_LEDGER = `invoice_number,issue_date,iso_week,client_slug,client_legal_name,owner,scope_summary,amount,currency,status,pdf
MLE-2026-100122,2026-06-26,2026-W26,cg_roofing,CG Roofing and Waterproofing LLC and Red Rock Roofing LLC,Caleb,CG Roofing and Waterproofing LLC: Main Website (500pp) + Living Second Brain; Red Rock Roofing LLC: Main Website (500pp) + Living Second Brain,10000.00,USD,"issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",invoices/Phase 1 Invoice - CG Roofing & Red Rock Roofing - MLE-2026-100122.pdf
MLE-2026-100123,2026-07-16,2026-W29,gulf_coast,Gulf Coast RE Group,,"Gulf Coast RE Group: Main Website (2,000pp) + Living Second Brain + 60 agent sites/brains/social",19000.00,USD,paid 2026-07-16 (check),invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf
`;

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const prov = (over: Partial<LedgerProvenance> = {}): LedgerProvenance => ({
  sourceRepo: "MyLocalEverything/contracts",
  sourcePath: "invoices/invoice-ledger.csv",
  contentSha256: SHA_A,
  sourceCommit: "9f3c1ab",
  syncedAt: "2026-07-24T23:59:00Z",
  rowCount: 2,
  ...over,
});

const real = () => parseInvoiceLedger(REAL_LEDGER);

describe("buildProvenance", () => {
  it("accepts a well-formed tag and trims the source fields", () => {
    const p = buildProvenance(prov({ sourceRepo: "  MyLocalEverything/contracts  " }));
    expect(p.sourceRepo).toBe("MyLocalEverything/contracts");
    expect(p.contentSha256).toBe(SHA_A);
  });

  it("allows a null commit (a dirty tree is a real read) but never a faked one", () => {
    expect(buildProvenance(prov({ sourceCommit: null })).sourceCommit).toBeNull();
    expect(() => buildProvenance(prov({ sourceCommit: "HEAD" }))).toThrow(/sourceCommit/);
  });

  it("throws on a missing or malformed digest — an untagged sync looks current forever", () => {
    expect(() => buildProvenance(prov({ contentSha256: "" }))).toThrow(/sha256/);
    expect(() => buildProvenance(prov({ contentSha256: "deadbeef" }))).toThrow(/sha256/);
  });

  it("throws on a non-ISO syncedAt and on a negative row count", () => {
    expect(() => buildProvenance(prov({ syncedAt: "2026-07-24" }))).toThrow(/syncedAt/);
    expect(() => buildProvenance(prov({ rowCount: -1 }))).toThrow(/rowCount/);
  });

  it("throws when the source is unnamed", () => {
    expect(() => buildProvenance(prov({ sourcePath: "  " }))).toThrow(/sourcePath/);
    expect(() => buildProvenance(prov({ sourceRepo: "" }))).toThrow(/sourceRepo/);
  });
});

describe("planLedgerSync — first run", () => {
  it("adds both real invoices and stamps every write with the provenance", () => {
    const plan = planLedgerSync([], real(), prov());
    expect(plan.refusalReason).toBeNull();
    expect(plan.summary).toMatchObject({ added: 2, changed: 0, withdrawn: 0, unchanged: 0 });
    expect(plan.writes.map((w) => w.invoiceNumber)).toEqual([
      "MLE-2026-100122",
      "MLE-2026-100123",
    ]);
    for (const w of plan.writes) {
      expect(w.sourceSha256).toBe(SHA_A);
      expect(w.sourceCommit).toBe("9f3c1ab");
      expect(w.syncedAt).toBe("2026-07-24T23:59:00Z");
      expect(w.withdrawnAt).toBeNull();
    }
  });

  it("a first run of new rows needs no review — nothing changed under anyone", () => {
    expect(planLedgerSync([], real(), prov()).requiresReview).toBe(false);
  });
});

describe("planLedgerSync — steady state", () => {
  it("writes nothing when the file is byte-identical in content", () => {
    const plan = planLedgerSync(real(), real(), prov({ contentSha256: SHA_B }));
    expect(plan.writes).toEqual([]);
    expect(plan.summary).toMatchObject({ unchanged: 2, added: 0, changed: 0 });
    expect(plan.requiresReview).toBe(false);
  });

  it("flags a payment-state change as material and needing review", () => {
    const before = real();
    const after = parseInvoiceLedger(
      REAL_LEDGER.replace(
        '"issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)"',
        "paid 2026-07-25 (wire)"
      )
    );
    const plan = planLedgerSync(before, after, prov());
    expect(plan.summary).toMatchObject({ changed: 1, material: 1, unchanged: 1 });
    const change = plan.changes.find((c) => c.kind === "changed");
    expect(change).toBeDefined();
    if (change?.kind !== "changed") throw new Error("expected a changed entry");
    expect(change.material).toBe(true);
    expect(change.fields.map((f) => f.field).sort()).toEqual(
      ["dueDate", "paymentPlanNote", "paymentState", "statusText"].sort()
    );
    expect(plan.requiresReview).toBe(true);
  });

  it("a non-money edit is a change but not material", () => {
    const before = real();
    const after = before.map((r) =>
      r.invoiceNumber === "MLE-2026-100123" ? { ...r, owner: "Rob" } : r
    );
    const plan = planLedgerSync(before, after, prov());
    expect(plan.summary).toMatchObject({ changed: 1, material: 0 });
    expect(plan.requiresReview).toBe(false);
  });
});

describe("planLedgerSync — the conservative rules", () => {
  it("marks a vanished invoice as withdrawn and never deletes it", () => {
    const before = real();
    const after = before.filter((r) => r.invoiceNumber !== "MLE-2026-100122");
    const plan = planLedgerSync(before, after, prov({ rowCount: 1 }));
    expect(plan.withdrawals).toEqual([
      { invoiceNumber: "MLE-2026-100122", withdrawnAt: "2026-07-24T23:59:00Z" },
    ]);
    expect(plan.writes).toEqual([]);
    expect(plan.requiresReview).toBe(true);
    expect(plan.changes.some((c) => c.kind === "withdrawn")).toBe(true);
  });

  it("REFUSES an empty read against a non-empty store — that is a failed read, not an emptied ledger", () => {
    const plan = planLedgerSync(real(), [], prov({ rowCount: 0 }));
    expect(plan.refusalReason).toMatch(/failed read/);
    expect(plan.writes).toEqual([]);
    expect(plan.withdrawals).toEqual([]);
    expect(plan.summary.withdrawn).toBe(0);
    expect(plan.requiresReview).toBe(true);
  });

  it("an empty read against an empty store is allowed (genuinely nothing yet)", () => {
    const plan = planLedgerSync([], [], prov({ rowCount: 0 }));
    expect(plan.refusalReason).toBeNull();
    expect(plan.writes).toEqual([]);
  });

  it("holds back BOTH lines of a duplicated invoice number instead of letting one win", () => {
    const dupe = REAL_LEDGER + REAL_LEDGER.split("\n")[1] + "\n";
    const plan = planLedgerSync([], parseInvoiceLedger(dupe), prov({ rowCount: 3 }));
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      invoiceNumber: "MLE-2026-100122",
      reason: "duplicate_invoice_number",
    });
    expect(plan.writes.map((w) => w.invoiceNumber)).toEqual(["MLE-2026-100123"]);
    expect(plan.requiresReview).toBe(true);
  });

  it("holds back an unkeyed row rather than inventing an id for it", () => {
    const unkeyed: InvoiceLedgerRow = { ...real()[0], invoiceNumber: "  " };
    const plan = planLedgerSync([], [unkeyed], prov({ rowCount: 1 }));
    expect(plan.conflicts[0]?.reason).toBe("missing_invoice_number");
    expect(plan.writes).toEqual([]);
  });

  it("a withheld duplicate does not read as a withdrawal of the stored row", () => {
    const stored = real();
    const dupe = REAL_LEDGER + REAL_LEDGER.split("\n")[1] + "\n";
    const plan = planLedgerSync(stored, parseInvoiceLedger(dupe), prov({ rowCount: 3 }));
    // 100122 was held back as a conflict — present but unreadable. That is NOT
    // the same claim as "the ledger dropped it", so it must not be withdrawn.
    expect(plan.conflicts[0]?.invoiceNumber).toBe("MLE-2026-100122");
    expect(plan.withdrawals).toEqual([]);
    expect(plan.summary.withdrawn).toBe(0);
    expect(plan.requiresReview).toBe(true);
  });
});

describe("field coverage", () => {
  it("every material field is a tracked field", () => {
    for (const f of MATERIAL_FIELDS) expect(TRACKED_FIELDS).toContain(f);
  });

  it("tracks every ledger field except the key itself — a new field cannot be silently ignored", () => {
    const rowKeys = Object.keys(real()[0]).filter((k) => k !== "invoiceNumber");
    expect([...TRACKED_FIELDS].sort()).toEqual(rowKeys.sort());
  });
});

describe("describeSyncPlan", () => {
  it("names the source, the digest and the run in one line", () => {
    const line = describeSyncPlan(planLedgerSync([], real(), prov()));
    expect(line).toContain("+2 added");
    expect(line).toContain("MyLocalEverything/contracts/invoices/invoice-ledger.csv@9f3c1ab");
    expect(line).toContain("2026-07-24T23:59:00Z");
  });

  it("says NO WRITE out loud when the run refused", () => {
    const line = describeSyncPlan(planLedgerSync(real(), [], prov({ rowCount: 0 })));
    expect(line).toMatch(/^NO WRITE — /);
  });

  it("shows an uncommitted read as uncommitted rather than blank", () => {
    const line = describeSyncPlan(planLedgerSync([], real(), prov({ sourceCommit: null })));
    expect(line).toContain("@uncommitted");
  });
});
