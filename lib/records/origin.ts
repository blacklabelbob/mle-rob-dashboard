// Q70/0031 — WHO THE ORIGIN IS, once, for every module that has to know.
//
// Rob's rule (BUILD-QUEUE Q39(e)) is that every attribution line must run all
// the way back to Rob, and both engines that enforce it — `lib/lineage.ts` and
// `lib/referrals/chain.ts` — each carried their own copy of his id as the
// literal string "rob-acheson". That string WAS his primary key until 0031
// renumbered people to record numbers; his row is now `P-1001` and the name is
// preserved as `legacy_slug`. A hardcoded name-slug root is therefore the exact
// defect Q70 exists to remove — an identity spelled as a name — and it is not
// a latent one: the moment the renumber landed, `lineage()` terminated its walk
// at a node whose id no longer equalled the origin (every chain on prod reading
// `broken_root`), and `buildChain` seeded its BFS from a node that is not in
// the graph at all (every company reading `unreachable`).
//
// The fix is NOT to swap one literal for another. `P-1001` is only Rob's id
// because that is what 0031's sequence happened to assign him, and a second
// positional assumption is how the first one survived this long. So the origin
// is RESOLVED against the data it is being asked about: whichever spelling is
// actually present in the node set wins, record number first. That keeps the
// engines correct on post-migration prod rows AND on pre-migration fixtures and
// any store still keyed by slug, without either caller knowing which world it
// is in.
//
// Pure per CR-3: no clock, no network, no store. Every result is a function of
// the ids passed in.

/** Rob's record number — the identity 0031 assigned, stable from here on. */
export const ORIGIN_ID = "P-1001";

/** What Rob's id used to be, kept alive on his row as `legacy_slug`. */
export const ORIGIN_LEGACY_SLUG = "rob-acheson";

/**
 * True for either spelling of the origin.
 *
 * Used for the "is this Rob" question — the origin chip on his own record, the
 * `isOrigin` flag on a lineage ref — where the answer must not depend on which
 * side of the migration the row came from.
 */
export function isOriginId(id: string | null | undefined): boolean {
  return id === ORIGIN_ID || id === ORIGIN_LEGACY_SLUG;
}

/**
 * The origin id AS THIS DATA SET SPELLS IT.
 *
 * Record number first: after 0031 both spellings can be present in one graph
 * (his id is `P-1001`, his `legacy_slug` is still `rob-acheson`), and the walk
 * must terminate on the value the FK columns actually point at — the id.
 *
 * Falls back to `ORIGIN_ID` when neither is present, so a graph with no Rob in
 * it reports "cannot reach the origin" rather than silently electing some other
 * node the root.
 */
export function resolveOriginId(ids: Iterable<string>): string {
  let legacy = false;
  for (const id of ids) {
    if (id === ORIGIN_ID) return ORIGIN_ID;
    if (id === ORIGIN_LEGACY_SLUG) legacy = true;
  }
  return legacy ? ORIGIN_LEGACY_SLUG : ORIGIN_ID;
}
