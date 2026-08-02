// Q84 inc.117 — A PIN NOBODY REMEMBERS TO WRITE IS THE SAME HOLE ONE LEVEL UP.
//
// inc.116 answered *does the name my rule hangs off still exist* once, in `anchorPin.ts`, instead
// of twice in two bespoke test assertions. What it did not answer is WHO CALLS IT. The pin was
// per-guard opt-in: each door had to remember to add its own real-tree test, and nothing on the
// tree enumerated the anchors. `lib/flags/` holds fifteen modules and exactly two declare an
// anchor; a sixteenth added tomorrow gets no pin, and — the part that matters — NOTHING GOES RED
// TO SAY SO. That is the identical *who-remembers* defect this family has now deleted four times
// (inc.4, inc.5, inc.115, inc.116), moved up a level: not a rule that is missing, a rule that is
// never asked for.
//
// THE ANSWER IS A REGISTRY THAT IS CHECKED AGAINST THE TREE, NOT A REGISTRY ALONE. A hand-kept
// list of anchors is itself something to remember, so it would buy nothing: forget to add the new
// door and the list is quietly short, exactly as the per-door pins were quietly absent. So the
// registry carries the anchor VALUES (a test cannot construct them — only the door knows whether
// its anchor is a path or a declaration), and `declaredAnchorSites` reads the tree for every
// `Anchor` a module declares. The suite asserts the two agree. A new guard that declares an
// anchor and does not register it turns the suite RED naming the file, which is the sentence a
// door that went blind could never print for itself.
//
// WHAT SHOULD FAIL WHEN A DOOR HAS NO ANCHOR — the half of the handover that is easy to get
// wrong: NOTHING. Ten of these modules are pure helpers with no name to hang a rule off, and
// demanding an anchor from `hostConfirmProse` would train the next reader to add a ceremonial one
// to shut the suite up. Absence of an anchor is not an offence (inc.111's shape, inc.114's
// distinction between uncovered and excluded-by-design). The offence is DECLARING one and leaving
// it unpinned — that is a guard advertising a rule nothing verifies.
//
// The declaration scan reuses inc.116's structural rule for inc.116's reason: this module's own
// prose spells `export const READER_ANCHOR: Anchor =` while explaining what it looks for, and a
// scan that accepts any file's text would count that as a sixteenth guard.
//
// Pure per CR-3 — handed file contents, returns a verdict. No filesystem, no clock, no network.

import type { Anchor } from "./anchorPin";
import type { SourceFile } from "./scanPerimeter";
import { READER_ANCHOR, READER_GATE_GUARD, RULE_FILE_ANCHOR } from "./readerGate";
import { PAYLOAD_WRITE_GUARD, SCOPED_PAYLOAD_WRITER_ANCHOR } from "./payloadWriters";

/**
 * One guard's anchor, and the human name of the door it holds open.
 *
 * `site` is `path#EXPORT`, the same spelling `declaredAnchorSites` returns, because the whole
 * value of the registry is that the two sets can be compared without a translation step in
 * between — a translation step is where a drift check goes to die.
 */
export type RegisteredAnchor = {
  readonly site: string;
  readonly guard: string;
  readonly anchor: Anchor;
};

/**
 * Every anchor on this tree, pinned centrally by one test instead of by whichever door remembered.
 *
 * Adding a door here is the ONE thing a new guard must remember, and forgetting it is the one
 * thing the tree can catch by itself — which is the trade this module exists to make.
 */
export const ANCHORS: readonly RegisteredAnchor[] = [
  {
    site: "lib/flags/readerGate.ts#READER_ANCHOR",
    guard: READER_GATE_GUARD,
    anchor: READER_ANCHOR,
  },
  {
    // Q84 inc.118 — the read door's SECOND anchor. `READER_ANCHOR` proves there is something to
    // call; this proves the file the rule excludes from its own scan is still where the rule says.
    site: "lib/flags/readerGate.ts#RULE_FILE_ANCHOR",
    guard: READER_GATE_GUARD,
    anchor: RULE_FILE_ANCHOR,
  },
  {
    site: "lib/flags/payloadWriters.ts#SCOPED_PAYLOAD_WRITER_ANCHOR",
    guard: PAYLOAD_WRITE_GUARD,
    anchor: SCOPED_PAYLOAD_WRITER_ANCHOR,
  },
];

/**
 * `export const NAME: Anchor = …`, and only where the declaration BEGINS ITS LINE.
 *
 * inc.116's rule, for inc.116's reason and against inc.116's live trap: the paragraph at the top
 * of this file spells that shape inside backticks mid-sentence, and so will the next module that
 * documents the convention. A textual scan without the line anchor would count its own commentary
 * as a guard and then report the registry complete.
 *
 * Local (`const X: Anchor`) rather than exported declarations are deliberately NOT sought: a
 * module-private anchor is not a promise anyone outside can hold, so nothing can be drifting from
 * it. The limit is the same shape as inc.116's — a missed declaration turns this RED on something
 * real, it never colours an unregistered door green.
 */
const ANCHOR_DECLARATION = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*Anchor\b/gm;

/**
 * Every `path#EXPORT` on the walked tree that declares an anchor. Sorted, so a surprise reads as a
 * list rather than a diff.
 */
export function declaredAnchorSites(files: readonly SourceFile[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    for (const m of file.text.matchAll(ANCHOR_DECLARATION)) {
      out.push(`${file.path}#${m[1]}`);
    }
  }
  return out.sort();
}

/**
 * Anchors the tree declares that the registry does not carry — a door advertising a rule that no
 * test asks about. The reverse direction (registered but no longer declared) is deliberately left
 * to `missingAnchorNotice`, which already says it better and says it per guard.
 */
export function unregisteredAnchors(
  files: readonly SourceFile[],
  registry: readonly RegisteredAnchor[] = ANCHORS,
): string[] {
  const known = new Set(registry.map((r) => r.site));
  return declaredAnchorSites(files).filter((site) => !known.has(site));
}

/**
 * The sentence an unregistered anchor prints.
 *
 * It leads with what is NOT wrong, inc.111's shape: the door is fine, the pin is missing. A reader
 * who mistakes this for "your anchor is broken" will go and change a correct anchor.
 */
export function unregisteredAnchorNotice(sites: readonly string[]): string | null {
  if (!sites.length) return null;
  return (
    `Nothing below is wrong, it is unwatched: ${sites.join(", ")} ${sites.length === 1 ? "declares" : "declare"} ` +
    `an anchor that no registry entry pins, so the day that name is renamed the guard goes silent ` +
    `instead of red. Add it to ANCHORS in lib/flags/anchorRegistry.ts with the door's own name.`
  );
}
