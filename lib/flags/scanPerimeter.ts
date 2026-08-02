// Q84 inc.115 — THE PERIMETER IS NOT THE READER'S. IT IS THE REPO'S.
//
// inc.114 discovered that six tracked production files — `proxy.ts` (the app-level Basic-Auth
// gate), four repo-root configs, and `scripts/net-sentinel.cjs` — sat outside the READ door's walk
// entirely, so a caller in any of them could break every rule and the guard stayed green. It moved
// that door's boundary out of a test literal and into code, and closed the hole.
//
// IT CLOSED THE HOLE FOR ONE DOOR. `lib/flags/payloadWriters.ts` — the WRITE door, inc.106's —
// carried its own hand-copied walk in its own test, with the SAME four roots, the SAME four-
// extension filter and the same no-repo-root omission that inc.114 had just proven wrong. So
// `proxy.ts` could write `flags.payload` unscoped and `unscopedPayloadWriters` would never see it.
// The two literals were identical the day they were typed; one of them was fixed and the other was
// not, which is the whole reason a copy is a defect and not a style choice (inc.4, inc.5 — a hand-
// copied ladder deleted twice already on this queue).
//
// SO THE ANSWER TO inc.114's HANDOVER IS: THE TWO DOORS DO NOT SCAN DIFFERENT TREES, AND NEITHER
// OWNS THE PERIMETER. Both guards ask the same shape of question — *which production files may do
// X* — over the same repo, and a file outside the walk is invisible to BOTH for the same reason.
// Nothing about `proxy.ts` makes it a plausible reader and an implausible payload writer. Putting
// the contract in `readerGate.ts` and importing it from the payload guard would have made the write
// door depend on the read door, which is a false dependency: the perimeter belongs to neither, so
// it lives here and both import it.
//
// THIS MODULE IS PURE PER CR-3 — no `fs`, no clock, no network. The filesystem belongs to the
// caller: each guard's test does its own `readdir` and asks `scannedByWalk` which of what it found
// is covered. That split is inc.114's and it is deliberate — a guard that walks the disk cannot be
// unit-tested on strings, and a contract that is only ever a literal in a test cannot be shared.

/**
 * A source file as read off disk. `path` is repo-relative, with `/` separators.
 *
 * Q84 inc.116 — this shape was declared THREE times (both doors and, nearly, the anchor pin) and
 * it is the perimeter's own vocabulary: it is what the walk hands a guard. Declared once here and
 * re-exported by both doors, so their existing importers are untouched.
 */
export type SourceFile = {
  path: string;
  text: string;
};

/** The directories the walk descends. A repo-root file (no `/`) is scanned too — `proxy.ts` is production. */
export const SCANNED_ROOTS = ["app", "components", "lib", "scripts"] as const;

/** Every spelling of a source file this repo can execute: ts/tsx/js/jsx and the m·c variants. */
export const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Skipped on purpose, not missed. `__tests__` is excluded by BOTH doors and for the same kind of
 * reason: a test may state the reader's core rule without a scope, and a test writes fixture
 * payloads by design. `node_modules` is not ours. Reporting either as a blind spot would train the
 * reader to skim the list, which is how a real `src/` would then get skimmed.
 *
 * Q84 inc.119 — this list used to exist TWICE more: each door's test walk re-checked the same three
 * directory names by hand before descending. That is inc.115's defect in the one place it still
 * survived, and its direction is the dangerous one — delete a name here and the module's perimeter
 * widens while both walks keep skipping the directory, so the guard claims coverage nothing hands
 * it. `descendableDir` is now the single answer and both walks ask it.
 */
export const EXCLUDED_DIRS = ["node_modules", "__tests__"] as const;

/** Whether a walk should descend into a directory. Dot-dirs are excluded by shape, not by name. */
export function descendableDir(name: string): boolean {
  return !name.startsWith(".") && !(EXCLUDED_DIRS as readonly string[]).includes(name);
}

const NOT_OURS = new RegExp(`(^|/)(${EXCLUDED_DIRS.join("|")}|\\.[^/]+)/`);

/** Whether a repo-relative path is one the walk would hand to a guard's rules. */
export function scannedByWalk(filePath: string): boolean {
  if (!SOURCE_FILE.test(filePath) || NOT_OURS.test(filePath)) return false;
  const slash = filePath.indexOf("/");
  if (slash === -1) return true;
  return (SCANNED_ROOTS as readonly string[]).includes(filePath.slice(0, slash));
}

/**
 * Source files the caller found that the walk would never have visited — a guard's blind spot,
 * stated as a list rather than as a comment claiming there isn't one.
 *
 * Coverage, not an offence: every path here may be perfectly correct code. What is wrong is only
 * that no rule in the calling guard has ever looked at it.
 */
export function unscannedSources(paths: readonly string[]): string[] {
  return paths.filter((p) => SOURCE_FILE.test(p) && !NOT_OURS.test(p) && !scannedByWalk(p)).sort();
}

/**
 * The sentence a blind spot prints. Same first-clause promise as `abstentionNotice`.
 *
 * `guard` is REQUIRED and names the door that is blind. It used to read "this module" back when
 * only one guard had a perimeter; now that both share it, a notice that does not say which guard
 * went quiet is a notice the reader cannot act on.
 */
export function unscannedNotice(paths: readonly string[], guard: string): string | null {
  if (!paths.length) return null;
  const many = paths.length !== 1;
  return (
    `Nothing below is wrong: ${paths.length} source file${many ? "s" : ""} ` +
    `${many ? "are" : "is"} outside every rule in ${guard} because the walk never visited ` +
    `${many ? "them" : "it"} — ${[...paths].join(", ")}. A caller there could break any rule that ` +
    `guard enforces and it would stay green. Add the root to SCANNED_ROOTS, or the extension to ` +
    `SOURCE_FILE, so the file enters.`
  );
}

// Q84 inc.119 — A DIRECTORY CLAIM IS NOT A PATH CLAIM, AND inc.118's OWN DISCRIMINATOR PROVES IT.
//
// inc.118 answered "can a rule hang off a name that never becomes an Anchor" with: yes, and the
// VALUE gives it away — a string shaped like a repo-relative path IS a claim about the tree, so no
// roster of blessed identifiers is needed. `SCANNED_ROOTS` is a claim about the tree of exactly the
// same load-bearing kind, and that scan is structurally blind to it in two independent ways: it is
// an array rather than a string literal, and `REPO_PATH` requires a slash and an extension ON
// PURPOSE. Loosening it would not help. The value of a directory claim is `"app"` — indistinguishable
// from every kind constant in this family (`"note"`, `"email"`, `"host-confirm"`), so keying on the
// value cannot separate a perimeter from a vocabulary. A scan finds claims and asks whether each is
// pinned; for directories that direction is unavailable, so this one INVERTS it: take the declared
// perimeter and ask whether the tree still satisfies it. That is the honest limit inc.117 named
// where a list beats a scan — and it costs nothing new to remember, because the list already exists
// and is the perimeter itself.
//
// HALF THE HANDOVER WAS WRONG AND READING IT FIRST IS WHY (inc.109/inc.110/inc.116, again): it
// claimed `unscannedSources` "cannot report a root that was never asked for". Both walks recurse
// from `process.cwd()`, not from `SCANNED_ROOTS`, so a new `src/` — or a root RENAMED, which is the
// same event seen from the other side — surfaces its files as unscanned and turns the suite red.
// That direction was already closed by inc.114. What no rule asks is the opposite: whether a root
// this perimeter still NAMES holds anything at all.
//
// WHY A PHANTOM ROOT IS AN OFFENCE AND NOT COVERAGE, WHICH IS THE DISTINCTION inc.111 AND inc.114
// TURN ON. A root that yields nothing is not correct-but-unwatched code; there is no code. It is a
// promise that has quietly stopped being about anything, and the failure it hides arrives via the
// notice above: a reader who renames `scripts/` to `bin/` is told to "Add the root to
// SCANNED_ROOTS", does exactly that, and leaves `scripts` behind as a dead entry. The perimeter then
// documents coverage of a directory that does not exist, and the next reader believes it.

/**
 * Roots this perimeter claims that the caller's walk found nothing under.
 *
 * `paths` must be every source path the walk yielded, repo-relative — the same listing
 * `unscannedSources` takes. An empty listing makes every root look dead, so a caller that pins this
 * must also pin that it actually walked something (inc.106's lesson, and inc.114's).
 */
export function unpopulatedRoots(paths: readonly string[]): string[] {
  return SCANNED_ROOTS.filter(
    (root) => !paths.some((p) => p.startsWith(`${root}/`) && scannedByWalk(p)),
  ).sort();
}

/**
 * The sentence a phantom root prints.
 *
 * It does NOT lead with `Nothing below is wrong` — that promise belongs to coverage notices, and
 * borrowing it here would teach the reader that the two mean the same thing. This one names a stale
 * claim, and the fix is to delete the entry rather than to create a directory to satisfy it.
 */
export function unpopulatedRootNotice(roots: readonly string[], guard: string): string | null {
  if (!roots.length) return null;
  const many = roots.length !== 1;
  return (
    `SCANNED_ROOTS names ${roots.length} director${many ? "ies" : "y"} holding no source file this ` +
    `walk can see — ${[...roots].join(", ")}. ${guard} reports a clean tree for ` +
    `${many ? "them" : "it"} because there is nothing there, not because it checked. A root is ` +
    `usually left behind after a rename: the file it lost showed up as unscanned, someone added the ` +
    `new root as the notice told them to, and the old one stayed. Remove the dead entry — do not ` +
    `create a directory to make this green.`
  );
}

// Q84 inc.120 — A PERIMETER CAN ONLY EVER PROMISE REACHABILITY. JUDGEMENT IS THE GUARD'S OWN.
//
// inc.119 handed over: is "this root produced at least one JUDGEMENT" checkable per-guard without
// making the guards depend on each other? **PER-ROOT IT IS NOT, AND THIS TREE SETTLES IT ON
// EVIDENCE RATHER THAN ON ARGUMENT.** Across the 422 files the walk hands out today, the WRITE
// door's rule recognises subjects under `app/` only; the READ door's recognises them under
// `components/` and `lib/` only. Neither recognises anything under `scripts/`, and neither is
// wrong — a root full of files no rule is ABOUT is the normal case, not a defect. A per-root
// judgement check would be permanently red on correct code, which is the guard-crying-wolf shape
// inc.118 and inc.111 both refused. So the perimeter stops at reachability: it promises the files
// were HANDED OVER, never that anything looked back.
//
// WHAT IS CHECKABLE IS THE SAME QUESTION AT THE RIGHT ALTITUDE — PER GUARD, WHOLE TREE. A guard
// whose recogniser matches NOTHING ANYWHERE is green for a reason indistinguishable from innocence,
// and that is not hypothetical here: the write door's entire subject set on this tree is ONE file,
// `app/api/admin/flags/route.ts`, the very writer it exists to privilege. Rewrite that route to
// reach the table through a helper and `unscopedPayloadWriters` returns `[]` forever — the same
// empty array it returns when the repo is clean. Every anchor stays green while it happens, because
// an anchor proves the NAME still exists (inc.117, inc.118) and this is the other failure: the name
// exists and no longer does the job.
//
// AND IT NEEDS NO CROSS-GUARD DEPENDENCY, WHICH WAS THE OTHER HALF OF THE HANDOVER. Each door
// already owns the only thing required — its own recogniser. What is shared is the SHAPE of the
// question and the sentence it prints, which is what belongs at the perimeter (inc.115's doctrine:
// the boundary belongs to neither door, so it lives here and both import it). Nothing here knows
// what a payload or a reader call is.

/**
 * The sentence a guard prints when it recognised nothing on a tree it demonstrably reached.
 *
 * `subjects` is what the guard's OWN rule matched — every file it is about, offenders and innocents
 * alike. A caller must pin this alongside a pin that the walk actually yielded files, or the two
 * silences (nothing walked / nothing recognised) collapse into each other.
 *
 * This does NOT borrow `Nothing below is wrong` — like `unpopulatedRootNotice`, it names a claim
 * that has stopped meaning anything, not code that is merely unwatched.
 */
export function vacuousGuardNotice(
  subjects: readonly string[],
  guard: string,
  subject: string,
): string | null {
  if (subjects.length) return null;
  return (
    `${guard} reached this whole tree and recognised no ${subject} anywhere, so it passes by ` +
    `having nothing to judge. Its green is the same green it shows on a clean repo, which is why ` +
    `nothing else can catch this. The rule did not stop being true — it stopped being ABOUT ` +
    `anything, usually because the code it matches on was rewritten in a shape the recogniser no ` +
    `longer sees. Fix the recogniser, or delete the guard; do not widen the perimeter, which is ` +
    `already as wide as the repo.`
  );
}
