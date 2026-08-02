// Q84 inc.116 — A GUARD WHOSE ANCHOR NO LONGER EXISTS IS PERMANENTLY GREEN.
//
// inc.114 pinned the WALK (a file outside the roots is invisible to every rule) and inc.115 made
// that perimeter shared, so widening it for one door widens it for both. Both of those are about
// the SET of files a guard sees. This module is about the one NAME each guard hangs its whole rule
// off, and the failure it prevents is quieter than an unscanned file: rename the thing a guard
// names and the guard does not go red, it goes silent. `unscopedPayloadWriters` with a stale
// `SCOPED_PAYLOAD_WRITER` reports no offenders because the door it excludes is gone; a `READER`
// that names nothing on the tree finds no callers to grade. "No offenders" and "no subject" print
// the same colour.
//
// THE HANDOVER SAID NOTHING PINS EITHER ANCHOR. READ FIRST, AND THAT IS HALF WRONG — which is why
// it was read before it was built on (inc.109, inc.110). The WRITE door's test already asserted
// `TREE.some(f => f.path === SCOPED_PAYLOAD_WRITER)`, in so many words. The READ door's test
// asserts something that LOOKS like the same pin and is not: it pins a CALLER
// (`components/ThingsToAddress.tsx` is in `readerCallers(TREE)`), not the DECLARATION. That is a
// weaker guarantee wearing the stronger one's name — it holds only while a live caller exists, so
// the day the last caller is refactored away the reader can be deleted outright and the read door
// reports a clean tree about a function that is not there.
//
// AND THE TWO PINS WERE TWO BESPOKE ASSERTIONS, WHICH IS THE inc.115 SHAPE AGAIN: the same
// question — *does the name my rule hangs off still exist* — answered twice, in two test files, in
// two different ways, so strengthening one does nothing for the other. It is answered once here.
//
// THE TRAP THAT MAKES THE DECLARATION PIN NON-TRIVIAL, AND IT IS LIVE ON THIS TREE: `readerGate.ts`
// spells `export function hostConfirmControls(` twice in its own comments, explaining that the
// declaration is not a call. A pin that accepts any file's text is therefore satisfied by the
// GUARD'S OWN PROSE — rename the reader and the pin stays green because the guard still describes
// it.
//
// THE FIRST FIX WAS A LIST OF FILES WHOSE TEXT IS COMMENTARY, AND THE LIST WAS WRONG THE HOUR IT
// WAS WRITTEN: mutation-testing it caught THIS module quoting the declaration in the paragraph
// above, so the pin vouched for its own anchor. A second entry would have fixed today and left the
// same hole for the next file that documents the rule — and it would have failed SILENTLY, which
// is the defect the whole module exists to prevent. So the rule is structural instead: a
// declaration BEGINS ITS LINE (after indentation and an optional `export` / `export default`).
// Every false voucher on this tree is inside backticks mid-sentence, and none of them can pass
// that, however many more get written. The exclusion list is gone rather than lengthened.
//
// Pure per CR-3 — handed file contents, returns a verdict. No filesystem, no clock, no network.

import type { SourceFile } from "./scanPerimeter";

/**
 * The one name a guard's rule hangs off, and how to prove it still exists.
 *
 * `path` — the anchor IS a file (an excluded route, a rule file). Present iff the walk holds it.
 * `declaration` — the anchor is an identifier. Present iff some walked file DECLARES it, which is
 * a different question from mentioning it, and a stricter one than any list of trusted files.
 */
export type Anchor =
  | { readonly kind: "path"; readonly name: string }
  | { readonly kind: "declaration"; readonly name: string };

/**
 * `function X`, `class X`, `const|let|var X` — the shapes that BIND the name — and only where the
 * declaration BEGINS ITS LINE, after indentation and an optional `export` / `export default`.
 *
 * The line anchor is the whole point and not a tidy-up: it is what separates code from the prose
 * that describes code. Three files on this tree spell `export function hostConfirmControls(` inside
 * backticks mid-sentence while explaining the rule, and one of them is this module.
 *
 * Deliberately textual and deliberately narrow, the same trade the rest of this family makes. It
 * does not see `export { x as X }`, a name bound by destructuring, or a declaration written after
 * a semicolon on a shared line. The honest word for that is a limit, and its direction is safe: a
 * missed declaration turns a pin RED on something real, it never colours a rename green.
 */
function declares(text: string, name: string): boolean {
  return new RegExp(
    `^[ \\t]*(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(?:function|class|const|let|var)\\s+${name}(?![\\w$])`,
    "m",
  ).test(text);
}

/**
 * Every walked file that is EVIDENCE the anchor still exists — a path match, or a declaration in a
 * file that is not merely quoting it. Sorted, so a surprise reads as a list rather than a diff.
 */
export function anchorSites(anchor: Anchor, files: readonly SourceFile[]): string[] {
  if (anchor.kind === "path") {
    return files.filter((f) => f.path === anchor.name).map((f) => f.path).sort();
  }
  return files
    .filter((f) => declares(f.text, anchor.name))
    .map((f) => f.path)
    .sort();
}

/**
 * The sentence a failing pin prints, or null when the anchor is still there.
 *
 * It names the GUARD, for inc.115's reason — a shared check that will not say which door went
 * blind is one nobody can act on — and it leads with the consequence rather than the syntax,
 * because the reader's instinct on seeing a red guard is to fix the guard, and the fix here is
 * almost always to point the anchor at the name the tree now uses.
 */
export function missingAnchorNotice(
  anchor: Anchor,
  guard: string,
  files: readonly SourceFile[],
): string | null {
  if (anchorSites(anchor, files).length) return null;
  const what = anchor.kind === "path" ? `the file ${anchor.name}` : `a declaration of ${anchor.name}`;
  return (
    `${guard} is anchored on ${what}, and the walk found none. The guard is not clean, it is ` +
    `empty: with nothing to name, every rule in it passes on a tree it is no longer reading. ` +
    `Point the anchor at the name this repo uses now — do not delete the check to make it green.`
  );
}
