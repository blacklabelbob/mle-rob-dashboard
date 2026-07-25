import { describe, it, expect } from "vitest";
import type { InvoiceLedgerRow } from "../readModel/invoiceLedger";
import {
  runLedgerSync,
  runNeedsAttention,
  type LedgerRunRecord,
  type LedgerRunnerInput,
  type LedgerStorePort,
} from "../readModel/ledgerRunner";
import type { LedgerSyncPlan, SyncedInvoiceRow } from "../readModel/ledgerSync";

/** Rob's real ledger, verbatim (same fixture the parser + sync suites pin). */
const REAL_LEDGER = `invoice_number,issue_date,iso_week,client_slug,client_legal_name,owner,scope_summary,amount,currency,status,pdf
MLE-2026-100122,2026-06-26,2026-W26,cg_roofing,CG Roofing and Waterproofing LLC and Red Rock Roofing LLC,Caleb,CG Roofing and Waterproofing LLC: Main Website (500pp) + Living Second Brain; Red Rock Roofing LLC: Main Website (500pp) + Living Second Brain,10000.00,USD,"issued — split-payment plan approved 2026-07-16 (2 x $5,000, first due by 2026-07-24; Mgmt Change Approval on file)",invoices/Phase 1 Invoice - CG Roofing & Red Rock Roofing - MLE-2026-100122.pdf
MLE-2026-100123,2026-07-16,2026-W29,gulf_coast,Gulf Coast RE Group,,"Gulf Coast RE Group: Main Website (2,000pp) + Living Second Brain + 60 agent sites/brains/social",19000.00,USD,paid 2026-07-16 (check),invoices/paid/Phase 1 Invoice - Gulf Coast RE Group - MLE-2026-100123 (PAID).pdf
`;

const SHA = "a".repeat(64);
const SYNCED_AT = "2026-07-25T04:00:00.000Z";

type Calls = {
  applied: { writes: readonly SyncedInvoiceRow[]; withdrawals: LedgerSyncPlan["withdrawals"] }[];
  recorded: LedgerRunRecord[];
};

function harness(
  opts: {
    text?: string;
    sha256?: string;
    commit?: string | null;
    readThrows?: string;
    loadThrows?: string;
    applyThrows?: string;
    recordThrows?: string;
    stored?: InvoiceLedgerRow[];
  } = {}
): { input: LedgerRunnerInput; calls: Calls } {
  const calls: Calls = { applied: [], recorded: [] };
  const store: LedgerStorePort = {
    async loadStored() {
      if (opts.loadThrows) throw new Error(opts.loadThrows);
      return opts.stored ?? [];
    },
    async applyPlan(writes, withdrawals) {
      if (opts.applyThrows) throw new Error(opts.applyThrows);
      calls.applied.push({ writes, withdrawals });
    },
    async recordRun(record) {
      if (opts.recordThrows) throw new Error(opts.recordThrows);
      calls.recorded.push(record);
    },
  };
  return {
    calls,
    input: {
      source: {
        async read() {
          if (opts.readThrows) throw new Error(opts.readThrows);
          return {
            text: opts.text ?? REAL_LEDGER,
            sha256: opts.sha256 ?? SHA,
            commit: opts.commit === undefined ? "abc1234" : opts.commit,
          };
        },
      },
      store,
      syncedAt: SYNCED_AT,
      sourceRepo: "MyLocalEverything/contracts",
      sourcePath: "invoices/invoice-ledger.csv",
    },
  };
}

describe("runLedgerSync — happy path", () => {
  it("writes both real invoices and records exactly one run", async () => {
    const { input, calls } = harness();
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("applied");
    expect(calls.applied).toHaveLength(1);
    expect(calls.applied[0].writes.map((w) => w.invoiceNumber)).toEqual([
      "MLE-2026-100122",
      "MLE-2026-100123",
    ]);
    expect(calls.recorded).toHaveLength(1);
    expect(calls.recorded[0].refusalReason).toBeNull();
  });

  it("stamps every written row with the read's own provenance", async () => {
    const { input, calls } = harness({ commit: "deadbee" });
    await runLedgerSync(input);
    for (const row of calls.applied[0].writes) {
      expect(row.sourceSha256).toBe(SHA);
      expect(row.sourceCommit).toBe("deadbee");
      expect(row.syncedAt).toBe(SYNCED_AT);
      expect(row.withdrawnAt).toBeNull();
    }
  });

  it("records a null commit as null rather than faking a revision", async () => {
    const { input, calls } = harness({ commit: null });
    await runLedgerSync(input);
    expect(calls.recorded[0].provenance.sourceCommit).toBeNull();
    expect(calls.applied[0].writes[0].sourceCommit).toBeNull();
  });

  it("applies BEFORE recording, so a run row never claims writes that did not land", async () => {
    const order: string[] = [];
    const { input } = harness();
    const store = input.store;
    input.store = {
      loadStored: store.loadStored,
      async applyPlan(w, d) {
        order.push("apply");
        return store.applyPlan(w, d);
      },
      async recordRun(r) {
        order.push("record");
        return store.recordRun(r);
      },
    };
    await runLedgerSync(input);
    expect(order).toEqual(["apply", "record"]);
  });

  it("still records a no-op run — proving the sync ran is the point of the table", async () => {
    const first = harness();
    const applied = await runLedgerSync(first.input);
    if (applied.outcome !== "applied") throw new Error("expected applied");

    const second = harness({ stored: applied.plan.writes });
    const result = await runLedgerSync(second.input);

    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.plan.summary).toMatchObject({ added: 0, changed: 0, unchanged: 2 });
    expect(second.calls.applied[0].writes).toHaveLength(0);
    expect(second.calls.recorded).toHaveLength(1);
  });
});

describe("runLedgerSync — refusals are recorded, never written", () => {
  it("an emptied CSV against a non-empty store writes nothing but leaves a record", async () => {
    const seed = harness();
    const applied = await runLedgerSync(seed.input);
    if (applied.outcome !== "applied") throw new Error("expected applied");

    const header = REAL_LEDGER.split("\n")[0] + "\n";
    const { input, calls } = harness({ text: header, stored: applied.plan.writes });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("refused");
    expect(calls.applied).toHaveLength(0);
    expect(calls.recorded).toHaveLength(1);
    expect(calls.recorded[0].refusalReason).toMatch(/failed read/);
    expect(result.log.startsWith("NO WRITE —")).toBe(true);
  });

  it("a refusal that cannot even be recorded is reported as unrecorded", async () => {
    const seed = harness();
    const applied = await runLedgerSync(seed.input);
    if (applied.outcome !== "applied") throw new Error("expected applied");

    const header = REAL_LEDGER.split("\n")[0] + "\n";
    const { input } = harness({
      text: header,
      stored: applied.plan.writes,
      recordThrows: "runs table unreachable",
    });
    const result = await runLedgerSync(input);
    expect(result.outcome).toBe("unrecorded");
    expect(result.log).toMatch(/could not be recorded/);
  });
});

describe("runLedgerSync — failures never fabricate state", () => {
  it("a read failure writes nothing AND records nothing (no bytes = no digest)", async () => {
    const { input, calls } = harness({ readThrows: "ENOENT: invoice-ledger.csv" });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("read_failed");
    expect(calls.applied).toHaveLength(0);
    expect(calls.recorded).toHaveLength(0);
    expect(result.log).toMatch(/previous run remains the newest/);
  });

  it("an unreadable store is not an empty store — no run, no mass withdrawal", async () => {
    const { input, calls } = harness({ loadThrows: "supabase 503" });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("read_failed");
    expect(calls.applied).toHaveLength(0);
    expect(calls.recorded).toHaveLength(0);
    expect(result.log).toMatch(/never treated as an empty one/);
  });

  it("a malformed digest aborts the run instead of writing untagged rows", async () => {
    const { input, calls } = harness({ sha256: "not-a-digest" });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("read_failed");
    expect(calls.applied).toHaveLength(0);
    expect(calls.recorded).toHaveLength(0);
    if (result.outcome !== "read_failed") return;
    expect(result.error).toMatch(/sha256/);
  });

  it("a failed write is recorded as a refusal naming the error, not left silent", async () => {
    const { input, calls } = harness({ applyThrows: "duplicate key value" });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("apply_failed");
    expect(calls.applied).toHaveLength(0);
    expect(calls.recorded).toHaveLength(1);
    expect(calls.recorded[0].refusalReason).toMatch(/apply failed: duplicate key value/);
    expect(calls.recorded[0].requiresReview).toBe(true);
  });

  it("writes that land under a lost run row are loud, not reported as success", async () => {
    const { input, calls } = harness({ recordThrows: "runs table unreachable" });
    const result = await runLedgerSync(input);

    expect(result.outcome).toBe("unrecorded");
    expect(calls.applied).toHaveLength(1);
    expect(result.log).toMatch(/cannot be trusted/);
  });

  it("never throws, whatever the ports do", async () => {
    const { input } = harness({
      readThrows: "boom",
    });
    await expect(runLedgerSync(input)).resolves.toBeTruthy();
  });
});

describe("runNeedsAttention", () => {
  it("flags every non-applied outcome", async () => {
    const read = await runLedgerSync(harness({ readThrows: "x" }).input);
    const failed = await runLedgerSync(harness({ applyThrows: "x" }).input);
    expect(runNeedsAttention(read)).toBe(true);
    expect(runNeedsAttention(failed)).toBe(true);
  });

  it("flags an applied run that the plan itself marked for review", async () => {
    // Rob's ledger has one invoice with a prose split-payment plan and one paid
    // — a first sync is all additions, so nothing is material yet.
    const first = await runLedgerSync(harness().input);
    expect(runNeedsAttention(first)).toBe(false);

    if (first.outcome !== "applied") throw new Error("expected applied");
    const bumped = REAL_LEDGER.replace("19000.00", "21000.00");
    const second = await runLedgerSync(
      harness({ text: bumped, stored: first.plan.writes, sha256: "b".repeat(64) }).input
    );
    expect(runNeedsAttention(second)).toBe(true);
    if (second.outcome !== "applied") throw new Error("expected applied");
    expect(second.plan.summary.material).toBe(1);
  });
});
