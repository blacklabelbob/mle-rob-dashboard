// Q84 inc.186 — what a `prefix*` pattern IS, in one place, below everything that uses one.
//
// These three lived in `keyNamespace.ts` because that was the only file that needed them. inc.186
// added a second: `producedFamily.ts` DERIVES a pattern from a producing function, and it must
// refuse a fixed part that already ends in `*` — the same "does this string stand for a family"
// question `isPattern` answers. Importing it back from `keyNamespace` made a cycle (the registry
// there calls the derivation at module load), and the cycle threw at import time.
//
// The fix is layering, not a second copy: the shape primitives go to the bottom, derivation sits
// on them, and the registry sits on both. `keyNamespace` re-exports them, so every existing
// importer is untouched and there is still exactly ONE definition of each rule. PURE per CR-3.

/** One key a filer can emit: a literal, or a fixed prefix ending in `*` for a parameterised key. */
export type KeyPattern = string;

/** True when the pattern stands for a family of keys rather than one string. */
export function isPattern(key: KeyPattern): boolean {
  return key.endsWith("*");
}

/** The fixed part of a pattern — the whole string when it is a literal. */
export function fixedPrefix(key: KeyPattern): string {
  return isPattern(key) ? key.slice(0, -1) : key;
}
