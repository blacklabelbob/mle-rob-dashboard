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

/** The directories the walk descends. A repo-root file (no `/`) is scanned too — `proxy.ts` is production. */
export const SCANNED_ROOTS = ["app", "components", "lib", "scripts"] as const;

/** Every spelling of a source file this repo can execute: ts/tsx/js/jsx and the m·c variants. */
export const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Skipped on purpose, not missed. `__tests__` is excluded by BOTH doors and for the same kind of
 * reason: a test may state the reader's core rule without a scope, and a test writes fixture
 * payloads by design. `node_modules` and dot-dirs are not ours. Reporting any of them as a blind
 * spot would train the reader to skim the list, which is how a real `src/` would then get skimmed.
 */
const NOT_OURS = /(^|\/)(node_modules|__tests__|\.[^/]+)\//;

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
