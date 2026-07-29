// Rob's rule pinned as tests (2026-07-28): every company carries a referral
// chain and every real one ROOTS AT ROB. The last test is the one that matters —
// it runs the rule over the actual graph backup, so a company added without
// provenance fails the suite instead of shipping with a blank origin.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT_ID,
  auditChains,
  buildChain,
  chainForDisplay,
  type Edge,
} from "../referrals/chain";

const nodes = (...ids: string[]) => new Set([ROOT_ID, ...ids]);

const EDGES: Edge[] = [
  { id: "e-1", fromId: ROOT_ID, toId: "caleb-green", relationship: "SIGNED 6/22" },
  { id: "e-2", fromId: "caleb-green", toId: "joseph-green", relationship: "brother" },
  { id: "e-3", fromId: ROOT_ID, toId: "alex-greenwood", relationship: "named by Rob" },
  { id: "e-4", fromId: "alex-greenwood", toId: "omega-title-fl", relationship: "door via Alex" },
];

describe("buildChain", () => {
  it("always begins at Rob, never at the nearest door-opener", () => {
    const result = buildChain("joseph-green", EDGES, nodes("caleb-green", "joseph-green"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The exact defect this guards: a view drew Caleb → Joseph and left Rob out.
    expect(result.chain.links.map((l) => l.id)).toEqual([ROOT_ID, "caleb-green", "joseph-green"]);
    expect(result.chain.degrees).toBe(2);
  });

  it("carries the relationship that earned each hop", () => {
    const result = buildChain("omega-title-fl", EDGES, nodes("alex-greenwood", "omega-title-fl"));
    if (!result.ok) throw new Error("expected a chain");
    expect(result.chain.links[1]?.relationship).toBe("named by Rob");
    expect(result.chain.links[2]?.relationship).toBe("door via Alex");
    // The root is reached by definition and must not claim a relationship.
    expect(result.chain.links[0]?.relationship).toBeUndefined();
  });

  it("treats Rob himself as a chain of one, not an error", () => {
    const result = buildChain(ROOT_ID, EDGES, nodes());
    if (!result.ok) throw new Error("expected a chain");
    expect(result.chain.links).toEqual([{ id: ROOT_ID }]);
    expect(result.chain.degrees).toBe(0);
  });

  it("separates a node nobody introduced from a node that does not exist", () => {
    const orphan = buildChain("stray-co", EDGES, nodes("stray-co"));
    expect(orphan).toEqual({ ok: false, violation: { targetId: "stray-co", reason: "unreachable" } });

    const absent = buildChain("ghost-co", EDGES, nodes());
    expect(absent).toEqual({ ok: false, violation: { targetId: "ghost-co", reason: "missing-node" } });
  });

  it("returns the shortest true path, and the same one every run", () => {
    const withShortcut: Edge[] = [
      ...EDGES,
      { id: "e-0", fromId: ROOT_ID, toId: "joseph-green", relationship: "direct" },
    ];
    const ids = nodes("caleb-green", "joseph-green");
    const first = buildChain("joseph-green", withShortcut, ids);
    const second = buildChain("joseph-green", [...withShortcut].reverse(), ids);
    if (!first.ok || !second.ok) throw new Error("expected chains");
    expect(first.chain.links.map((l) => l.id)).toEqual([ROOT_ID, "joseph-green"]);
    expect(second.chain).toEqual(first.chain);
  });
});

describe("chainForDisplay", () => {
  it("refuses to hand a partial chain to a view", () => {
    // Q70/0031: the origin is named by whatever the graph spells it, so this
    // pins the message against ROOT_ID rather than a literal name-slug — a
    // graph with no Rob in it at all reports the canonical record number.
    expect(() => chainForDisplay("stray-co", EDGES, nodes("stray-co"))).toThrow(
      new RegExp(`does not reach ${ROOT_ID}`),
    );
  });
});

describe("auditChains", () => {
  it("exempts demo rows — they are the rep demo book, not the network", () => {
    const ids = nodes("caleb-green");
    ids.add("demo-acme");
    expect(auditChains(["caleb-green", "demo-acme"], EDGES, ids)).toEqual([]);
  });

  it("reports every real company with no provenance", () => {
    const ids = nodes("caleb-green", "stray-co", "other-co");
    expect(auditChains(["caleb-green", "stray-co", "other-co"], EDGES, ids)).toEqual([
      { targetId: "other-co", reason: "unreachable" },
      { targetId: "stray-co", reason: "unreachable" },
    ]);
  });

  it("THE RULE: every real node in the live graph roots at Rob", () => {
    const dir = join(process.cwd(), "docs", "backups");
    const people = JSON.parse(readFileSync(join(dir, "people-backup-2026-07-17.json"), "utf8")) as {
      id: string;
      name?: string;
    }[];
    const rawEdges = JSON.parse(readFileSync(join(dir, "edges-backup-2026-07-17.json"), "utf8")) as {
      id: string;
      from_id: string;
      to_id: string;
      relationship?: string;
    }[];

    const edges: Edge[] = rawEdges.map((e) => ({
      id: e.id,
      fromId: e.from_id,
      toId: e.to_id,
      relationship: e.relationship,
    }));
    const ids = new Set(people.map((p) => p.id));

    const violations = auditChains(
      people.map((p) => p.id),
      edges,
      ids,
    );

    // Named, not just counted — a failure here should say WHICH company lost its origin.
    expect(violations.map((v) => `${v.targetId} (${v.reason})`)).toEqual([]);
  });
});
