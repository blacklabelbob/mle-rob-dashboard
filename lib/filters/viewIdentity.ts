/**
 * Q67b — WHO the picker files a view under, decided in one pure place.
 *
 * Every other door on this chain already refuses to default an owner: the route (`owner_id`
 * comes off the wire, Q66's line), `viewsClient` (`requireOwner` on list and delete), and
 * `viewPicker` (no `saveScope` → the duplicate-name question is left unjudged rather than
 * guessed). This is the last place that question gets asked, so it is the place that must
 * not answer it with a fabrication.
 *
 * There are no user records yet — Q64 (access) and Q6 (Phase 4 profiles) own that — so the
 * only identity the browser can have today is one Rob configures. That is a **deployment
 * setting, not an authorship model**: nothing here mints an id, and when Phase 4 lands the
 * same shape comes from the session instead, with one call site to change.
 *
 * The rule this file exists to enforce: **an unset identity is its own state, never a
 * stand-in owner.** A picker that quietly filed views under `"unknown"` (or `"rob"`, or
 * the empty string the route would reject) would build a list that belongs to nobody:
 * every rep who ever opened the dashboard would see, rename and delete each other's views,
 * and the two partial unique indexes in 0019 would collide across people who never met.
 * A missing identity costs the SAVE affordance — visibly absent, with a reason — while the
 * rows, the share links and the read path all keep working exactly as they do today.
 */

import type { SavedView } from "./savedViews";

/** The rep a picker lists and saves for. Same shape `viewPicker`'s `saveScope` wants. */
export type ViewIdentity = {
  owner: string;
  /** `null` when this rep is on no team — team views are then simply not offered. */
  team: string | null;
};

/** Raw, client-visible configuration. Both values may be absent; that is the normal case. */
export type ViewIdentityConfig = {
  owner?: string | null;
  team?: string | null;
};

/**
 * Values that look configured but identify nobody. A build pipeline that substitutes an
 * unset variable with its own name, or a copied `.env.example`, produces exactly these —
 * and each one would otherwise become a real `owner_id` on a real row in `saved_views`.
 */
const PLACEHOLDERS = new Set([
  "undefined",
  "null",
  "none",
  "todo",
  "changeme",
  "your-owner-id",
  "$next_public_view_owner",
]);

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? null : trimmed;
}

/**
 * Resolve the configured identity, or `null` when there isn't one.
 *
 * `null` is a first-class answer the caller must render — see the header. A team without
 * an owner is NOT an identity: the route's list query keys personal views off the owner,
 * so a team-only scope would hand this browser the team's shared views under a person who
 * cannot save, rename or delete any of them.
 */
export function resolveViewIdentity(config: ViewIdentityConfig): ViewIdentity | null {
  const owner = clean(config.owner);
  if (owner === null) return null;
  return { owner, team: clean(config.team) };
}

/**
 * The scope a Save would use, in `viewPicker`'s shape.
 *
 * Personal unless a team is asked for AND this rep has one: "share with the team" from a
 * rep with no team would write a `team` row with a null `team_id`, which 0019's partial
 * index treats as one global name space — a view nobody can find and a name nobody else
 * can reuse.
 */
export function viewSaveScope(
  identity: ViewIdentity,
  shared = false,
): { scope: SavedView["scope"]; owner_id: string; team_id: string | null } {
  const team = shared && identity.team !== null;
  return {
    scope: team ? "team" : "personal",
    owner_id: identity.owner,
    team_id: team ? identity.team : null,
  };
}

/** Can this rep offer "share with my team" at all? False when they are on no team. */
export function canShareWithTeam(identity: ViewIdentity | null): boolean {
  return identity !== null && identity.team !== null;
}
