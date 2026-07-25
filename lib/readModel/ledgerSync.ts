// PRD Task MC.9 (invoicing leg, half 2) → Task MC.12 (the Invoices/AR panel).
//
// Half 1 (`invoiceLedger.ts`) turns ledger TEXT into an aged panel. This file is
// the INGEST half's decision core: given what prod already stored and the CSV we
// just read out of the contracts repo, what — if anything — should be written,
// and under whose provenance.
//
// WHY A DIFF AND NOT A RELOAD. `invoices/invoice-ledger.csv` lives in a repo that
// is NOT deployed with the dashboard, so every row that reaches prod arrives via
// a sync run that nobody watches. A blind "delete all, insert all" would let one
// truncated read silently empty a money panel, and would erase the record of when
// each invoice actually changed. So the sync computes a plan, and the plan is
// conservative in three specific ways:
//
//   1. NOTHING IS EVER DELETED. An invoice that vanishes from the CSV is marked
//      `withdrawn` — the row stays, tagged, for a human to look at. A file that
//      lost a row and a file that is missing a row look identical from here.
//   2. AN EMPTY/UNKEYED READ IS REFUSED, not applied. Zero incoming rows against
//      a non-empty store is treated as a bad read, never as "everything is gone".
//   3. DUPLICATE INVOICE NUMBERS ARE CONFLICTS, not last-write-wins. If the
//      ledger states an invoice twice we cannot tell which line is true, so both
//      are held back and reported rather than one quietly overwriting the other.
//
// Money changes (amount, currency, payment state, due date) are flagged
// `material` so a review surface can show them; the sync itself only mirrors what
// Rob's own ledger says — it never originates a money value (house hard limit).
//
// PROVENANCE IS MANDATORY. Every written row carries the content digest, the
// source commit and the sync timestamp that produced it, so the AR panel can say
// "as of <commit>, synced <when>" instead of implying live truth. `buildProvenance`
// throws on a malformed tag: an untagged sync is worse than no sync, because it
// looks current forever.
//
// Pure per CR-3: no filesystem, no network, no clock, no hashing of its own —
// the caller reads the file, digests it and supplies `syncedAt`. The runner that
// does that I/O is the remaining piece of this leg.

import type { InvoiceLedgerRow } from "./invoiceLedger";

// ── Provenance ──────────────────────────────────────────────────────────────

export type LedgerProvenance = {
  /** Repo the CSV was read from, e.g. "MyLocalEverything/contracts". */
  sourceRepo: string;
  /** Path inside that repo, e.g. "invoices/invoice-ledger.csv". */
  sourcePath: string;
  /** sha256 of the exact bytes parsed — the join key between a written row and
   *  the file revision that justified it. */
  contentSha256: string;
  /** Commit the file was read at, when the runner can determine it. Null is
   *  allowed (a dirty working tree is still a real read) but it is recorded as
   *  null rather than faked. */
  sourceCommit: string | null;
  /** ISO timestamp of the sync run, injected by the caller. */
  syncedAt: string;
  /** Rows parsed out of that file. */
  rowCount: number;
};

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

/** Validate-or-throw. Every field here ends up on a money panel's "as of" line,
 *  so a wrong one is a lie with a timestamp on it. */
export function buildProvenance(input: LedgerProvenance): LedgerProvenance {
  const fail = (msg: string) => {
    throw new Error(`invoice ledger sync provenance: ${msg}`);
  };
  if (!input.sourceRepo.trim()) fail("sourceRepo is required");
  if (!input.sourcePath.trim()) fail("sourcePath is required");
  if (!SHA256.test(input.contentSha256))
    fail(`contentSha256 must be a 64-char sha256 hex digest, got "${input.contentSha256}"`);
  if (input.sourceCommit !== null && !COMMIT.test(input.sourceCommit))
    fail(`sourceCommit must be a git sha or null, got "${input.sourceCommit}"`);
  if (!ISO_INSTANT.test(input.syncedAt))
    fail(`syncedAt must be an ISO instant, got "${input.syncedAt}"`);
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0)
    fail(`rowCount must be a non-negative integer, got ${input.rowCount}`);
  return { ...input, sourceRepo: input.sourceRepo.trim(), sourcePath: input.sourcePath.trim() };
}

/** A row as it is stored: the ledger's own fields plus the tag that says where
 *  it came from. `withdrawnAt` is set when the invoice left the CSV. */
export type SyncedInvoiceRow = InvoiceLedgerRow & {
  sourceSha256: string;
  sourceCommit: string | null;
  syncedAt: string;
  withdrawnAt: string | null;
};

// ── Diff ────────────────────────────────────────────────────────────────────

/** Fields compared row-to-row. Derived positionally from InvoiceLedgerRow so a
 *  new ledger field has to be classified here rather than silently ignored. */
export const TRACKED_FIELDS = [
  "issueDate",
  "clientSlug",
  "clientLegalName",
  "owner",
  "amount",
  "currency",
  "statusText",
  "paymentState",
  "dueDate",
  "paymentPlanNote",
  "pdf",
] as const satisfies readonly (keyof InvoiceLedgerRow)[];

export type TrackedField = (typeof TRACKED_FIELDS)[number];

/** Changes a human must actually look at: anything that moves money, its
 *  currency, whether it is owed, or when it is owed. */
export const MATERIAL_FIELDS: readonly TrackedField[] = [
  "amount",
  "currency",
  "paymentState",
  "dueDate",
  "statusText",
];

export type LedgerFieldChange = {
  field: TrackedField;
  before: InvoiceLedgerRow[TrackedField];
  after: InvoiceLedgerRow[TrackedField];
};

export type LedgerChange =
  | { kind: "added"; invoiceNumber: string; after: InvoiceLedgerRow }
  | {
      kind: "changed";
      invoiceNumber: string;
      before: InvoiceLedgerRow;
      after: InvoiceLedgerRow;
      fields: LedgerFieldChange[];
      material: boolean;
    }
  /** Present in the store, absent from the CSV. Marked, never deleted. */
  | { kind: "withdrawn"; invoiceNumber: string; before: InvoiceLedgerRow }
  | { kind: "unchanged"; invoiceNumber: string };

export type LedgerConflict = {
  invoiceNumber: string;
  reason: "duplicate_invoice_number" | "missing_invoice_number";
  detail: string;
};

export type LedgerSyncPlan = {
  provenance: LedgerProvenance;
  /** Null when the plan is safe to apply; a sentence when it must not be. */
  refusalReason: string | null;
  changes: LedgerChange[];
  conflicts: LedgerConflict[];
  /** Rows to upsert, already provenance-tagged. Empty when refused. */
  writes: SyncedInvoiceRow[];
  /** Invoices to flag as gone from the source — a mark, not a delete. */
  withdrawals: { invoiceNumber: string; withdrawnAt: string }[];
  summary: {
    added: number;
    changed: number;
    withdrawn: number;
    unchanged: number;
    material: number;
    conflicts: number;
  };
  /** True when a person should see this run before trusting the panel. */
  requiresReview: boolean;
};

/** Index by invoice number, holding back anything we cannot key confidently. */
function indexRows(rows: readonly InvoiceLedgerRow[]): {
  byNumber: Map<string, InvoiceLedgerRow>;
  conflicts: LedgerConflict[];
} {
  const byNumber = new Map<string, InvoiceLedgerRow>();
  const dupes = new Set<string>();
  const conflicts: LedgerConflict[] = [];

  for (const row of rows) {
    const key = row.invoiceNumber.trim();
    if (!key) {
      conflicts.push({
        invoiceNumber: "",
        reason: "missing_invoice_number",
        detail: `a ledger row for "${row.clientLegalName || row.clientSlug || "(no client)"}" has no invoice_number — it cannot be keyed, so it is held back rather than written under a guessed id`,
      });
      continue;
    }
    if (byNumber.has(key)) dupes.add(key);
    byNumber.set(key, row);
  }

  for (const key of dupes) {
    byNumber.delete(key);
    conflicts.push({
      invoiceNumber: key,
      reason: "duplicate_invoice_number",
      detail: `invoice ${key} appears more than once in the ledger — we cannot tell which line is true, so neither is written`,
    });
  }
  return { byNumber, conflicts };
}

function diffRow(before: InvoiceLedgerRow, after: InvoiceLedgerRow): LedgerFieldChange[] {
  const out: LedgerFieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    if (before[field] !== after[field]) {
      out.push({ field, before: before[field], after: after[field] });
    }
  }
  return out;
}

/** The whole decision: what the store has, what the file says, who says so. */
export function planLedgerSync(
  stored: readonly InvoiceLedgerRow[],
  incoming: readonly InvoiceLedgerRow[],
  provenance: LedgerProvenance
): LedgerSyncPlan {
  const tag = buildProvenance(provenance);
  const { byNumber: next, conflicts } = indexRows(incoming);
  const { byNumber: prev } = indexRows(stored);

  const empty = (refusalReason: string | null): LedgerSyncPlan => ({
    provenance: tag,
    refusalReason,
    changes: [],
    conflicts,
    writes: [],
    withdrawals: [],
    summary: {
      added: 0,
      changed: 0,
      withdrawn: 0,
      unchanged: 0,
      material: 0,
      conflicts: conflicts.length,
    },
    requiresReview: true,
  });

  // Rule 2: a read that produced nothing is a bad read, not an empty ledger.
  if (next.size === 0 && prev.size > 0) {
    return empty(
      `refused: the ledger read produced 0 keyable rows while ${prev.size} invoice(s) are already stored — treating that as a failed read, not as an emptied ledger`
    );
  }

  const changes: LedgerChange[] = [];
  const writes: SyncedInvoiceRow[] = [];
  const withdrawals: { invoiceNumber: string; withdrawnAt: string }[] = [];
  let material = 0;

  const stamp = (row: InvoiceLedgerRow): SyncedInvoiceRow => ({
    ...row,
    sourceSha256: tag.contentSha256,
    sourceCommit: tag.sourceCommit,
    syncedAt: tag.syncedAt,
    withdrawnAt: null,
  });

  for (const [invoiceNumber, after] of next) {
    const before = prev.get(invoiceNumber);
    if (!before) {
      changes.push({ kind: "added", invoiceNumber, after });
      writes.push(stamp(after));
      continue;
    }
    const fields = diffRow(before, after);
    if (fields.length === 0) {
      changes.push({ kind: "unchanged", invoiceNumber });
      continue;
    }
    const isMaterial = fields.some((f) => MATERIAL_FIELDS.includes(f.field));
    if (isMaterial) material += 1;
    changes.push({ kind: "changed", invoiceNumber, before, after, fields, material: isMaterial });
    writes.push(stamp(after));
  }

  // Rule 1: gone from the file ≠ gone. Mark it and let a human decide.
  // A number held back as a conflict is NOT absent from the file — it is
  // present and unreadable, which is a different claim, so it never lands in
  // the withdrawn pile (that pile is meant to mean "the ledger dropped this").
  const withheld = new Set(conflicts.map((c) => c.invoiceNumber));
  for (const [invoiceNumber, before] of prev) {
    if (next.has(invoiceNumber) || withheld.has(invoiceNumber)) continue;
    changes.push({ kind: "withdrawn", invoiceNumber, before });
    withdrawals.push({ invoiceNumber, withdrawnAt: tag.syncedAt });
  }

  const summary = {
    added: changes.filter((c) => c.kind === "added").length,
    changed: changes.filter((c) => c.kind === "changed").length,
    withdrawn: withdrawals.length,
    unchanged: changes.filter((c) => c.kind === "unchanged").length,
    material,
    conflicts: conflicts.length,
  };

  return {
    provenance: tag,
    refusalReason: null,
    changes,
    conflicts,
    writes,
    withdrawals,
    summary,
    requiresReview: material > 0 || withdrawals.length > 0 || conflicts.length > 0,
  };
}

/** One line for the driver log / the panel's "as of" caption. Says what the run
 *  did AND what it refused to do — a silent sync is how stale money panels are
 *  born. */
export function describeSyncPlan(plan: LedgerSyncPlan): string {
  const p = plan.provenance;
  const at = `${p.sourceRepo}/${p.sourcePath}@${p.sourceCommit ?? "uncommitted"} (${p.contentSha256.slice(0, 12)}) synced ${p.syncedAt}`;
  if (plan.refusalReason) return `NO WRITE — ${plan.refusalReason} · ${at}`;
  const s = plan.summary;
  const review = plan.requiresReview ? " · NEEDS REVIEW" : "";
  return `+${s.added} added, ~${s.changed} changed (${s.material} material), !${s.withdrawn} withdrawn, =${s.unchanged} unchanged, ${s.conflicts} conflict(s) · ${at}${review}`;
}
