// Merge-plan executor (PRD Task 4.2). Runs a planner-emitted op list IN ORDER
// against a Supabase-shaped client. Fail-fast: the first op error stops the
// run and is surfaced with the exact op + how many completed — never a silent
// partial merge. Supabase has no client-side transactions, so the planner's
// ordering IS the safety model: every op is individually idempotent-safe to
// re-run (repoints match nothing the second time; the duplicate delete is
// last), so a failed run is resumed by simply re-merging the same pair.

import type { MergeOp } from "@/lib/dedup/merge";

// Minimal structural slice of the Supabase client the executor needs — lets
// tests drive it with a fake and keeps this module free of network imports.
export interface MergeOpResult {
  error: { message: string } | null;
}
export interface MergeDb {
  from(table: string): {
    update(set: Record<string, unknown>): {
      match(where: Record<string, string>): PromiseLike<MergeOpResult>;
    };
    delete(): { match(where: Record<string, string>): PromiseLike<MergeOpResult> };
  };
}

export type MergeRunResult =
  | { ok: true; completed: number }
  | { ok: false; completed: number; failedOp: MergeOp; error: string };

export async function runMergePlan(db: MergeDb, ops: MergeOp[]): Promise<MergeRunResult> {
  let completed = 0;
  for (const op of ops) {
    const res =
      op.action === "update"
        ? await db.from(op.table).update(op.set).match(op.where)
        : await db.from(op.table).delete().match(op.where);
    if (res.error) {
      return { ok: false, completed, failedOp: op, error: res.error.message };
    }
    completed += 1;
  }
  return { ok: true, completed };
}

// Zero-orphan post-check (the Task 4.2 DoD gate): count every remaining row
// still referencing the deleted duplicate. All zeros or the merge is a defect.
const ORPHAN_CHECKS: Array<{ table: string; column: string }> = [
  { table: "people", column: "id" },
  { table: "people", column: "referred_by_id" },
  { table: "orgs", column: "referred_by_id" },
  { table: "edges", column: "from_id" },
  { table: "edges", column: "to_id" },
  { table: "org_memberships", column: "person_id" },
  { table: "deals", column: "person_id" },
  { table: "activities", column: "person_id" },
  { table: "tasks", column: "person_id" },
];

export interface OrphanDb {
  from(table: string): {
    select(
      columns: string,
      opts: { count: "exact"; head: true }
    ): {
      eq(column: string, value: string): PromiseLike<{
        count: number | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function countOrphans(
  db: OrphanDb,
  duplicateId: string
): Promise<{ total: number; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const { table, column } of ORPHAN_CHECKS) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, duplicateId);
    // A failed count is reported as -1, never as a reassuring zero.
    const n = error ? -1 : (count ?? 0);
    counts[`${table}.${column}`] = n;
    total += n === -1 ? 1 : n;
  }
  return { total, counts };
}
