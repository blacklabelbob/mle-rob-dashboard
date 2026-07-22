import { describe, expect, it } from "vitest";
import {
  countOrphans,
  runMergePlan,
  type MergeDb,
  type OrphanDb,
} from "@/lib/dedup/executor";
import type { MergeOp } from "@/lib/dedup/merge";

// Fake Supabase-shaped client that records every call in order and fails on
// demand — the executor's contract is ORDER + fail-fast + honest reporting.
type Call = { table: string; action: "update" | "delete"; set?: unknown; where: unknown };

function fakeDb(failOn?: (call: Call) => boolean) {
  const calls: Call[] = [];
  const result = (call: Call) => ({
    error: failOn?.(call) ? { message: `boom on ${call.table}` } : null,
  });
  const db: MergeDb = {
    from(table: string) {
      return {
        update(set: Record<string, unknown>) {
          return {
            match(where: Record<string, string>) {
              const call: Call = { table, action: "update", set, where };
              calls.push(call);
              return Promise.resolve(result(call));
            },
          };
        },
        delete() {
          return {
            match(where: Record<string, string>) {
              const call: Call = { table, action: "delete", where };
              calls.push(call);
              return Promise.resolve(result(call));
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const OPS: MergeOp[] = [
  { table: "people", action: "update", where: { id: "s1" }, set: { phone: "555" } },
  { table: "edges", action: "delete", where: { id: "e1" } },
  { table: "deals", action: "update", where: { person_id: "d1" }, set: { person_id: "s1" } },
  { table: "people", action: "delete", where: { id: "d1" } },
];

describe("runMergePlan", () => {
  it("runs every op in plan order and reports the completed count", async () => {
    const { db, calls } = fakeDb();
    const res = await runMergePlan(db, OPS);
    expect(res).toEqual({ ok: true, completed: 4 });
    expect(calls.map((c) => `${c.action}:${c.table}`)).toEqual([
      "update:people",
      "delete:edges",
      "update:deals",
      "delete:people",
    ]);
  });

  it("passes set + where through verbatim", async () => {
    const { db, calls } = fakeDb();
    await runMergePlan(db, OPS);
    expect(calls[0]).toEqual({
      table: "people",
      action: "update",
      set: { phone: "555" },
      where: { id: "s1" },
    });
    expect(calls[1]).toEqual({ table: "edges", action: "delete", where: { id: "e1" } });
  });

  it("fail-fast: first error stops the run, surfaces the op, later ops never fire", async () => {
    const { db, calls } = fakeDb((c) => c.table === "deals");
    const res = await runMergePlan(db, OPS);
    expect(res).toEqual({
      ok: false,
      completed: 2,
      failedOp: OPS[2],
      error: "boom on deals",
    });
    // The duplicate delete (last op) must NOT have run after the failure.
    expect(calls).toHaveLength(3);
    expect(calls.some((c) => c.action === "delete" && c.table === "people")).toBe(false);
  });

  it("empty plan is a no-op success", async () => {
    const { db, calls } = fakeDb();
    expect(await runMergePlan(db, [])).toEqual({ ok: true, completed: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("countOrphans", () => {
  function orphanDb(countsByKey: Record<string, number | null>, failKeys: string[] = []) {
    const queried: string[] = [];
    const db: OrphanDb = {
      from(table: string) {
        return {
          select() {
            return {
              eq(column: string) {
                const key = `${table}.${column}`;
                queried.push(key);
                return Promise.resolve(
                  failKeys.includes(key)
                    ? { count: null, error: { message: "count failed" } }
                    : { count: countsByKey[key] ?? 0, error: null }
                );
              },
            };
          },
        };
      },
    };
    return { db, queried };
  }

  it("covers every people(id) FK surface the planner covers, total 0 when clean", async () => {
    const { db, queried } = orphanDb({});
    const res = await countOrphans(db, "d1");
    expect(res.total).toBe(0);
    expect(queried).toEqual([
      "people.id",
      "people.referred_by_id",
      "orgs.referred_by_id",
      "edges.from_id",
      "edges.to_id",
      "org_memberships.person_id",
      "deals.person_id",
      "activities.person_id",
      "tasks.person_id",
    ]);
  });

  it("nonzero leftovers surface in total + per-key counts", async () => {
    const { db } = orphanDb({ "edges.to_id": 2, "tasks.person_id": 1 });
    const res = await countOrphans(db, "d1");
    expect(res.total).toBe(3);
    expect(res.counts["edges.to_id"]).toBe(2);
    expect(res.counts["tasks.person_id"]).toBe(1);
  });

  it("a failed count reports -1, never a reassuring zero", async () => {
    const { db } = orphanDb({}, ["deals.person_id"]);
    const res = await countOrphans(db, "d1");
    expect(res.counts["deals.person_id"]).toBe(-1);
    expect(res.total).toBeGreaterThan(0);
  });
});
