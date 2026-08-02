// Q84 inc.118 — A RULE CAN HANG OFF A NAME THAT NEVER BECOMES AN ANCHOR.
//
// inc.117's registry proves every DECLARED anchor is pinned. That is a complete answer to a
// question nobody was asking twice, and it says nothing at all about the other way a guard names
// the tree: a bare string constant. `readerGate.ts` excludes ITSELF by path — `RULE_FILE` — so the
// one file allowed to quote the call it forbids is not judged for quoting it. That path is load
// bearing in exactly the way an anchor is, and it was not an anchor, so nothing on the tree asked
// whether it still points at anything.
//
// THE HANDOVER ASKED WHETHER THIS IS DETECTABLE STRUCTURALLY OR WHETHER A LIST BEATS A SCAN. It is
// detectable, and the discriminator is the VALUE, not the name: a string literal shaped like a
// repo-relative source path IS a claim about the tree, whatever the constant is called. No list of
// blessed identifiers is needed, which is the whole point — a list is one more thing to remember,
// and forgetting it fails silently (inc.117).
//
// THE HALF THAT IS EASY TO GET WRONG, AND IT IS LIVE ON THIS TREE: not every path constant can be
// anchored. `lib/partnerHooks.ts` names `docs/partners/PARTNER-WEBHOOK-CONTRACT.md`, which is
// outside SCANNED_ROOTS and is not a source extension, so the walk never yields it and a path
// anchor on it would be permanently RED — a guard that cries about correct code. So the offence is
// narrow: a path constant the walk COULD hold and no registered anchor pins. A path constant
// outside the perimeter is coverage, not an offence (inc.111's shape, inc.114's uncovered vs
// excluded-by-design distinction), and it is reported as such or not at all.
//
// The declaration scan reuses inc.116's structural rule for inc.116's reason: prose in this family
// spells these constants inside backticks mid-sentence while explaining them, and a scan that
// accepted any file's text would read its own commentary as a guard's promise.
//
// Pure per CR-3 — handed file contents, returns a verdict. No filesystem, no clock, no network.

import type { RegisteredAnchor } from "./anchorRegistry";
import { ANCHORS } from "./anchorRegistry";
import { scannedByWalk, type SourceFile } from "./scanPerimeter";

/** A constant whose VALUE is a claim about the tree, and the `path#EXPORT` that makes the claim. */
export type PathConstant = {
  readonly site: string;
  readonly value: string;
};

/**
 * `export const NAME = "…"`, and only where the declaration BEGINS ITS LINE.
 *
 * inc.116's rule, against inc.116's live trap — the paragraphs above quote two of these constants
 * mid-sentence, and so will the next module that documents the convention.
 */
const STRING_CONSTANT = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"'\n]+)["']/gm;

/**
 * A repo-relative path: two or more segments and a file extension.
 *
 * Deliberately requires the slash. A single bare word with a dot in it (`"host-confirm"`,
 * `"v1.2"`) is not a claim about where a file lives, and treating it as one would flood this check
 * with every kind constant in the family — a guard that cries wolf is a guard somebody deletes.
 */
const REPO_PATH = /^[\w.@-]+(?:\/[\w.@-]+)+\.[A-Za-z0-9]+$/;

/** Every `path#EXPORT` on the walked tree whose value names a file. Sorted — a surprise reads as a list. */
export function pathConstants(files: readonly SourceFile[]): PathConstant[] {
  const out: PathConstant[] = [];
  for (const file of files) {
    for (const m of file.text.matchAll(STRING_CONSTANT)) {
      if (REPO_PATH.test(m[2])) out.push({ site: `${file.path}#${m[1]}`, value: m[2] });
    }
  }
  return out.sort((a, b) => a.site.localeCompare(b.site));
}

/**
 * Path constants the walk could hold and no registered anchor pins.
 *
 * The two filters are different questions and both matter. `scannedByWalk` asks whether an anchor
 * on this value could ever be satisfied — if not, demanding one is demanding a permanent red. The
 * registry lookup asks whether some door already made this exact promise; it matches on the anchor
 * VALUE rather than on the constant's name, because two doors naming the same file is one pin, not
 * a missing one.
 */
export function unanchoredPathConstants(
  files: readonly SourceFile[],
  registry: readonly RegisteredAnchor[] = ANCHORS,
): PathConstant[] {
  const pinned = new Set(
    registry.filter((r) => r.anchor.kind === "path").map((r) => r.anchor.name),
  );
  return pathConstants(files).filter((c) => scannedByWalk(c.value) && !pinned.has(c.value));
}

/**
 * The sentence an unanchored path constant prints.
 *
 * It leads with what is NOT wrong, inc.111's shape: the constant is correct today, and the reader's
 * instinct on a red guard is to change the thing named. The fix is to add a pin, never to edit a
 * path that is currently right.
 */
export function unanchoredPathConstantNotice(constants: readonly PathConstant[]): string | null {
  if (!constants.length) return null;
  const many = constants.length !== 1;
  const listed = constants.map((c) => `${c.site} → ${c.value}`).join(", ");
  return (
    `Nothing below is wrong, it is unwatched: ${listed} name${many ? "" : "s"} a file this walk ` +
    `visits, and no anchor pins ${many ? "them" : "it"}. The day ${many ? "those files move" : "that file moves"} ` +
    `the rule hanging off ${many ? "them" : "it"} stops matching anything and the guard goes quiet ` +
    `instead of red. Declare an Anchor for the constant and register it in ANCHORS ` +
    `(lib/flags/anchorRegistry.ts).`
  );
}
