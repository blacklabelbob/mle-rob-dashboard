// Q84 inc.122 — THE DISCRIMINATOR THAT DECIDES *WHO OWES A VACUITY PIN* WAS ITSELF UNWRITTEN.
//
// inc.120 gave the write door a vacuity pin. inc.121 asked whether that pin is owed to EVERY
// recogniser and answered NO — only to those whose HEALTHY state is an empty result, because only
// there is "found nothing" indistinguishable from "clean tree". It then applied that rule BY HAND
// to every guard on the tree, found `fleetResolveDoc` (a module nobody was looking at) owed one,
// and wrote the rule down in a commit message and a PRD row.
//
// A commit message is not a place a scan can read. That is the *who-remembers* defect inc.117
// moved up a level and deleted for anchors: a rule that lives only in someone's memory is a rule
// the next guard added tomorrow will not be told about. inc.121's own evidence is the argument —
// two increments studied the write door while `fleetResolveDoc` sat one directory away with the
// identical one-file exposure, because nothing on the tree ASKED.
//
// SO THE HANDOVER'S QUESTION: is "returns a list whose healthy value is empty" decidable from the
// code? YES — but not from the return type alone, and that distinction is the whole increment.
//
// `string[]` is not the discriminator. `linkifyRecordIds` returns a list and owes nothing: it is a
// pure transform whose caller consumes the value, so blinding it stops the expected output from
// arriving and it goes red on its own — the exact class inc.121 refused for `hostConfirmProse`,
// `reviewerClause`, `payloadScope` and `dedupeKeyIdentity`. What actually separates the two is the
// INPUT: a function that consumes what the WALK hands out (`SourceFile[]` / `FleetDoc[]`) is asking
// *which files on this tree are my subjects*, and nobody consumes its answer except an assertion.
// Empty is its healthy state. That is a signature, and a signature is machine-readable.
//
// THIS MODULE IS PURE PER CR-3 — no `fs`, no clock, no network. The filesystem belongs to the
// caller, exactly as `scanPerimeter` splits it (inc.114/inc.115): the test walks the disk and asks
// these functions which of what it found owes a pin.

import { SOURCE_FILE, type SourceFile } from "./scanPerimeter";

/**
 * The walk's own output types. A parameter of one of these shapes is what makes a function a
 * TREE-SCANNING RECOGNISER rather than a transform: its argument is "every file in the repo", so
 * its result is a claim about the tree and nothing but a test ever reads it.
 */
const WALK_INPUT = /\b(SourceFile|FleetDoc)\[\]/;

/** A signature whose declared return is a list — `string[]`, `PathConstant[]`, `ReaderAbstention[]`. */
const LIST_RETURN = /^\s*(readonly\s+)?[A-Za-z_][A-Za-z0-9_.<>, |]*\[\]\s*$/;

/** `export function NAME(params): Return {` — params and return may span lines, as several do. */
const EXPORTED_FN = /export function ([A-Za-z0-9_]+)\(([^)]*)\)\s*:\s*([^{;]+)\{/g;

/** A recogniser that owes a vacuity pin, and the file that declares it. */
export type Recogniser = {
  /** Repo-relative path of the declaring module. */
  path: string;
  /** The exported function name. */
  name: string;
};

/**
 * Every exported function on the given files that consumes the walk's output and answers with a
 * list — the functions whose green is an EMPTY RESULT, and therefore the ones that owe a vacuity
 * pin per inc.121's discriminator.
 *
 * Test files are not subjects: a fixture helper in a `__tests__` directory is not a guard, and the
 * walk excludes them anyway (`EXCLUDED_DIRS`). Non-source files are ignored by extension so a
 * caller handing us markdown does not produce phantom recognisers.
 */
export function treeScanRecognisers(files: readonly SourceFile[]): Recogniser[] {
  const found: Recogniser[] = [];
  for (const file of files) {
    if (!SOURCE_FILE.test(file.path)) continue;
    for (const match of file.text.matchAll(EXPORTED_FN)) {
      const [, name, params, returns] = match;
      if (!WALK_INPUT.test(params)) continue;
      if (!LIST_RETURN.test(returns)) continue;
      found.push({ path: file.path, name });
    }
  }
  return found.sort((a, b) => `${a.path}:${a.name}`.localeCompare(`${b.path}:${b.name}`));
}

/**
 * Whether a body of test text discharges the duty for a named recogniser.
 *
 * TWO WAYS, AND BOTH ARE REAL EVIDENCE RATHER THAN A MENTION. Either the test prints the vacuity
 * notice for it (`vacuousGuardNotice` — inc.120's sentence), or it reads the REAL TREE off disk
 * while naming the function, which is strictly stronger: a named live subject proves the recogniser
 * still matches something, where a vacuity pin only proves someone would be told if it stopped.
 *
 * A STRING FIXTURE ALONE IS NOT EVIDENCE, and that is the point of requiring the disk read. inc.120
 * measured this exact gap: rewriting the live route left every fixture green and only the real-tree
 * pin went red. A test that names the function over hand-written `{path, text}` literals proves the
 * regex works on strings someone typed, never that it works on the repo.
 *
 * THE DISCHARGING TEST NEED NOT BE THE MODULE'S OWN, and this tree proves why that would be wrong:
 * `anchorPin.anchorSites` has no disk-reading test of its own — three other guards' real-tree walks
 * exercise it. Requiring a per-module pin would demand a second, weaker copy of a question already
 * better answered elsewhere, which is the shape inc.115 and inc.117 deleted.
 */
const READS_DISK = /readdirSync|readFileSync|readdir\(|readFile\(/;

export function dischargedBy(name: string, testText: string): boolean {
  if (!testText.includes(name)) return false;
  return testText.includes("vacuousGuardNotice") || READS_DISK.test(testText);
}

// AND IT MAY PIN THE RECOGNISER THROUGH ITS OWN WRAPPER, WHICH THE FIRST RUN OF THIS SCAN PROVED.
//
// `anchorSites` came back undischarged, and the by-hand pass would have called that a hole. It is
// not: `missingAnchorNotice` — exported from the same module — returns null exactly when
// `anchorSites` found something, and three real-tree tests assert that null. A pin on the wrapper
// IS a pin on the recogniser; only the NAME is absent from the test.
//
// So the check follows exactly one level of indirection, and only WITHIN the declaring module.
// One level, because that is what a name-matching rule can prove without pretending to be a call
// graph; within the module, because a caller in another file is a consumer of the value (the
// self-catching class inc.121 refused) rather than a wrapper around the judgement.

/** Exported names in `moduleText` whose own body calls `name` — a pin on one is a pin on it. */
export function inModuleProxies(name: string, moduleText: string): string[] {
  const called = new RegExp(`\\b${name}\\(`);
  return moduleText
    .split(/^(?=export\s)/m)
    .flatMap((block) => {
      const declared = block.match(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
      if (!declared || declared[1] === name) return [];
      return called.test(block.slice(declared[0].length)) ? [declared[1]] : [];
    })
    .sort();
}

/**
 * Recognisers no test on the tree pins — the guards that would go silently vacuous.
 *
 * `tests` is every test file's text the caller found. All of them, not the matching one: see
 * `dischargedBy`. `modules` is where the wrapper lookup above reads from.
 */
export function undischargedRecognisers(
  recognisers: readonly Recogniser[],
  tests: readonly SourceFile[],
  modules: readonly SourceFile[] = [],
): Recogniser[] {
  return recognisers.filter((r) => {
    const declaring = modules.find((m) => m.path === r.path);
    const names = [r.name, ...(declaring ? inModuleProxies(r.name, declaring.text) : [])];
    return !names.some((n) => tests.some((t) => dischargedBy(n, t.text)));
  });
}

/**
 * The sentence an undischarged recogniser prints.
 *
 * Like `unpopulatedRootNotice` and `vacuousGuardNotice` it refuses the `Nothing below is wrong`
 * opening: this is not unwatched-but-correct code, it is a guard that can stop being about anything
 * without anyone finding out. It names the fix in the two forms inc.121 accepted, and says which is
 * stronger, so the reader does not reach for the cheaper one by default.
 */
export function undischargedVacuityNotice(recognisers: readonly Recogniser[]): string | null {
  if (!recognisers.length) return null;
  const many = recognisers.length !== 1;
  const listed = recognisers.map((r) => `${r.name} (${r.path})`).join(", ");
  return (
    `${recognisers.length} tree-scanning recogniser${many ? "s" : ""} on this repo ` +
    `answer${many ? "" : "s"} with a list whose healthy value is empty, and no test pins that ` +
    `${many ? "they still recognise" : "it still recognises"} anything — ${listed}. Rewrite the ` +
    `code ${many ? "they match" : "it matches"} into a shape the regex no longer sees and the ` +
    `guard returns the same empty array it returns on a clean repo, staying green forever. Pin a ` +
    `NAMED subject read off the real tree — strictly the stronger fix — or, where no subject is ` +
    `stable enough to name, print vacuousGuardNotice. A string fixture does not discharge this: it ` +
    `proves the regex works on text someone typed, not on the repo.`
  );
}
