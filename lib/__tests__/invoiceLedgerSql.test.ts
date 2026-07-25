import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LEDGER_COLUMNS, parseInvoiceLedger } from "../readModel/invoiceLedger";
import { TRACKED_FIELDS, buildProvenance } from "../readModel/ledgerSync";
import { READ_MODELS } from "../readModel/contract";

// MC.9 half 2: the sync's destination is DDL, so it gets the same parsed-and-
// compared treatment 0011 gets. The guarantee this file buys: a field can never
// exist on `SyncedInvoiceRow` in TypeScript with nowhere to land in Postgres.
// Without it, adding a ledger column would look like it worked and would drop
// that column's value on every sync, silently, on a money panel.

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0012_invoice_ledger.sql"),
  "utf8",
);

/** Column names declared inside `create table if not exists <name> ( ... );` */
function tableColumns(name: string): string[] {
  const header = `create table if not exists ${name} (`;
  const start = SQL.indexOf(header);
  if (start === -1) throw new Error(`table not found in migration: ${name}`);
  const body = SQL.slice(start + header.length);
  const decl = body.slice(0, body.indexOf("\n);"));
  return decl
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => /^[a-z_][a-z0-9_]*\s+\S/.test(line))
    // Table-level constraints start with a keyword, not a column name.
    .filter((line) => !/^(check|primary|unique|foreign|constraint)\b/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

const snake = (camel: string) => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const LEDGER = tableColumns("invoice_ledger");
const RUNS = tableColumns("invoice_ledger_sync_runs");

describe("0012_invoice_ledger.sql holds every field the sync writes", () => {
  it("has a column for each tracked ledger field", () => {
    // TRACKED_FIELDS is what the diff compares; a tracked field with no column
    // would be diffed, reported as changed, then thrown away on write.
    for (const field of TRACKED_FIELDS) {
      expect(LEDGER, `tracked field ${field} has no column`).toContain(snake(field));
    }
  });

  it("keys rows on invoice_number, the ledger's own key", () => {
    expect(LEDGER).toContain("invoice_number");
    expect(SQL).toMatch(/invoice_number\s+text primary key/);
  });

  it("carries the provenance tag, with the commit as the only nullable part", () => {
    for (const col of ["source_sha256", "synced_at", "source_commit"]) {
      expect(LEDGER).toContain(col);
    }
    // An untagged row looks current forever — digest and time are required.
    expect(SQL).toMatch(/source_sha256\s+text\s+not null/);
    expect(SQL).toMatch(/synced_at\s+timestamptz not null/);
    // A dirty working tree is a real read; the commit is recorded as null, not faked.
    expect(SQL).not.toMatch(/source_commit\s+text\s+not null/);
  });

  it("marks departures instead of deleting them", () => {
    expect(LEDGER).toContain("withdrawn_at");
    expect(SQL).not.toMatch(/\bdelete from invoice_ledger\b/i);
    expect(SQL).not.toMatch(/\bon delete cascade\b/i);
  });

  it("stores no derived money field the parser deliberately refuses to compute", () => {
    // invoiceLedger.ts carries split-payment plans as prose precisely so no
    // fabricated balance reaches a panel. A column here would invite one back.
    for (const forbidden of ["balance", "amount_paid", "amount_due", "remaining", "outstanding_amount"]) {
      expect(LEDGER, `forbidden derived column ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("lets an unreadable amount stay null rather than becoming zero", () => {
    expect(SQL).toMatch(/amount\s+numeric\(14,2\)(?!\s+not null)/);
  });

  it("constrains payment_state to the parser's three honest states", () => {
    expect(SQL).toMatch(/payment_state in \('paid','outstanding','unknown'\)/);
  });

  it("logs every run, including the ones that refused to write", () => {
    for (const col of [
      "content_sha256", "source_commit", "synced_at", "row_count",
      "refusal_reason", "added", "changed", "withdrawn", "unchanged",
      "material", "conflicts", "requires_review", "conflict_detail",
    ]) {
      expect(RUNS, `sync-run column ${col} missing`).toContain(col);
    }
    // A refusal is a sentence a reader gets shown, so it must be nullable-text,
    // not a boolean that loses the reason.
    expect(SQL).toMatch(/refusal_reason\s+text\b/);
    expect(SQL).not.toMatch(/refusal_reason\s+boolean/);
  });

  it("enables RLS on both tables — money data gets no public read", () => {
    expect(SQL).toMatch(/alter table invoice_ledger\s+enable row level security/);
    expect(SQL).toMatch(/alter table invoice_ledger_sync_runs enable row level security/);
    expect(SQL).not.toMatch(/to anon\b/);
    expect(SQL).not.toMatch(/to authenticated\b/);
  });

  it("creates the table only — the view stayed out of this migration", () => {
    // 0012 deliberately shipped the destination WITHOUT the read model: a view
    // over an empty table is how a fake fifth panel ships. `rm_invoices_ar`
    // waited for 0013, after the sync had actually run and prod held Rob's real
    // invoices. Keeping this assertion means the ordering can't be collapsed in
    // hindsight by someone tidying migrations together.
    expect(SQL).not.toMatch(/create (or replace )?view rm_invoices_ar/);
    const ar = READ_MODELS.find((m) => m.id === "rm_invoices_ar");
    expect(ar?.coverage).toBe("buildable_now");
    expect(ar?.sourceTables).toEqual(["invoice_ledger"]);
  });

  it("accepts a provenance tag built from this table's own constraints", () => {
    // Same digest/commit shapes on both sides of the wire.
    const tag = buildProvenance({
      sourceRepo: "MyLocalEverything/contracts",
      sourcePath: "invoices/invoice-ledger.csv",
      contentSha256: "a".repeat(64),
      sourceCommit: "0123456abcdef",
      syncedAt: "2026-07-25T00:00:00Z",
      rowCount: 2,
    });
    expect(tag.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(tag.sourceCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("can hold the real ledger as it stands today", () => {
    // Not a schema opinion — an actual round-trip shape check against the file
    // the runner will read, so a column that is `not null` here cannot be null
    // in Rob's live CSV.
    const csv = readFileSync(
      path.join(process.cwd(), "..", "contracts", "invoices", "invoice-ledger.csv"),
      "utf8",
    );
    const rows = parseInvoiceLedger(csv);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const field of ["invoiceNumber", "issueDate", "clientSlug", "clientLegalName", "currency", "statusText"] as const) {
        expect(row[field], `${field} is NOT NULL in 0012 but empty in the live ledger`).toBeTruthy();
      }
    }
    // The header the parser pins must still be the header the file carries.
    expect(csv.split("\n")[0].split(",").map((c) => c.trim())).toEqual([...LEDGER_COLUMNS]);
  });
});
