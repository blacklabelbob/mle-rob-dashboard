// Rob's standing rule (2026-07-28, stated as final): EVERY company carries a
// referral chain, and 100% of real ones ROOT AT ROB. This file is that rule —
// pure per CR-3, so no prose anywhere can drift from it and no render can quietly
// drop the root. It exists because the rule was violated in presentation, not in
// data: the graph already rooted every node at Rob while a company view drew a
// chain starting one hop downstream, leaving Rob out of his own network.
//
// Two guarantees, both enforced here rather than trusted to a caller:
//   1. buildChain ALWAYS returns a chain whose first link is ROOT_ID, or it
//      returns a violation. There is no third outcome, and no partial chain is
//      ever handed back for rendering — a chain that cannot reach Rob is a
//      defect to surface, not a shorter chain to draw.
//   2. auditChains reports every real company that cannot reach Rob. Demo rows
//      (demo-* / DEMO-marked) are exempt because they are the /rep demo book,
//      not the network (Q4 precedent, mirrored from chaseQueue).
//
// Direction note: edges are stored door-opener → introduced (from_id → to_id),
// so a chain is a forward walk FROM Rob, and the shortest such walk is the
// provenance we show. Ties are broken by the lowest edge id so two runs on the
// same graph produce byte-identical chains.

// Q70/0031: the root is resolved against the node set, not hardcoded as a name.
// This BFS SEEDS its queue from the root, so a stale literal does not degrade
// the answer — it makes every company unreachable. See lib/records/origin.ts.
import { resolveOriginId } from "../records/origin";

export { ORIGIN_ID as ROOT_ID, ORIGIN_LEGACY_SLUG } from "../records/origin";

export type Edge = {
  id: string;
  fromId: string;
  toId: string;
  relationship?: string;
};

export type ChainLink = {
  id: string;
  /** How this node was reached. Undefined only on the root, which is reached by definition. */
  relationship?: string;
};

export type Chain = {
  targetId: string;
  /** Always begins with ROOT_ID. Length 1 means the target IS Rob. */
  links: ChainLink[];
  /** Hops from Rob. 0 for Rob himself, 1 for someone Rob introduced directly. */
  degrees: number;
};

export type ChainViolation = {
  targetId: string;
  reason: "unreachable" | "missing-node";
};

export type ChainResult =
  | { ok: true; chain: Chain }
  | { ok: false; violation: ChainViolation };

const isDemo = (id: string) => id.startsWith("demo-") || id.startsWith("DEMO-");

/**
 * Adjacency keyed by door-opener, each target list ordered by edge id so the
 * walk is deterministic. Built once per audit rather than per target.
 */
const buildAdjacency = (edges: readonly Edge[]) => {
  const adj = new Map<string, { toId: string; relationship?: string; edgeId: string }[]>();
  for (const e of edges) {
    const list = adj.get(e.fromId);
    const entry = { toId: e.toId, relationship: e.relationship, edgeId: e.id };
    if (list) list.push(entry);
    else adj.set(e.fromId, [entry]);
  }
  for (const list of adj.values()) list.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  return adj;
};

/**
 * The shortest provenance chain from Rob to `targetId`.
 *
 * Breadth-first FROM the root, so the chain returned is the fewest introductions
 * that actually happened — not the most flattering path. `nodeIds` is required:
 * a target absent from the node set is `missing-node`, which is a different
 * defect from `unreachable` (a node nobody introduced) and gets a different fix.
 */
export function buildChain(
  targetId: string,
  edges: readonly Edge[],
  nodeIds: ReadonlySet<string>,
  adjacency?: Map<string, { toId: string; relationship?: string; edgeId: string }[]>,
): ChainResult {
  if (!nodeIds.has(targetId)) {
    return { ok: false, violation: { targetId, reason: "missing-node" } };
  }
  // Whichever spelling of the origin THIS graph uses (post-0031 `P-1001`, or
  // `rob-acheson` on pre-migration rows and fixtures).
  const rootId = resolveOriginId(nodeIds);
  if (targetId === rootId) {
    return { ok: true, chain: { targetId, links: [{ id: rootId }], degrees: 0 } };
  }

  const adj = adjacency ?? buildAdjacency(edges);
  const cameFrom = new Map<string, { prev: string; relationship?: string }>();
  const seen = new Set<string>([rootId]);
  const queue: string[] = [rootId];

  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    if (node === targetId) break;
    for (const next of adj.get(node) ?? []) {
      if (seen.has(next.toId)) continue;
      seen.add(next.toId);
      cameFrom.set(next.toId, { prev: node, relationship: next.relationship });
      queue.push(next.toId);
    }
  }

  if (!seen.has(targetId)) {
    return { ok: false, violation: { targetId, reason: "unreachable" } };
  }

  // Walk back to the root, then reverse — so the chain always READS from Rob
  // outward, which is the only direction it is ever allowed to render in.
  const reversed: ChainLink[] = [];
  let cursor = targetId;
  while (cursor !== rootId) {
    const step = cameFrom.get(cursor);
    if (!step) return { ok: false, violation: { targetId, reason: "unreachable" } };
    reversed.push({ id: cursor, relationship: step.relationship });
    cursor = step.prev;
  }
  reversed.push({ id: rootId });
  reversed.reverse();

  return { ok: true, chain: { targetId, links: reversed, degrees: reversed.length - 1 } };
}

/**
 * Every real company that cannot show a chain back to Rob.
 *
 * An empty result is the only passing state. Callers should treat a non-empty
 * result as a defect list, not as data — a company with no provenance is a
 * company nobody can explain the origin of.
 */
export function auditChains(
  companyIds: readonly string[],
  edges: readonly Edge[],
  nodeIds: ReadonlySet<string>,
): ChainViolation[] {
  const adjacency = buildAdjacency(edges);
  const violations: ChainViolation[] = [];
  for (const id of companyIds) {
    if (isDemo(id)) continue;
    const result = buildChain(id, edges, nodeIds, adjacency);
    if (!result.ok) violations.push(result.violation);
  }
  return violations.sort((a, b) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));
}

/**
 * Render-safe chain. Throws rather than return a chain that does not start at
 * Rob, because the failure this guards against was a VIEW silently drawing a
 * partial chain — a caller that cannot show provenance must show the defect.
 */
export function chainForDisplay(
  targetId: string,
  edges: readonly Edge[],
  nodeIds: ReadonlySet<string>,
): Chain {
  const result = buildChain(targetId, edges, nodeIds);
  const rootId = resolveOriginId(nodeIds);
  if (!result.ok) {
    throw new Error(
      `Referral chain for "${targetId}" does not reach ${rootId} (${result.violation.reason}). ` +
        `Every real company must root at Rob; surface this as a flag rather than rendering a partial chain.`,
    );
  }
  if (result.chain.links[0]?.id !== rootId) {
    throw new Error(`Referral chain for "${targetId}" did not begin at ${rootId}.`);
  }
  return result.chain;
}
