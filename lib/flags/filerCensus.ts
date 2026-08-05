// Q84 inc.184 — the namespace measurement is only as complete as the table it measures.
//
// inc.183 built `LEDGER_FILERS` and proved the six filers listed there do not collide. Every
// sentence it can say is scoped to that list: `measureNamespace` walks the array it is handed and
// cannot see a filer nobody wrote down. The `.ts` keys inside the table are imported so a RENAME
// breaks the build, and the three `.mjs` keys are mirrored with the mirror asserted against the
// script source — both of those defend the table's CONTENTS. Neither defends its MEMBERSHIP.
//
// So the standing hole is a seventh filer. Someone adds a module that POSTs to `/api/admin/flags`
// with a `dedupeKey`, does not think to open `keyNamespace.ts`, and from that moment the namespace
// report is confidently wrong: it prints "no collisions" about six filers while a seventh writes
// into the same flat space. The report does not get quieter or hedge — it keeps its old certainty
// with a smaller denominator. That is the same shape as every defect this series has named (a
// mirror nothing verifies, a manifest that never looked at the disk): not a wrong value, a claim
// that outlived what it was measured against.
//
// This file closes it by MEASURING the tree instead of trusting the table. It finds every place in
// the source that puts a `dedupeKey` on a finding, and compares that set against the sources
// `LEDGER_FILERS` claims. Two directions, both defects, reported separately because the fix
// differs:
//
//   unregistered  — a file emits a key and is in no filer's `source`. The report is blind to it.
//   sourceless    — a filer names a `source` that emits nothing. The table describes a file that
//                   has moved on, so the keys it claims are no longer evidence of anything.
//
// It reports paths, never keys, and it invents nothing: a file it cannot classify is not silently
// dropped, it comes back as an emission site for a human to look at. Same contract as the rest of
// lib/flags — advisory, nothing wired into the POST route's read, and the worst a false positive
// costs is a failing assertion pointing at a real line of source.

/** One place in the source that names `dedupeKey` on an object being built. */
export type EmissionSite = {
  /** Repo-relative path, POSIX separators — the same spelling `Filer.source` uses. */
  path: string;
  /** 1-indexed, so a reader can jump straight to it. */
  line: number;
  /** The value side, verbatim and untrimmed of meaning — what makes this judgeable by a human. */
  value: string;
};

/**
 * True when the value side is a TYPE rather than a key being emitted.
 *
 * `dedupeKey: string` in a type literal, a function parameter, or a JSDoc `@returns` shape declares
 * that a key EXISTS somewhere; it does not put one on the ledger. Counting those would register
 * `supersede.ts` and `dedupeKeyIdentity.ts` — modules that read and compare keys and have never
 * filed one — and a census that names non-filers is as useless as one that misses filers.
 */
export function isTypeAnnotation(value: string): boolean {
  const bare = value.replace(/[;,}].*$/, "").trim();
  if (bare.length === 0) return false;
  return bare
    .split("|")
    .every((part) => /^(string|number|boolean|unknown|any|null|undefined)$/.test(part.trim()));
}

/**
 * True when the value is being READ off a ledger row rather than minted for a new finding.
 *
 * `dedupeKey: f.dedupe_key ?? f.dedupeKey` in flag-key-drift.mjs is the reader normalising the
 * column it just fetched. It names the field on the way IN. Calling that an emission would make
 * every future reader of the ledger look like a writer to it, and the distinction is the whole
 * point of the census — `flag-key-drift.mjs` is a filer because of its ONE real emission on line
 * 199, not because it can read.
 */
export function isRowRead(value: string): boolean {
  return /\bdedupe_key\b/.test(value);
}

/** Lines that are prose about a key, not code that carries one. */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * Every emission site in one file's text.
 *
 * Deliberately a line scan rather than a parse: the thing being defended is that a NEW filer
 * announces itself, and a new filer writes `dedupeKey:` on a line like everyone else. A parser
 * would be more precise about syntax this does not need and would fail closed — silently — on the
 * `.mjs` scripts, which are half the population.
 */
export function findEmissionSites(path: string, text: string): EmissionSite[] {
  const sites: EmissionSite[] = [];
  text.split("\n").forEach((line, index) => {
    if (isCommentLine(line)) return;
    const match = line.match(/\bdedupeKey\s*:\s*(.+)$/);
    if (!match) return;
    const value = match[1].trim();
    if (isTypeAnnotation(value) || isRowRead(value)) return;
    sites.push({ path, line: index + 1, value });
  });
  return sites;
}

/**
 * Where a filer can live.
 *
 * `lib/` and `scripts/` only, because those are where a finding is BUILT. `app/api/admin/flags`
 * receives keys, and scanning it would register the ledger as a filer of itself.
 */
export const EMISSION_SCAN_DIRS = ["lib", "scripts"] as const;

/** Directories the walk refuses to descend into. */
export function isScannableDir(name: string): boolean {
  return name !== "__tests__" && name !== "node_modules";
}

/**
 * Files the walk reads.
 *
 * Tests are excluded for the same reason a fixture is not a filer: they emit keys nothing reads,
 * and a census that counts them would report every guard as the thing it guards against.
 */
export function isScannableFile(name: string): boolean {
  return /\.(ts|tsx|mjs)$/.test(name) && !name.endsWith(".test.ts");
}

/** Just enough filesystem to walk the tree, injected so this module imports no `node:fs`. */
export type TreeReader = {
  /** Entries of one repo-relative directory. */
  list(dir: string): { name: string; isDirectory: boolean }[];
  /** Text of one repo-relative file. */
  read(path: string): string;
};

/**
 * Every emission site under the scanned directories.
 *
 * The traversal POLICY lives here, used by both the build assertion and the reporter, so the two
 * cannot come to different conclusions about the same tree — a census with two walks is two
 * censuses, which is the failure this whole file exists to prevent one directory up.
 */
export function scanTree(
  reader: TreeReader,
  dirs: readonly string[] = EMISSION_SCAN_DIRS,
): EmissionSite[] {
  const sites: EmissionSite[] = [];
  const walk = (dir: string) => {
    for (const entry of reader.list(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        if (isScannableDir(entry.name)) walk(path);
        continue;
      }
      if (isScannableFile(entry.name)) sites.push(...findEmissionSites(path, reader.read(path)));
    }
  };
  for (const dir of dirs) walk(dir);
  return sites;
}

/** A file emitting keys that no filer in the registry claims. */
export type UnregisteredFiler = { path: string; sites: EmissionSite[] };

/** A registry entry whose `source` no longer emits anything. */
export type SourcelessFiler = { name: string; source: string };

export type FilerCensus = {
  /** Every emission site found, so a report can show its own evidence. */
  sites: EmissionSite[];
  unregistered: UnregisteredFiler[];
  sourceless: SourcelessFiler[];
  /** True only when the tree and the table describe the same population. */
  complete: boolean;
};

type SourcedFiler = { name: string; source: string };

/**
 * Compare what the tree emits against what the registry claims.
 *
 * Sites are grouped by path so a file that emits four keys is one finding, not four — the fix is
 * one registry entry either way, and four lines of the same defect reads as four defects.
 */
export function censusFilers(sites: EmissionSite[], filers: SourcedFiler[]): FilerCensus {
  const claimed = new Set(filers.map((f) => f.source));
  const emitting = new Set(sites.map((s) => s.path));

  const byPath = new Map<string, EmissionSite[]>();
  for (const site of sites) {
    if (claimed.has(site.path)) continue;
    const bucket = byPath.get(site.path);
    if (bucket) bucket.push(site);
    else byPath.set(site.path, [site]);
  }

  const unregistered = [...byPath].map(([path, found]) => ({ path, sites: found }));
  const sourceless = filers
    .filter((f) => !emitting.has(f.source))
    .map((f) => ({ name: f.name, source: f.source }));

  return {
    sites,
    unregistered,
    sourceless,
    complete: unregistered.length === 0 && sourceless.length === 0,
  };
}

/**
 * One line per finding, for a reporter to print under the namespace report.
 *
 * Says nothing at all when the census is complete. A gate that congratulates itself every run is a
 * gate people learn to scroll past, and this one only matters on the day it is not empty.
 */
export function censusLines(census: FilerCensus): string[] {
  const lines: string[] = [];
  for (const entry of census.unregistered) {
    const where = entry.sites.map((s) => s.line).join(", ");
    lines.push(
      `UNREGISTERED FILER: ${entry.path} emits a dedupeKey (line ${where}) and is in no LEDGER_FILERS entry — the namespace report cannot see it.`,
    );
  }
  for (const entry of census.sourceless) {
    lines.push(
      `SOURCELESS ENTRY: LEDGER_FILERS claims "${entry.name}" files from ${entry.source}, which emits no dedupeKey — the keys listed for it are no longer evidence.`,
    );
  }
  return lines;
}
