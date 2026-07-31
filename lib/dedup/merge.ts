// Person-merge planner (PRD Task 4.2). Given the survivor + duplicate and a
// snapshot of the rows that reference them, emit the exact ordered operation
// list that folds the duplicate into the survivor with ZERO orphaned FKs.
// Pure + stateless per CR-3: no network, no clock (caller passes `now`) — the
// executor (API route / merge UI) owns the Supabase client and runs the ops
// in order. The planner NEVER auto-runs; merging is always an explicit click.
//
// FK surface covered (every people(id) reference in supabase/migrations):
//   people.referred_by_id · orgs.referred_by_id · edges.from_id/to_id ·
//   org_memberships.person_id · deals.person_id · activities.person_id ·
//   tasks.person_id — plus the dedup_review pair row and the duplicate itself.
//
// Money-field guard (driver hard limit: never modify signed/quoted/paid money
// fields without an explicit Rob instruction): if the duplicate carries
// signed=true, a quoted_amount, or an estimate, deleting it would silently
// destroy money data — the plan REFUSES with blockers instead of guessing.

import { pairKey } from "@/lib/dedup/run";
import { mergedNote } from "@/lib/dedup/resolutionNote";

// Contact-ish fields folded survivor←duplicate when the survivor's is empty.
// Money fields (quoted_amount, signed, estimate) are structurally absent.
const FOLD_FIELDS = [
  "business",
  "role",
  "phone",
  "email",
  "website",
  "relationship",
  "description",
  "notes",
  "meeting_video_url",
  "transcript_url",
  "assigned_rep",
] as const;

export interface MergePerson {
  id: string;
  referred_by_id?: string | null;
  signed?: boolean | null;
  quoted_amount?: number | null;
  estimate?: unknown;
  [field: string]: unknown;
}

export interface MergeEdge {
  id: string;
  from_id: string;
  to_id: string;
}

export interface MergeMembership {
  person_id: string;
  org_id: string;
}

export type MergeOp =
  | { table: string; action: "update"; where: Record<string, string>; set: Record<string, unknown> }
  | { table: string; action: "delete"; where: Record<string, string> };

export type MergePlan =
  | { ok: true; ops: MergeOp[]; folds: Record<string, unknown> }
  | { ok: false; blockers: string[] };

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function planPersonMerge(input: {
  survivor: MergePerson;
  duplicate: MergePerson;
  /** ALL edge rows touching either person (both directions). */
  edges: MergeEdge[];
  /** ALL org_memberships rows for either person. */
  memberships: MergeMembership[];
  now: string;
}): MergePlan {
  const { survivor, duplicate, now } = input;
  const sId = survivor.id;
  const dId = duplicate.id;

  const blockers: string[] = [];
  if (sId === dId) blockers.push("survivor and duplicate are the same record");
  if (/^demo-/.test(sId) || /^demo-/.test(dId)) blockers.push("demo records are never merged");
  if (duplicate.signed === true)
    blockers.push("duplicate is SIGNED — merging would delete a signed record (Rob call only)");
  if (duplicate.quoted_amount !== null && duplicate.quoted_amount !== undefined)
    blockers.push("duplicate carries quoted_amount — money data would be destroyed (Rob call only)");
  if (duplicate.estimate !== null && duplicate.estimate !== undefined)
    blockers.push("duplicate carries an estimate — money data would be destroyed (Rob call only)");
  if (blockers.length > 0) return { ok: false, blockers };

  const ops: MergeOp[] = [];

  // 1. Survivor field folds — fill empty survivor fields from the duplicate.
  const folds: Record<string, unknown> = {};
  for (const field of FOLD_FIELDS) {
    if (isEmpty(survivor[field]) && !isEmpty(duplicate[field])) folds[field] = duplicate[field];
  }
  // Survivor pointing at the duplicate as its door-opener: inherit the
  // duplicate's referrer (never a self-reference).
  if (survivor.referred_by_id === dId) {
    const inherited = duplicate.referred_by_id;
    folds.referred_by_id = !inherited || inherited === sId ? null : inherited;
  }
  if (Object.keys(folds).length > 0) {
    ops.push({ table: "people", action: "update", where: { id: sId }, set: folds });
  }

  // 2. Edges: repoint duplicate's ends to the survivor; drop rows that become
  // self-edges or collide with an edge the survivor already has.
  const survivorPairs = new Set(
    input.edges
      .filter((e) => e.from_id !== dId && e.to_id !== dId)
      .map((e) => `${e.from_id}>${e.to_id}`)
  );
  const sortedEdges = [...input.edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const edge of sortedEdges) {
    if (edge.from_id !== dId && edge.to_id !== dId) continue;
    const newFrom = edge.from_id === dId ? sId : edge.from_id;
    const newTo = edge.to_id === dId ? sId : edge.to_id;
    const pair = `${newFrom}>${newTo}`;
    if (newFrom === newTo || survivorPairs.has(pair)) {
      ops.push({ table: "edges", action: "delete", where: { id: edge.id } });
    } else {
      survivorPairs.add(pair); // two dup edges collapsing onto the same pair → keep one
      ops.push({
        table: "edges",
        action: "update",
        where: { id: edge.id },
        set: { from_id: newFrom, to_id: newTo },
      });
    }
  }

  // 3. Door-opener pointers on OTHER rows (survivor's own was handled in 1;
  // these ops run after it, so the blanket can never create a self-reference).
  ops.push({
    table: "people",
    action: "update",
    where: { referred_by_id: dId },
    set: { referred_by_id: sId },
  });
  ops.push({
    table: "orgs",
    action: "update",
    where: { referred_by_id: dId },
    set: { referred_by_id: sId },
  });

  // 4. Org memberships: repoint, deleting any that would collide with a
  // membership the survivor already holds (unique person_id+org_id).
  const survivorOrgIds = new Set(
    input.memberships.filter((m) => m.person_id === sId).map((m) => m.org_id)
  );
  const dupMemberships = input.memberships
    .filter((m) => m.person_id === dId)
    .sort((a, b) => a.org_id.localeCompare(b.org_id));
  for (const m of dupMemberships) {
    if (survivorOrgIds.has(m.org_id)) {
      ops.push({ table: "org_memberships", action: "delete", where: { person_id: dId, org_id: m.org_id } });
    } else {
      survivorOrgIds.add(m.org_id);
      ops.push({
        table: "org_memberships",
        action: "update",
        where: { person_id: dId, org_id: m.org_id },
        set: { person_id: sId },
      });
    }
  }

  // 5. CRM anchors: blanket repoints, no data needed (no unique constraints).
  for (const table of ["deals", "activities", "tasks"]) {
    ops.push({ table, action: "update", where: { person_id: dId }, set: { person_id: sId } });
  }

  // 6. Close the review-queue row for this pair (same canonical id order as
  // the detector), then delete the duplicate — LAST, once nothing points at it.
  const [aId, bId] = [sId, dId].sort();
  ops.push({
    table: "dedup_review",
    action: "update",
    where: { pair_key: pairKey("person", { aId, bId }) },
    set: { status: "resolved", resolved_at: now, resolution_note: mergedNote(dId, sId) },
  });
  ops.push({ table: "people", action: "delete", where: { id: dId } });

  return { ok: true, ops, folds };
}
