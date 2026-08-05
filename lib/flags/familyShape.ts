// Q84 inc.187 — the half of the family the derivation does not reach: its SUFFIX.
//
// inc.186 derived `wrapper-census-departure:*` from `departureKey` and proved the PREFIX: every
// key this filer mints starts with that string, checked against a hostile probe list. Nothing
// constrains what follows it. `departureKey(name)` accepts any string, so the registry's one
// pattern is a claim about a family whose members are whatever the census happens to be holding.
//
// That is not a hypothetical about spelling. Three properties the namespace report DEPENDS ON are
// properties of the whole key, not of its prefix:
//
//   `/` in the name   → `keyNamespace("wrapper-census-departure:a/b.sh")` is
//                       `wrapper-census-departure:a` — a namespace NO filer declares. The row is
//                       on prod inside a space `findSharedNamespaces` never sees, and
//                       `findUnnamespacedKeys` stops counting the family as bare, so the shape
//                       printed is the shape of a key set prod does not have.
//   `*` at the end    → the key is a LITERAL that every reader here reads as a family:
//                       `isPattern` is true, `fixedPrefix` silently shortens it, and
//                       `keysOverlap` reports it overlapping every key sharing that prefix. One
//                       row would manufacture a cross-filer collision that does not exist.
//   `,` in the name   → inc.168's transport hole. Already proved and already handled by
//                       `keySurvivesTransport`, so it is REUSED here rather than re-listed — a
//                       second copy of that rule is the disease inc.164 named.
//
// MEASURED FIRST, per the house rule. Against the committed census as it stands: **33 names, 33
// inside the shape, zero escapes.** The character set in use is `[a-z0-9.-]` — nothing near a
// separator. So the suffixes ARE constrained in practice, and this file does not invent a
// restriction the tree needed; it states the one already being obeyed, where it can be seen.
//
// WHY STATE IT AT ALL, THEN — BECAUSE ONLY ONE OF THE TWO PATHS IS CONSTRAINED. Live names come
// from `path.basename(file)` in `audit-wrapper-clocks.mjs`, which cannot emit a `/` — a real
// constraint, enforced nowhere near the key producer and stated in no comment. CARRIED names come
// out of `docs/integrity/wrapper-census.json`, and the only thing they pass is
// `unreadableCarriedField`, which asks whether `name` is a non-empty string and nothing else. A
// hand-edit, a merge, or a future scanner that keeps a path instead of a basename puts a name
// through the second path that the first could never produce.
//
// SO THIS REPORTS AND REFUSES NOTHING. Rejecting a carried row withholds a correction, and a
// withheld correction leaves a stale enforcement claim on Rob's page (the defect inc.162 exists to
// kill) — too high a price for a shape defect that has never occurred. inc.184/185 chose a build
// failure for claims about the REGISTRY; this is a claim about DATA, so it prints. PURE per CR-3:
// no clock, no network, no I/O.

import { fixedPrefix, isPattern, keyNamespace, type KeyPattern } from "./keyNamespace";
import { keySurvivesTransport } from "./ledgerRead";

/** A produced key that is inside its family's prefix but breaks something the report assumes. */
export type FamilyEscape = {
  /** The variable part handed to the producer — what a reader has to go fix. */
  name: string;
  /** The key that variable part mints. */
  key: string;
  /** What it breaks, in the reporter's words. */
  defect: string;
};

/**
 * Why this key is not a well-formed member of `family`, or `null` when it is one.
 *
 * Each rule names the reader it breaks, because a shape rule with no consequence attached is the
 * kind that gets relaxed by the next person who finds it inconvenient.
 */
export function familyMemberDefect(key: string, family: KeyPattern): string | null {
  const prefix = fixedPrefix(family);
  if (!key.startsWith(prefix)) {
    return `does not start with "${prefix}" — it is not in this family at all, so the registry describes it nowhere`;
  }
  if (isPattern(key)) {
    return `ends in "*" — a literal key that every reader here reads as a family: \`fixedPrefix\` shortens it and \`keysOverlap\` reports collisions with keys nothing can collide with`;
  }
  const ns = keyNamespace(key);
  if (ns !== keyNamespace(family)) {
    return `carries a "/" — \`keyNamespace\` reads it as namespace "${ns}", which no filer in LEDGER_FILERS declares, so the namespace report is measured against a space prod is not using`;
  }
  if (!keySurvivesTransport(key)) {
    return `does not survive the ledger read's key param (inc.168) — the row can be filed and never asked about again`;
  }
  return null;
}

/**
 * Every name whose key leaves the family its producer advertises.
 *
 * Takes the producer rather than pre-built keys so the check runs on the same function the
 * registry derived the pattern from — one source, the way inc.186 made the prefix have one.
 */
export function familyEscapes(
  produce: (name: string) => string,
  names: readonly string[],
  family: KeyPattern,
): FamilyEscape[] {
  const escapes: FamilyEscape[] = [];
  for (const name of names) {
    const key = produce(name);
    const defect = familyMemberDefect(key, family);
    if (defect !== null) escapes.push({ name, key, defect });
  }
  return escapes;
}

/**
 * One line per escape, for the reporter to print under the declaration audit.
 *
 * Silent when there are none: the "33 of 33 inside the shape" line is the reporter's to print, so
 * that the count and its denominator sit together where a reader can judge them.
 */
export function familyShapeLines(escapes: readonly FamilyEscape[]): string[] {
  return escapes.map(
    (e) =>
      `KEY LEAVES ITS FAMILY: census name ${JSON.stringify(e.name)} mints "${e.key}", which ${e.defect}.`,
  );
}
