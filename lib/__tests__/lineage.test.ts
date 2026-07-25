import { describe, expect, it } from "vitest";
import networkFallback from "@/data/network.json";
import {
  doorsOpenedBy,
  formatChain,
  indexNodes,
  isTrustworthy,
  lineage,
  MAX_HOPS,
  ORIGIN_ID,
} from "@/lib/lineage";
import type { Person } from "@/lib/types";

// Minimal well-formed node; only the fields lineage reads actually matter.
function node(id: string, referredById?: string, relationship?: string): Person {
  return {
    id,
    name: id.replace(/-/g, " "),
    verticalId: "v",
    status: "lead",
    signed: false,
    keyDates: {},
    phaseOne: "not_started",
    ...(referredById ? { referredById } : {}),
    ...(relationship ? { relationship } : {}),
  } as Person;
}

const HEALTHY: Person[] = [
  node(ORIGIN_ID),
  node("alex", ORIGIN_ID, "best friend"),
  node("sarah", "alex", "his rep"),
  node("acme", "sarah", "client of sarah"),
];

describe("lineage — healthy chains", () => {
  it("walks back to ROB and returns origin-first, node-inclusive", () => {
    const l = lineage(HEALTHY, "sarah");
    expect(l.status).toBe("rooted");
    expect(l.path.map((r) => r.id)).toEqual([ORIGIN_ID, "alex", "sarah"]);
    expect(l.ancestors.map((r) => r.id)).toEqual([ORIGIN_ID, "alex"]);
    expect(l.root?.id).toBe(ORIGIN_ID);
    expect(isTrustworthy(l)).toBe(true);
  });

  it("marks the origin chip and nothing else", () => {
    const l = lineage(HEALTHY, "acme");
    expect(l.path.filter((r) => r.isOrigin).map((r) => r.id)).toEqual([ORIGIN_ID]);
  });

  it("carries the child's relationship onto the hop that used it", () => {
    // sarah.relationship = "his rep" describes how ALEX knows sarah, so it
    // rides alex's chip — the hop, not the destination.
    const l = lineage(HEALTHY, "sarah");
    const alex = l.path.find((r) => r.id === "alex");
    expect(alex?.relationship).toBe("his rep");
  });

  it("treats Rob himself as a trivially rooted chain with no ancestors", () => {
    const l = lineage(HEALTHY, ORIGIN_ID);
    expect(l.status).toBe("rooted");
    expect(l.ancestors).toEqual([]);
    expect(l.path.map((r) => r.id)).toEqual([ORIGIN_ID]);
  });

  it("accepts a prebuilt index (list views index once, walk many)", () => {
    const idx = indexNodes(HEALTHY);
    expect(lineage(idx, "acme").status).toBe("rooted");
    expect(lineage(idx, "alex").path.map((r) => r.id)).toEqual([ORIGIN_ID, "alex"]);
  });
});

describe("lineage — refuses to guess", () => {
  it("reports an unknown id instead of inventing a chain", () => {
    const l = lineage(HEALTHY, "nobody");
    expect(l.status).toBe("unknown_node");
    expect(l.path).toEqual([]);
    expect(l.root).toBeNull();
    expect(l.reason).toContain("nobody");
  });

  it("flags a chain that roots somewhere other than Rob", () => {
    const orphan = [node("stranger"), node("lead-x", "stranger")];
    const l = lineage(orphan, "lead-x");
    expect(l.status).toBe("broken_root");
    expect(isTrustworthy(l)).toBe(false);
    expect(l.reason).toContain("not the origin");
    // Partial path is still returned so the UI shows the fragment + warning.
    expect(l.path.map((r) => r.id)).toEqual(["stranger", "lead-x"]);
  });

  it("flags a dangling referredById rather than silently stopping", () => {
    const l = lineage([node(ORIGIN_ID), node("lead-y", "ghost")], "lead-y");
    expect(l.status).toBe("broken_missing");
    expect(l.reason).toContain("ghost");
  });

  it("cycle-guards A → B → A", () => {
    const cyclic = [node("a", "b"), node("b", "a")];
    const l = lineage(cyclic, "a");
    expect(l.status).toBe("broken_cycle");
    expect(l.reason).toContain("loop");
  });

  it("self-referral is a cycle, not an infinite walk", () => {
    const l = lineage([node("solo", "solo")], "solo");
    expect(l.status).toBe("broken_cycle");
  });

  it("reports depth instead of truncating to a fake origin", () => {
    // A long chain that never reaches Rob: 0 ← 1 ← 2 … each referred by the next.
    const deep: Person[] = [];
    for (let i = 0; i <= MAX_HOPS + 3; i++) deep.push(node(`n${i}`, `n${i + 1}`));
    deep.push(node(`n${MAX_HOPS + 4}`));
    const l = lineage(deep, "n0");
    expect(l.status).toBe("broken_depth");
    expect(l.reason).toContain(`${MAX_HOPS}`);
    // Whatever it did recover must never be presented as origin-anchored.
    expect(isTrustworthy(l)).toBe(false);
  });
});

describe("doorsOpenedBy", () => {
  it("lists only direct referrals", () => {
    expect(doorsOpenedBy(HEALTHY, "alex").map((r) => r.id)).toEqual(["sarah"]);
    expect(doorsOpenedBy(HEALTHY, ORIGIN_ID).map((r) => r.id)).toEqual(["alex"]);
    expect(doorsOpenedBy(HEALTHY, "acme")).toEqual([]);
  });
});

describe("formatChain — §5 middle-truncation", () => {
  const refs = lineage(HEALTHY, "acme").ancestors; // ROB, alex, sarah
  it("renders short chains in full", () => {
    expect(formatChain(refs.slice(0, 2))).toBe(`${ORIGIN_ID.replace(/-/g, " ")} → alex`);
  });
  it("middle-truncates at 4+ hops", () => {
    const long = lineage(HEALTHY, "acme").path; // 4 refs
    expect(formatChain(long)).toBe(`${ORIGIN_ID.replace(/-/g, " ")} → … → acme`);
  });
  it("returns empty string for an empty chain", () => {
    expect(formatChain([])).toBe("");
  });
});

describe("lineage — against the real network data", () => {
  const people = (networkFallback as { people: Person[] }).people;

  it("Rob is present and is a root", () => {
    const rob = people.find((p) => p.id === ORIGIN_ID);
    expect(rob).toBeDefined();
    expect(rob?.referredById).toBeUndefined();
  });

  it("every referred node resolves without cycles or dangling parents", () => {
    const idx = indexNodes(people);
    const bad = people
      .filter((p) => p.referredById)
      .map((p) => ({ id: p.id, status: lineage(idx, p.id).status }))
      .filter((r) => r.status === "broken_cycle" || r.status === "broken_missing");
    expect(bad).toEqual([]);
  });

  it("real chains that ARE rooted read origin-first from Rob", () => {
    const idx = indexNodes(people);
    const rooted = people
      .filter((p) => p.referredById)
      .map((p) => lineage(idx, p.id))
      .filter(isTrustworthy);
    expect(rooted.length).toBeGreaterThan(0);
    for (const l of rooted) expect(l.path[0].id).toBe(ORIGIN_ID);
  });
});
