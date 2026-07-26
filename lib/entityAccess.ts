/**
 * Q66 inc.1 — the typed accessor over `entity_access`
 * (supabase/migrations/0017_entity_access.sql). Design ported — not code-copied — from
 * the 2026-07-25 Macro teardown, 01-architecture.md §4.4.
 *
 * Pure and stateless per CR-3: no network, no Date.now(). This module answers
 * "does this subject hold at least level L on this entity?" against grants a caller
 * already fetched; it never fetches, and it is deliberately NOT wired into any route
 * yet — the enforcement half of Q66 is RLS policies, a later increment.
 *
 * Why a module at all, when the answer will live in RLS: the ladder comparison has one
 * genuinely dangerous failure mode (see ACCESS_LEVELS), the same ladder has to exist on
 * both sides of the wire for the UI to grey out a button, and a subject expansion that
 * differs between TS and SQL is an access bug rather than a rendering bug. Keeping both
 * in one file, parity-tested against the migration, is what stops them drifting.
 */

import { PROPERTY_ENTITY_TYPES, type PropertyEntityType } from "./entityProperties";

/**
 * The kinds a grant can be about. Same closed set as the 0015 spine — one vocabulary
 * for the whole cross-cutting surface, so a filter, a custom field and a grant can
 * never disagree about what "deal" means.
 */
export const ACCESS_ENTITY_TYPES = PROPERTY_ENTITY_TYPES;
export type AccessEntityType = PropertyEntityType;

/**
 * The ladder, weakest first. ORDER IS LOAD-BEARING: `accessLevelAtLeast` reads its
 * index, and so does `access_level_rank()` in 0017.
 *
 * The failure mode this prevents: comparing the level strings directly sorts them
 * alphabetically — 'comment' < 'edit' < 'owner' < 'view' — which puts VIEW, the
 * weakest level, above OWNER. A `>=` on raw text therefore grants a viewer everything
 * and denies an owner nothing, silently, with no error anywhere. Never compare the
 * strings; always go through this array or the SQL function.
 */
export const ACCESS_LEVELS = ["view", "comment", "edit", "owner"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Who a grant is for. Polymorphic subject — Macro's decision 1, taken verbatim. */
export const SUBJECT_TYPES = ["user", "team", "role"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type Subject = { subject_type: SubjectType; subject_id: string };

export type EntityAccessGrant = {
  entity_type: AccessEntityType;
  entity_id: string;
  subject_type: SubjectType;
  subject_id: string;
  access_level: AccessLevel;
  /** NULL/undefined = a direct grant; set = inherited, and revoked with its container. */
  granted_from_entity_type?: AccessEntityType | null;
  granted_from_entity_id?: string | null;
};

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);
}

export function isSubjectType(v: unknown): v is SubjectType {
  return typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);
}

export function isAccessEntityType(v: unknown): v is AccessEntityType {
  return typeof v === "string" && (ACCESS_ENTITY_TYPES as readonly string[]).includes(v);
}

/** 1-based rank matching `access_level_rank()` in 0017. Unknown level ranks 0. */
export function accessLevelRank(level: string): number {
  const i = (ACCESS_LEVELS as readonly string[]).indexOf(level);
  return i === -1 ? 0 : i + 1;
}

/** Ladder comparison. The ONLY sanctioned way to ask "is this level enough?". */
export function accessLevelAtLeast(held: string, required: AccessLevel): boolean {
  const heldRank = accessLevelRank(held);
  // An unrecognised level is not "some access we don't understand" — it is no access.
  // Failing closed here matters because this is reached with values straight from the
  // database, and a level added to the CHECK but not to ACCESS_LEVELS must lock down
  // rather than open up. The parity test makes that a build failure, not a runtime one.
  return heldRank > 0 && heldRank >= accessLevelRank(required);
}

/**
 * The provenance rule the migration also enforces: a grant's reason is a PAIR or it is
 * nothing. A half-set pair is a grant no cascade can find — i.e. access that leaks
 * forever, the exact bug provenance exists to prevent.
 */
export function isWellFormedGrant(g: EntityAccessGrant): boolean {
  if (!isAccessEntityType(g.entity_type) || g.entity_id.trim() === "") return false;
  if (!isSubjectType(g.subject_type) || g.subject_id.trim() === "") return false;
  if (!isAccessLevel(g.access_level)) return false;

  const type = g.granted_from_entity_type ?? null;
  const id = g.granted_from_entity_id ?? null;
  if (type === null && id === null) return true; // direct grant
  if (type === null || id === null) return false; // half a reason
  return isAccessEntityType(type) && id.trim() !== "";
}

/** True when this grant is inherited from a container rather than made by hand. */
export function isInheritedGrant(g: EntityAccessGrant): boolean {
  return (g.granted_from_entity_id ?? null) !== null;
}

/**
 * Which grants a container's deletion revokes — the TS mirror of the 0017 trigger, so
 * a preview ("removing this org un-shares 4 records") and the database agree on the
 * answer. Both arms, same as the trigger: the container's own grants, plus every grant
 * that named it as its reason. Direct grants on OTHER entities are untouched.
 */
export function grantsRevokedByDeleting(
  grants: readonly EntityAccessGrant[],
  container: { entity_type: AccessEntityType; entity_id: string },
): EntityAccessGrant[] {
  return grants.filter(
    (g) =>
      (g.entity_type === container.entity_type && g.entity_id === container.entity_id) ||
      ((g.granted_from_entity_type ?? null) === container.entity_type &&
        (g.granted_from_entity_id ?? null) === container.entity_id),
  );
}

/**
 * Expand a caller into the set of subjects a grant may be addressed to — the TS form of
 * Macro's `user_source_ids` CTE. Their point, which is the good one: joining a team
 * instantly widens what you can see with no permission backfill, because membership is
 * read at query time rather than baked into grants.
 *
 * Duplicates are collapsed so a caller who is in a team twice cannot produce duplicate
 * semi-join rows.
 */
export function expandSubjects(caller: {
  userId: string;
  teamIds?: readonly string[];
  roles?: readonly string[];
}): Subject[] {
  const out: Subject[] = [];
  const seen = new Set<string>();
  const push = (subject_type: SubjectType, subject_id: string) => {
    const id = subject_id.trim();
    if (id === "") return;
    const key = `${subject_type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ subject_type, subject_id: id });
  };

  push("user", caller.userId);
  for (const t of caller.teamIds ?? []) push("team", t);
  for (const r of caller.roles ?? []) push("role", r);
  return out;
}

/**
 * The highest level `subjects` hold on one entity, or null for no access at all.
 * Malformed grants are ignored rather than trusted — an ACL is the last place to
 * interpret a row we cannot parse.
 */
export function effectiveAccessLevel(
  grants: readonly EntityAccessGrant[],
  subjects: readonly Subject[],
  entity: { entity_type: AccessEntityType; entity_id: string },
): AccessLevel | null {
  let best: AccessLevel | null = null;
  for (const g of grants) {
    if (!isWellFormedGrant(g)) continue;
    if (g.entity_type !== entity.entity_type || g.entity_id !== entity.entity_id) continue;
    if (
      !subjects.some(
        (s) => s.subject_type === g.subject_type && s.subject_id === g.subject_id,
      )
    ) {
      continue;
    }
    if (best === null || accessLevelRank(g.access_level) > accessLevelRank(best)) {
      best = g.access_level;
    }
  }
  return best;
}

/** "May this caller do X here?" — the question a route or a disabled button asks. */
export function canAccess(
  grants: readonly EntityAccessGrant[],
  subjects: readonly Subject[],
  entity: { entity_type: AccessEntityType; entity_id: string },
  required: AccessLevel,
): boolean {
  const held = effectiveAccessLevel(grants, subjects, entity);
  return held !== null && accessLevelAtLeast(held, required);
}
