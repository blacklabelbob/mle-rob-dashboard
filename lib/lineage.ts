// Master View 2.0 §5 — attribution lineage engine (design doc increment 3).
// Rob's rule, verbatim (BUILD-QUEUE Q39(e)): "attribution lines must show the
// FULL referral chain back to ROB origin... never make Rob guess the origin
// node." So this module answers ONE question — how did this door get opened,
// all the way back — and it refuses to guess when the data can't answer it.
//
// Pure per CR-3: no clock, no network, no Next imports. The caller passes the
// node set in; every result is a function of (nodes, id, options) alone.

import type { Person } from "./types";

/** The origin node. Every healthy chain terminates here. */
export const ORIGIN_ID = "rob-acheson";

/**
 * Hop cap from §5. Ten is well past any real chain in the network (deepest
 * observed is 3), so hitting it means the data is wrong, not that Rob has a
 * ten-person referral tree — which is why it reports broken rather than
 * truncating and pretending the head of the list is the origin.
 */
export const MAX_HOPS = 10;

export interface LineageRef {
  id: string;
  name: string;
  /** True for the ORIGIN node — the UI anchors this chip differently. */
  isOrigin: boolean;
  /** How the PREVIOUS hop knows this one ("best friend", "his rep", …). */
  relationship?: string;
}

export type LineageStatus =
  | "rooted" // walk reached ORIGIN — the only trustworthy state
  | "unknown_node" // the id isn't in the node set at all
  | "broken_root" // walk ended at a node that isn't Rob (orphan chain)
  | "broken_missing" // referredById points at a node that doesn't exist
  | "broken_cycle" // A → B → A
  | "broken_depth"; // exceeded MAX_HOPS

export interface Lineage {
  status: LineageStatus;
  /** Origin-first, INCLUSIVE of the node itself: [ROB, …, node]. */
  path: LineageRef[];
  /** The chain the breadcrumb renders — `path` minus the node you're on. */
  ancestors: LineageRef[];
  /** The node the walk actually terminated at (null when unknown_node). */
  root: LineageRef | null;
  /** Plain-language reason, rendered on the "⚠ broken chain" chip. */
  reason?: string;
}

type NodeIndex = Map<string, Person>;

/** Build a lookup once and reuse it across many chains (list views). */
export function indexNodes(nodes: readonly Person[]): NodeIndex {
  const index: NodeIndex = new Map();
  for (const n of nodes) index.set(n.id, n);
  return index;
}

function toRef(node: Person, relationship?: string): LineageRef {
  return {
    id: node.id,
    name: node.name,
    isOrigin: node.id === ORIGIN_ID,
    ...(relationship ? { relationship } : {}),
  };
}

/**
 * Walk `referredById` from `id` up to the origin.
 *
 * Broken states carry whatever partial path was recovered — the UI shows the
 * fragment WITH the warning chip rather than an empty component, because a
 * partial chain plus an honest warning is useful and a silently-shortened
 * chain that looks complete is a lie about where a deal came from.
 */
export function lineage(
  nodes: readonly Person[] | NodeIndex,
  id: string,
  opts: { maxHops?: number; originId?: string } = {}
): Lineage {
  const index: NodeIndex = nodes instanceof Map ? nodes : indexNodes(nodes);
  const maxHops = opts.maxHops ?? MAX_HOPS;
  const originId = opts.originId ?? ORIGIN_ID;

  const start = index.get(id);
  if (!start) {
    return {
      status: "unknown_node",
      path: [],
      ancestors: [],
      root: null,
      reason: `no record with id "${id}"`,
    };
  }

  // Collected node-first, reversed at the end so callers always read origin-first.
  const walked: LineageRef[] = [toRef(start)];
  const visited = new Set<string>([start.id]);
  let current = start;

  for (let hop = 0; hop < maxHops; hop++) {
    const parentId = current.referredById;
    if (!parentId) break; // reached a root — validated below

    if (visited.has(parentId)) {
      const path = walked.slice().reverse();
      return {
        status: "broken_cycle",
        path,
        ancestors: path.slice(0, -1),
        root: path[0],
        reason: `referral loop: ${current.name} refers back to an earlier hop`,
      };
    }

    const parent = index.get(parentId);
    if (!parent) {
      const path = walked.slice().reverse();
      return {
        status: "broken_missing",
        path,
        ancestors: path.slice(0, -1),
        root: path[0],
        reason: `${current.name} was referred by "${parentId}", which has no record`,
      };
    }

    // The relationship lives on the CHILD ("how my referrer knows me"), so it
    // is carried onto the parent's chip: that chip is the hop that used it.
    visited.add(parent.id);
    walked.push(toRef(parent, current.relationship));
    current = parent;

    if (parent.id === originId) break;
  }

  const path = walked.slice().reverse();
  const ancestors = path.slice(0, -1);
  const root = path[0];

  if (root.id === originId) {
    return { status: "rooted", path, ancestors, root };
  }

  // Still has a parent after maxHops → depth, not a genuine root.
  if (current.referredById) {
    return {
      status: "broken_depth",
      path,
      ancestors,
      root,
      reason: `chain exceeds ${maxHops} hops without reaching the origin`,
    };
  }

  return {
    status: "broken_root",
    path,
    ancestors,
    root,
    reason: `chain ends at ${root.name}, not the origin — no referral path back to Rob`,
  };
}

/** Everyone whose door THIS node opened, directly (the "doors opened by X" line). */
export function doorsOpenedBy(nodes: readonly Person[], id: string): LineageRef[] {
  return nodes.filter((n) => n.referredById === id).map((n) => toRef(n, n.relationship));
}

/**
 * Breadcrumb text. §5: hops ≥4 middle-truncate to `ROB → … → Sarah`; the
 * ellipsis is what the UI makes expandable.
 */
export function formatChain(
  refs: readonly LineageRef[],
  opts: { separator?: string; truncateAt?: number } = {}
): string {
  const sep = opts.separator ?? " → ";
  const truncateAt = opts.truncateAt ?? 4;
  if (refs.length === 0) return "";
  if (refs.length < truncateAt) return refs.map((r) => r.name).join(sep);
  return [refs[0].name, "…", refs[refs.length - 1].name].join(sep);
}

/** True when the chain can be shown as fact rather than with a warning chip. */
export function isTrustworthy(l: Lineage): boolean {
  return l.status === "rooted";
}
