import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  createFsLedgerSource,
  createSupabaseLedgerStore,
  fromDbRow,
  readAmount,
  resolveCommit,
  toDbRow,
  toRunRow,
} from "../readModel/ledgerAdapters";
import { parseInvoiceLedger } from "../readModel/invoiceLedger";
import { TRACKED_FIELDS } from "../readModel/ledgerSync";
import type { SyncedInvoiceRow } from "../readModel/ledgerSync";
import type { LedgerRunRecord } from "../readModel/ledgerRunner";

// MC.9 half 2, adapters. The mapping between the domain row and Postgres is the
// one place a money field can vanish without anything erroring: a dropped key
// writes NULL, which reads as "this invoice has no due date" rather than as a
// bug. So the mapping is pinned against the DDL itself, not against a hand copy
// of it, and the numeric round-trip is pinned against the "" → 0 trap.

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0012_invoice_ledger.sql"),
  "utf8",
);

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
    .filter((line) => !/^(check|primary|unique|foreign|constraint)\b/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

const LEDGER_COLS = tableColumns("invoice_ledger");
const RUN_COLS = tableColumns("invoice_ledger_sync_runs");
const snake = (camel: string) => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const ROW: SyncedInvoiceRow = {
  invoiceNumber: "MLE-2026-100122",
  issueDate: "2026-07-11",
  clientSlug: "cg-roofing",
  clientLegalName: "CG Roofing & Red Rock Roofing",
  owner: "Rob",
  amount: 10000,
  currency: "USD",
  statusText: "Issued — split-payment: 2 x $5,000, first due by 2026-07-25",
  paymentState: "outstanding",
  dueDate: "2026-07-25",
  paymentPlanNote: "Issued — split-payment: 2 x $5,000, first due by 2026-07-25",
  pdf: "invoices/Phase 1 Invoice.pdf",
  sourceSha256: "a".repeat(64),
  sourceCommit: "2257fc4",
  syncedAt: "2026-07-25T04:00:00.000Z",
  withdrawnAt: null,
};

const RECORD: LedgerRunRecord = {
  provenance: {
    sourceRepo: "MyLocalEverything/contracts",
    sourcePath: "invoices/invoice-ledger.csv",
    contentSha256: "b".repeat(64),
    sourceCommit: null,
    syncedAt: "2026-07-25T04:00:00.000Z",
    rowCount: 3,
  },
  refusalReason: null,
  summary: { added: 1, changed: 2, withdrawn: 0, unchanged: 4, material: 2, conflicts: 0 },
  requiresReview: false,
  conflicts: [],
};

describe("toDbRow lands every field the diff tracks", () => {
  it("emits only columns that exist in 0012", () => {
    for (const key of Object.keys(toDbRow(ROW))) {
      expect(LEDGER_COLS, `toDbRow writes unknown column ${key}`).toContain(key);
    }
  });

  it("carries every tracked ledger field into a column", () => {
    // A tracked field missing here is diffed, reported as changed, then written
    // as NULL — the invoice quietly loses that cell on the panel.
    const written = toDbRow(ROW);
    for (const field of TRACKED_FIELDS) {
      expect(written, `tracked field ${field} is not written`).toHaveProperty(snake(field));
    }
  });

  it("carries the provenance tag and the withdrawal mark", () => {
    const written = toDbRow(ROW);
    expect(written.source_sha256).toBe("a".repeat(64));
    expect(written.source_commit).toBe("2257fc4");
    expect(written.synced_at).toBe("2026-07-25T04:00:00.000Z");
    expect(written.withdrawn_at).toBeNull();
  });

  it("never writes a computed money field", () => {
    // Half 1 refuses arithmetic on a prose payment plan; a balance key here
    // would smuggle the fabricated number back in.
    const written = toDbRow(ROW);
    for (const forbidden of ["balance", "amount_due", "amount_paid", "remaining"]) {
      expect(written).not.toHaveProperty(forbidden);
    }
  });

  it("keeps the plan note verbatim rather than splitting it", () => {
    expect(toDbRow(ROW).payment_plan_note).toBe(ROW.statusText);
    expect(toDbRow(ROW).amount).toBe(10000);
  });
});

describe("readAmount refuses to invent a number", () => {
  it("parses the string PostgREST returns for numeric", () => {
    expect(readAmount("10000.00")).toBe(10000);
    expect(readAmount(" 2000 ")).toBe(2000);
    expect(readAmount(2000)).toBe(2000);
  });

  it("returns null — never 0 — for anything unreadable", () => {
    // Number("") === 0: an unreadable amount would become a real $0.00 balance.
    for (const bad of ["", "   ", "TBD", null, undefined, {}, Number.NaN]) {
      expect(readAmount(bad), `readAmount(${JSON.stringify(bad)})`).toBeNull();
    }
  });
});

describe("fromDbRow round-trips what the store holds", () => {
  it("returns the same domain row it wrote", () => {
    const db = toDbRow(ROW);
    const back = fromDbRow({ ...db, amount: "10000.00" });
    for (const field of TRACKED_FIELDS) {
      expect(back[field], `field ${field} did not round-trip`).toEqual(ROW[field]);
    }
    expect(back.invoiceNumber).toBe(ROW.invoiceNumber);
  });

  it("reads an off-vocabulary payment state as unknown, not as paid", () => {
    expect(fromDbRow({ ...toDbRow(ROW), payment_state: "probably" }).paymentState).toBe("unknown");
    expect(fromDbRow({ ...toDbRow(ROW), payment_state: "paid" }).paymentState).toBe("paid");
  });

  it("treats an empty optional cell as absent, not as an empty string", () => {
    const back = fromDbRow({ ...toDbRow(ROW), due_date: null, owner: "", pdf: null });
    expect(back.dueDate).toBeNull();
    expect(back.owner).toBeNull();
    expect(back.pdf).toBeNull();
  });
});

describe("toRunRow records the run, refusals included", () => {
  it("emits only columns that exist in 0012", () => {
    for (const key of Object.keys(toRunRow(RECORD))) {
      expect(RUN_COLS, `toRunRow writes unknown column ${key}`).toContain(key);
    }
  });

  it("keeps the refusal sentence and the review flag", () => {
    const refused = toRunRow({
      ...RECORD,
      refusalReason: "empty read against a non-empty store",
      requiresReview: true,
    });
    expect(refused.refusal_reason).toBe("empty read against a non-empty store");
    expect(refused.requires_review).toBe(true);
    // Digest and instant are NOT NULL in Postgres for exactly this row.
    expect(refused.content_sha256).toBe("b".repeat(64));
    expect(refused.synced_at).toBe("2026-07-25T04:00:00.000Z");
  });

  it("records a null commit as null rather than as a nearby revision", () => {
    expect(toRunRow(RECORD).source_commit).toBeNull();
  });

  it("mirrors the plan summary instead of recomputing it", () => {
    expect(toRunRow(RECORD)).toMatchObject({
      added: 1,
      changed: 2,
      withdrawn: 0,
      unchanged: 4,
      material: 2,
      conflicts: 0,
      row_count: 3,
    });
  });
});

// ── The real read, when the contracts repo is checked out beside us ─────────

const CONTRACTS_DIR = path.join(process.cwd(), "..", "contracts");
const LEDGER_PATH = "invoices/invoice-ledger.csv";
const hasContracts = existsSync(path.join(CONTRACTS_DIR, LEDGER_PATH));

// Skipped rather than failed when the sibling repo is absent (CI, a fresh
// clone): the sync is a local job by design — the contracts repo is not
// deployed with the dashboard, which is the whole reason this seam exists.
describe.skipIf(!hasContracts)("createFsLedgerSource against Rob's live ledger", () => {
  it("produces a digest-shaped tag and a parseable file", async () => {
    const source = createFsLedgerSource({ repoDir: CONTRACTS_DIR, sourcePath: LEDGER_PATH });
    const read = await source.read();
    expect(read.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Same bytes → same digest, or provenance means nothing.
    expect((await source.read()).sha256).toBe(read.sha256);
    // A commit is either absent (dirty tree / no git) or genuinely commit-shaped;
    // the migration's CHECK rejects anything else.
    expect(read.commit === null || /^[0-9a-f]{7,40}$/.test(read.commit)).toBe(true);
    expect(parseInvoiceLedger(read.text).length).toBeGreaterThan(0);
  });

  it("reports no commit rather than a wrong one when git cannot answer", () => {
    expect(resolveCommit(path.join(process.cwd(), "..", "definitely-not-a-repo"), LEDGER_PATH)).toBeNull();
  });
});

// ── Store port behaviour, against a fake supabase client ─────────────────────

type Call = { table: string; op: string; payload: unknown };

function fakeClient(opts: { selectData?: unknown[]; error?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const err = (op: string) => (opts.error?.[op] ? { message: opts.error[op] } : null);
  const client = {
    from(table: string) {
      return {
        select() {
          calls.push({ table, op: "select", payload: null });
          return Promise.resolve({ data: opts.selectData ?? [], error: err("select") });
        },
        upsert(payload: unknown) {
          calls.push({ table, op: "upsert", payload });
          return Promise.resolve({ error: err("upsert") });
        },
        insert(payload: unknown) {
          calls.push({ table, op: "insert", payload });
          return Promise.resolve({ error: err("insert") });
        },
        update(payload: unknown) {
          return {
            eq(_col: string, value: string) {
              calls.push({ table, op: "update", payload: { value, patch: payload } });
              return Promise.resolve({ error: err("update") });
            },
          };
        },
        // The port must not offer one; asserted below.
        delete: undefined,
      };
    },
  };
   
  return { store: createSupabaseLedgerStore(client as any), calls };
}

describe("the supabase store port", () => {
  it("loads withdrawn rows too, so a reappearing invoice is not 'new'", async () => {
    const { store, calls } = fakeClient({
      selectData: [{ ...toDbRow({ ...ROW, withdrawnAt: "2026-07-20T00:00:00.000Z" }) }],
    });
    const rows = await store.loadStored();
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiceNumber).toBe(ROW.invoiceNumber);
    // No filter on withdrawn_at anywhere in the read.
    expect(calls[0]).toMatchObject({ table: "invoice_ledger", op: "select" });
  });

  it("throws — never returns empty — when the load fails", async () => {
    const { store } = fakeClient({ error: { select: "connection reset" } });
    // An empty array here would make the runner withdraw every invoice in prod.
    await expect(store.loadStored()).rejects.toThrow(/connection reset/);
  });

  it("marks withdrawals instead of deleting them", async () => {
    const { store, calls } = fakeClient();
    await store.applyPlan([ROW], [{ invoiceNumber: "MLE-2026-100119", withdrawnAt: "2026-07-25T04:00:00.000Z" }]);
    expect(calls.map((c) => c.op)).toEqual(["upsert", "update"]);
    expect(calls[1].payload).toMatchObject({
      value: "MLE-2026-100119",
      patch: { withdrawn_at: "2026-07-25T04:00:00.000Z" },
    });
  });

  it("names the invoice a withdrawal stopped on", async () => {
    const { store } = fakeClient({ error: { update: "permission denied" } });
    await expect(
      store.applyPlan([], [{ invoiceNumber: "MLE-2026-100119", withdrawnAt: "2026-07-25T04:00:00.000Z" }]),
    ).rejects.toThrow(/MLE-2026-100119.*permission denied/);
  });

  it("writes nothing at all when the plan is empty", async () => {
    const { store, calls } = fakeClient();
    await store.applyPlan([], []);
    expect(calls).toHaveLength(0);
  });

  it("throws when the run row does not land", async () => {
    const { store } = fakeClient({ error: { insert: "timeout" } });
    // The runner turns this into `unrecorded`, loudly — writes under an
    // unrecorded run make the panel's "as of" line unverifiable.
    await expect(store.recordRun(RECORD)).rejects.toThrow(/timeout/);
  });
});
