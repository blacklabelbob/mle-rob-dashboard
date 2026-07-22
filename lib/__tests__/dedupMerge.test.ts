// Task 4.2 merge planner: zero-orphaned-FK guarantee, money-field refusal,
// fold rules — all pinned here so the executor can trust the plan blindly.
import { describe, expect, it } from "vitest";
import { planPersonMerge, type MergeOp } from "@/lib/dedup/merge";

const NOW = "2026-07-22T12:00:00.000Z";

function base(over: Partial<Parameters<typeof planPersonMerge>[0]> = {}) {
  return planPersonMerge({
    survivor: { id: "p-keep", name: "Jon", email: "jon@x.com" },
    duplicate: { id: "p-dup", name: "Jon", phone: "555-111-2222" },
    edges: [],
    memberships: [],
    now: NOW,
    ...over,
  });
}

function op(ops: MergeOp[], table: string, action: MergeOp["action"]) {
  return ops.filter((o) => o.table === table && o.action === action);
}

describe("planPersonMerge", () => {
  it("covers every people(id) FK: blanket repoints for deals/activities/tasks + referrer pointers, dup delete LAST", () => {
    const plan = base();
    if (!plan.ok) throw new Error("expected ok plan");
    for (const table of ["deals", "activities", "tasks"]) {
      expect(op(plan.ops, table, "update")).toEqual([
        { table, action: "update", where: { person_id: "p-dup" }, set: { person_id: "p-keep" } },
      ]);
    }
    expect(op(plan.ops, "people", "update")).toContainEqual({
      table: "people",
      action: "update",
      where: { referred_by_id: "p-dup" },
      set: { referred_by_id: "p-keep" },
    });
    expect(op(plan.ops, "orgs", "update")).toHaveLength(1);
    const last = plan.ops[plan.ops.length - 1];
    expect(last).toEqual({ table: "people", action: "delete", where: { id: "p-dup" } });
  });

  it("folds only EMPTY survivor fields from the duplicate; money fields structurally absent", () => {
    const plan = base({
      survivor: { id: "p-keep", name: "Jon", email: "jon@x.com", phone: "" },
      duplicate: {
        id: "p-dup",
        name: "Jon",
        email: "other@x.com",
        phone: "555-111-2222",
        notes: "met at expo",
      },
    });
    if (!plan.ok) throw new Error("expected ok plan");
    expect(plan.folds).toEqual({ phone: "555-111-2222", notes: "met at expo" }); // email kept: survivor wins
  });

  it("repoints duplicate's edges to the survivor", () => {
    const plan = base({
      edges: [{ id: "e1", from_id: "p-dup", to_id: "p-other" }],
    });
    if (!plan.ok) throw new Error("expected ok plan");
    expect(op(plan.ops, "edges", "update")).toEqual([
      { table: "edges", action: "update", where: { id: "e1" }, set: { from_id: "p-keep", to_id: "p-other" } },
    ]);
  });

  it("deletes edges that would become self-edges or duplicate an existing survivor edge", () => {
    const plan = base({
      edges: [
        { id: "e-self", from_id: "p-dup", to_id: "p-keep" }, // dup→survivor → self-edge
        { id: "e-collide", from_id: "p-dup", to_id: "p-other" }, // survivor already has this
        { id: "e-existing", from_id: "p-keep", to_id: "p-other" },
      ],
    });
    if (!plan.ok) throw new Error("expected ok plan");
    expect(op(plan.ops, "edges", "delete").map((o) => o.where.id).sort()).toEqual([
      "e-collide",
      "e-self",
    ]);
    expect(op(plan.ops, "edges", "update")).toHaveLength(0); // e-existing untouched
  });

  it("keeps exactly one edge when two duplicate edges collapse onto the same pair", () => {
    const plan = base({
      edges: [
        { id: "e1", from_id: "p-dup", to_id: "p-other" },
        { id: "e2", from_id: "p-dup", to_id: "p-other" },
      ],
    });
    if (!plan.ok) throw new Error("expected ok plan");
    expect(op(plan.ops, "edges", "update")).toHaveLength(1);
    expect(op(plan.ops, "edges", "delete")).toHaveLength(1);
  });

  it("repoints memberships, deleting collisions with the survivor's existing orgs", () => {
    const plan = base({
      memberships: [
        { person_id: "p-keep", org_id: "org-a" },
        { person_id: "p-dup", org_id: "org-a" }, // collision → delete
        { person_id: "p-dup", org_id: "org-b" }, // clean → repoint
      ],
    });
    if (!plan.ok) throw new Error("expected ok plan");
    expect(op(plan.ops, "org_memberships", "delete")).toEqual([
      { table: "org_memberships", action: "delete", where: { person_id: "p-dup", org_id: "org-a" } },
    ]);
    expect(op(plan.ops, "org_memberships", "update")).toEqual([
      {
        table: "org_memberships",
        action: "update",
        where: { person_id: "p-dup", org_id: "org-b" },
        set: { person_id: "p-keep" },
      },
    ]);
  });

  it("survivor referred_by the duplicate inherits the duplicate's referrer, never a self-reference", () => {
    const inherited = base({
      survivor: { id: "p-keep", name: "Jon", referred_by_id: "p-dup" },
      duplicate: { id: "p-dup", name: "Jon", referred_by_id: "p-root" },
    });
    if (!inherited.ok) throw new Error("expected ok plan");
    expect(inherited.folds.referred_by_id).toBe("p-root");

    const circular = base({
      survivor: { id: "p-keep", name: "Jon", referred_by_id: "p-dup" },
      duplicate: { id: "p-dup", name: "Jon", referred_by_id: "p-keep" },
    });
    if (!circular.ok) throw new Error("expected ok plan");
    expect(circular.folds.referred_by_id).toBeNull();
  });

  it("closes the dedup_review pair row with the detector's canonical pair_key", () => {
    const plan = base();
    if (!plan.ok) throw new Error("expected ok plan");
    expect(op(plan.ops, "dedup_review", "update")).toEqual([
      {
        table: "dedup_review",
        action: "update",
        where: { pair_key: "person:p-dup:p-keep" }, // lexicographic id order, like the detector
        set: { status: "resolved", resolved_at: NOW, resolution_note: "merged: p-dup → p-keep" },
      },
    ]);
  });

  it("REFUSES when the duplicate carries money data (signed / quoted_amount / estimate)", () => {
    for (const money of [
      { signed: true },
      { quoted_amount: 5000 },
      { estimate: { total: 1 } },
    ]) {
      const plan = base({ duplicate: { id: "p-dup", name: "Jon", ...money } });
      expect(plan.ok).toBe(false);
      if (plan.ok) throw new Error("unreachable");
      expect(plan.blockers).toHaveLength(1);
    }
  });

  it("refuses same-record and demo merges", () => {
    const same = base({ duplicate: { id: "p-keep", name: "Jon" } });
    expect(same.ok).toBe(false);
    const demo = base({ duplicate: { id: "demo-1", name: "Jon" } });
    expect(demo.ok).toBe(false);
  });

  it("is deterministic: same input, byte-identical plan", () => {
    const input = {
      edges: [
        { id: "e2", from_id: "p-dup", to_id: "p-x" },
        { id: "e1", from_id: "p-y", to_id: "p-dup" },
      ],
      memberships: [
        { person_id: "p-dup", org_id: "org-b" },
        { person_id: "p-dup", org_id: "org-a" },
      ],
    };
    expect(JSON.stringify(base(input))).toBe(JSON.stringify(base(input)));
  });
});
