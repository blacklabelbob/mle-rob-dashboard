// Q70 inc.3 (2026-07-28): the cutover seam. Migration 0031 renumbers people/orgs to
// record numbers (P-1001 / C-2001) and keeps the old name-slug forever in
// `legacy_slug`. That column is worthless until something READS it — until then
// every bookmark, every emailed /people/caleb-green link and every id a human
// wrote down 404s the moment the migration lands.
//
// This is that reader, and it is pure so the rules below are decided once and
// tested without a database in the room.
//
// THE RULE THAT MATTERS: an exact id match ALWAYS wins, and is checked across the
// whole set before any legacy slug is considered. One row's legacy slug can
// collide with another row's live id (nothing forbids a future record literally
// named "P-1001", and slugs are user-typed), and if the legacy pass ran first —
// or ran per-row inside one loop — the URL for a live record would silently open
// a DIFFERENT record. A person looking at the wrong contact cannot tell.
//
// AMBIGUITY IS NEVER A FIRST-HIT GUESS (the rule lib/calls/recordingActivity.ts
// already holds): if two rows carry the same legacy slug, this returns nothing.
// A 404 is a visible absence a human can report; the wrong record is a lie they
// cannot see.

export type RecordRef = { id: string; legacySlug?: string };

export type RecordMatch<T extends RecordRef> = {
  row: T;
  /** true when the requested string IS the row's current id; false when it was
   *  matched through `legacy_slug` and the caller should redirect to `row.id`. */
  canonical: boolean;
};

/**
 * Resolve a requested record id against current ids first, then legacy slugs.
 * Returns null for no match, an ambiguous legacy slug, or a blank request.
 */
export function resolveRecord<T extends RecordRef>(
  rows: readonly T[],
  requested: string | null | undefined,
): RecordMatch<T> | null {
  // A blank request must not match a row whose legacy_slug is null/"" — an
  // absent value is not an identity.
  if (typeof requested !== "string") return null;
  const want = requested.trim();
  if (!want) return null;

  const exact = rows.find((r) => r.id === want);
  if (exact) return { row: exact, canonical: true };

  const legacy = rows.filter((r) => (r.legacySlug ?? "") === want);
  if (legacy.length !== 1) return null; // 0 = unknown, >1 = ambiguous
  return { row: legacy[0], canonical: false };
}

/**
 * The id the URL should settle on: the row's record number when the request came
 * in on an old slug, otherwise null (already canonical / no match — nothing to do).
 */
export function canonicalRedirectId<T extends RecordRef>(
  rows: readonly T[],
  requested: string | null | undefined,
): string | null {
  const match = resolveRecord(rows, requested);
  if (!match || match.canonical) return null;
  return match.row.id;
}
