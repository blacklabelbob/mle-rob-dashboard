import { describe, expect, it } from "vitest";
import { READ_MODELS } from "@/lib/readModel/contract";
import { DENIALS } from "@/lib/security/roleGrants";
import {
  REP_ALERT_COLUMNS,
  newestSyncedAt,
} from "@/lib/rep/receivableAlertsLoad";
import { asOfLabel } from "@/components/RepReceivableAlerts";

// Q81 inc.2 — the guards on the rep's ledger READ. The alert arithmetic is covered in
// receivableAlerts.test.ts; what can go wrong here is different in kind: a column that does
// not exist reads back as null (a wrong panel, not an error), and a widened select would pull
// withheld money into a rep page's server render.

const AR = READ_MODELS.find((m) => m.id === "rm_invoices_ar")!;

describe("REP_ALERT_COLUMNS", () => {
  it("every requested column exists on rm_invoices_ar", () => {
    const known = AR.columns.map((c) => c.name);
    for (const col of REP_ALERT_COLUMNS) expect(known).toContain(col);
  });

  it("requests nothing that is denied to mle_rep_read", () => {
    const denied = DENIALS.filter(
      (d) => d.table === "invoice_ledger" && d.roles.includes("mle_rep_read")
    ).map((d) => d.column);
    // amount, client_legal_name, payment_plan_note, status_text — the withheld money and the
    // prose carrying it. Asking for none of them means it never leaves Postgres.
    expect(denied.length).toBeGreaterThan(0);
    for (const col of denied) expect(REP_ALERT_COLUMNS as readonly string[]).not.toContain(col);
  });

  it("carries payment_state and due_date — without them 'late' is not a fact", () => {
    expect(REP_ALERT_COLUMNS).toContain("payment_state");
    expect(REP_ALERT_COLUMNS).toContain("due_date");
  });

  it("carries synced_at, so 'nothing overdue' can never be dateless", () => {
    expect(REP_ALERT_COLUMNS).toContain("synced_at");
  });
});

describe("newestSyncedAt", () => {
  it("takes the newest stamp, not the first row", () => {
    expect(
      newestSyncedAt([
        { synced_at: "2026-07-20T10:00:00Z" },
        { synced_at: "2026-07-29T04:15:00Z" },
        { synced_at: "2026-07-25T00:00:00Z" },
      ])
    ).toBe("2026-07-29T04:15:00Z");
  });

  it("is null on an empty ledger and ignores unusable values", () => {
    expect(newestSyncedAt([])).toBeNull();
    expect(newestSyncedAt([{ synced_at: null }, { synced_at: "" }, { other: 1 }])).toBeNull();
  });
});

describe("asOfLabel", () => {
  it("dates the clean bill of health", () => {
    expect(asOfLabel("2026-07-29T04:15:00Z")).toBe("as of the ledger sync 2026-07-29");
  });

  it("says 'no invoices on file' rather than inventing a date", () => {
    expect(asOfLabel(null)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
