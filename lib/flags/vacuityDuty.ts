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

// Q84 inc.123 — THE SCAN WAS HAND-CHOSEN TWICE, AND ONLY ONE OF THE TWO WAS THE DIRECTORY.
//
// inc.122's handover named the obvious half: the walk read `lib/flags/` and nothing else, a literal
// picked by hand — the defect inc.114 and inc.115 each deleted once already. That half is real, and
// the walk below is now the perimeter's own.
//
// WIDENING THE WALK ALONE WOULD HAVE CHANGED NOTHING, AND THAT IS THE FINDING. Handed all 417
// source files the perimeter reaches, the rule as written still returned the same 14 recognisers,
// every one of them inside `lib/flags/`. Not because the directory was well chosen — because the
// RULE was keyed on two type NAMES, `SourceFile` and `FleetDoc`, and both are declared in
// `lib/flags/`. A guard built anywhere else declares its own list type and is invisible to a
// name-matching rule no matter how wide the walk gets. The perimeter and the vocabulary are two
// independent hand-chosen literals, and fixing one leaves the other holding the hole.
//
// SO THE VOCABULARY IS DERIVED FROM THE TREE, WHICH IS inc.117/inc.118's MOVE IN A THIRD PLACE: a
// roster nobody has to remember cannot be forgotten. And the derivation immediately found what the
// name list could not — `mailScopeBreaches` (`lib/comms/mailReadScope.ts`), `seamViolations` and
// `rulingBreaches` (`lib/coreSeam.ts`), three tree-scanning guards over `MailFile[]`/`SeamFile[]`
// that owe this duty and had never once been asked. All three DISCHARGE it (inc.121 checked those
// two modules by hand and found named real-tree pins), so this closes no live hole — reported as it
// is rather than dressed up as a save. What it closes is the next one, which nobody would have
// checked by hand either.

// Q84 inc.124 — THE VOCABULARY WAS DERIVED FROM THE TREE AND STILL SPOKE ONLY ONE DIALECT.
//
// inc.123's handover asked whether `export type NAME = { … }` being the only declaration form the
// derivation reads is a real gap or the same over-reach `Recogniser` proved. MEASURED BEFORE ANY
// CODE: it is real, and the tree names the subject. `AssetSource` (`lib/agents/inventory.ts`) is a
// file-as-the-walk-hands-it-over — repo-relative `path`, the file's own bytes — declared as an
// `export interface`, and this scan had never seen it. It is not an exotic form on this repo: across
// the 417 files the perimeter walks, 235 exported interfaces against 265 exported object type
// aliases — 47.0% of every exported object declaration on the tree wore the form this rule could not
// read. Counted with this module's own regexes over `SCANNED_ROOTS`, minus the exclusions the
// perimeter already applies, so the figure is reproducible rather than asserted. WHICH KEYWORD AN
// AUTHOR REACHED FOR DECIDED WHETHER THEIR GUARD WAS EVER ASKED THE QUESTION, and that is the same
// hand-chosen literal inc.117, inc.118 and inc.123 each deleted once — this time hiding in the
// grammar rather than in a list.
//
// THE HONEST SIZE OF IT: admitting the form adds `AssetSource` to the vocabulary and ZERO
// recognisers. Nothing on this tree takes `AssetSource[]` and answers with a list — `buildInventory`
// returns an `Inventory` (a single value, not an empty-when-healthy result) and `auditAsset` takes
// one source, not the walk's output. So this closes no live hole, reported as such rather than
// dressed up as a save. It is the next `lib/coreSeam.ts`: a guard written tomorrow in the form 235
// declarations on this tree already use would have been invisible.
//
// THE OTHER HALF OF THE HANDOVER — a walk type declared in one module and re-exported from another
// — IS STILL NOT BUILT, BUT THE FIRST DRAFT OF THIS COMMENT GAVE THE WRONG REASON AND THE WRONG
// FACTS, so both are corrected here rather than quietly rewritten. It claimed the tree has no type
// re-export and that `readerGate.ts` re-exports "`SOURCE_FILE` and friends, all values". Neither is
// true: `readerGate.ts:76` and `payloadWriters.ts:47` BOTH carry `export type { SourceFile }` — the
// walk-output type itself, re-exported precisely because inc.116 moved its declaration and wanted
// existing importers unchanged. The subject exists.
//
// IT IS STILL RIGHT TO LEAVE UNBUILT, FOR THE STRONGER REASON THE FACTS ACTUALLY GIVE: a re-export
// introduces no NAME the derivation lacks. `SourceFile` is declared in `lib/flags/scanPerimeter.ts`,
// inside the walk, and this scan reads DECLARATIONS — so it already holds `SourceFile` from the
// declaration site, and both re-exports are second sightings of a name already found. Chain-following
// would be mechanism that cannot change a single answer on this tree, which is a heavier charge than
// "no subject" and the one that actually justifies the omission. Left undone deliberately — and the
// day a walk type is declared OUTSIDE `SCANNED_ROOTS` and re-exported in, that reasoning expires.

// Q84 inc.125 — THE VOCABULARY WAS DERIVED FROM THE TREE AND STILL ASKED A HAND-WRITTEN QUESTION.
//
// inc.123 derived WHICH TYPES are walk output instead of naming them. inc.124 widened the
// declaration FORM it could read. Both left the same literal standing one level down: a type
// counted as walk output only if its bytes field was spelled `text`, `content` or `source` — three
// names typed into this file. A guard whose walk type spells its bytes `body` or `raw` means
// exactly the same thing and is invisible. That is the identical hand-chosen literal inc.117,
// inc.118, inc.123 and inc.124 each deleted once, surviving in a fourth place.
//
// THE HANDOVER ASKED WHETHER THAT SET IS DERIVABLE FROM HOW THE WALK'S OWN PRODUCERS POPULATE IT,
// OR WHETHER WIDENING IT IS THE OVER-REACH `Recogniser` PROVED. IT IS DERIVABLE, AND THE DERIVATION
// IS STRICTLY NARROWER THAN A WIDER NAME LIST — WHICH IS WHY IT IS NOT THAT OVER-REACH. A field is
// the file's own bytes when something on this tree READS A FILE INTO IT. Not when it is called
// `source`: `SeamFile.source` is a file's bytes and a referral `source` is a label, and no list of
// names can tell those apart. A disk read can, and it is in the code already.
//
// MEASURED ON THIS TREE, IN BOTH DIRECTIONS, BEFORE THE RULE WAS WRITTEN — and the measurement is
// quoted here as it came back, because an earlier draft of this very comment stated it from
// intention rather than from a run and got it wrong twice, which is the defect inc.124 was about.
// The derivation returns FIVE names, not the three that used to be typed here: `body`, `content`,
// `raw`, `source`, `text` — read off 16 disk-read sites across 9 producer files
// (`lib/flags/__tests__/{anchorRegistry,pathConstants,payloadWriters,readerGate,vacuityDuty,
// fleetResolveDoc}.test.ts`, `lib/__tests__/{coreSeam,mailReadScope}.test.ts`,
// `scripts/gen-agent-inventory.mjs`). `body` and `raw` are real only because THIS increment's own
// test fixtures read a file into them — the derivation reads text, and a fixture string in a test
// file is text. That is disclosed rather than excluded: excluding this one file by name would be
// the same hand-chosen literal the whole thread keeps deleting, and the widening is bounded,
// because a field name only adds a CANDIDATE that still needs a real type declaring `path` plus
// that field before anything becomes walk output.
//
// SO IT CHANGES ZERO ANSWERS TODAY — verified in both directions, not assumed: the old hard-coded
// three and the derived five both return exactly `AssetSource`, `FleetDoc`, `MailFile`, `SeamFile`,
// `SourceFile`. It closes no live hole, reported as it is rather than dressed up as a save, exactly
// as inc.124 was. What it closes is the next one: the day a guard reads a file into `body`, its
// type joins the vocabulary without anyone remembering to come back here.
//
// THE `path` REQUIREMENT ON THE ENCLOSING LITERAL IS WHAT KEEPS IT FROM BECOMING NOISE, and it is
// pinned in the negative. `{ config: readFileSync(...) }` is a file read into a variable, not the
// walk handing a guard a file; without that requirement `config` would enter the vocabulary and
// every type carrying a `config: string` would read as walk output. Same shape as `Recogniser`
// (inc.123): the discriminator is the PAIR, never either half.
//
// THE PRODUCERS LIVE MOSTLY IN TESTS, WHICH BOTH DOORS EXCLUDE — so the caller must hand them in
// separately, and `treeScanRecognisers` defaults `producers` to `files` only so a single-set caller
// keeps working. THE DEFAULT IS A TRAP IF THE REAL CALLER TAKES IT, AND THE TRAP IS WORSE THAN THE
// FIRST DRAFT OF THIS PARAGRAPH CLAIMED — corrected here from a run, because the draft asserted the
// shape of the failure from intention and got it wrong, which is the exact defect inc.124 was about.
// Hand this scan modules alone and the vocabulary collapses to `["content"]` — what
// `scripts/gen-agent-inventory.mjs` populates, the tree's one non-test producer. `SourceFile` does
// drop out, and with it 18 of the 19 live recognisers. BUT NOT ALL 19: `FleetDoc` spells its bytes
// `content` too, so `resolveInstructionSubjects` (`lib/flags/fleetResolveDoc.ts`) SURVIVES, and the
// guard reports ONE recogniser, all discharged, on a tree that has nineteen. A zero would look like
// a misconfiguration to anyone reading it; a plausible-looking 1 is what actually gets believed.
// That is this family's own failure mode pointed at itself, so the real-tree test pins NAMED members
// of both derived sets, and pins this collapse by its exact survivor rather than by prose.

import { SOURCE_FILE, type SourceFile } from "./scanPerimeter";

/**
 * An exported object type that is a FILE AS THE WALK HANDS IT OVER: a repo-relative `path` plus the
 * file's own bytes. `SourceFile`, `FleetDoc`, `MailFile`, `SeamFile` and `AssetSource` are the five
 * on this tree — the last of them an `interface`, which is why both declaration forms are read.
 *
 * THE CONTENTS FIELD IS REQUIRED, AND IT IS WHAT KEEPS THIS FROM OVER-MATCHING. Plenty of types in
 * this family carry a `path` and are not walk output at all — `Recogniser` is `{path, name}` and
 * `ReaderAbstention` is `{path, reason}`. Those are FINDINGS ABOUT a file, and a function consuming
 * a list of findings is a reducer over another guard's answer, not a guard. Keying on `path` alone
 * would have swept both in and made this rule mean "anything holding a path", which is how a
 * derived roster turns into noise the reader learns to skim. That negative holds for the newly
 * admitted form too, and is pinned there: `RepairDoorReadiness` and `ResearchDigest` are interfaces
 * carrying a `path` and no bytes, and both stay out.
 *
 * WHICH FIELD HOLDS THE BYTES IS NO LONGER TYPED IN HERE EITHER — see `contentsFieldNames`.
 */
const WALK_OUTPUT_TYPE =
  /export (?:type ([A-Za-z0-9_]+)\s*=\s*|interface ([A-Za-z0-9_]+)[^{}]*)(\{[^}]*\})/g;
const HAS_PATH = /\bpath\s*\??:\s*string/;

/**
 * `NAME: readFileSync(…)` / `NAME: await readFile(…)`, however the fs import is spelled — a field
 * being handed a file's own bytes.
 */
const FIELD_FROM_DISK =
  /([A-Za-z0-9_]+)\s*:\s*(?:await\s+)?(?:[A-Za-z0-9_.]*\.)?readFile(?:Sync)?\s*\(/g;

/** How far back to look for the enclosing literal — these are 1–4 line object literals. */
const LITERAL_WINDOW = 300;

/** A `path` KEY in the enclosing literal: `path:` or the shorthand `path,`. */
const PATH_KEY = /(^|[{,\s])path\s*[:,]/;

/**
 * Every field name on the given files that something actually reads a file INTO, alongside a
 * `path` — the vocabulary of "this field holds the file's own bytes", read off the tree rather
 * than typed in.
 *
 * `producers` is normally modules AND tests: most of this repo's walks live in test files by
 * design (CR-3 — the module stays pure and the caller owns the filesystem), so a producer set
 * built from modules alone is nearly empty and the vocabulary silently collapses.
 */
export function contentsFieldNames(producers: readonly SourceFile[]): string[] {
  const found = new Set<string>();
  for (const file of producers) {
    if (!SOURCE_FILE.test(file.path)) continue;
    for (const match of file.text.matchAll(FIELD_FROM_DISK)) {
      const back = file.text.slice(Math.max(0, match.index - LITERAL_WINDOW), match.index);
      // `${` opens no object literal; blanking it stops a template interpolation from being read
      // as the start of one, which would hide the `path` key sitting just above.
      const open = back.replace(/\$\{/g, "  ").lastIndexOf("{");
      if (PATH_KEY.test(open >= 0 ? back.slice(open) : back)) found.add(match[1]);
    }
  }
  return [...found].sort();
}

/**
 * Every type name on the given files that a walk could hand out — the vocabulary this scan then
 * looks for in parameter lists, read off the tree instead of typed in here.
 *
 * `contentsFields` comes from `contentsFieldNames`. An empty set means no producer was found, and
 * the honest answer to that is NO walk types rather than all of them: a scan that cannot see a
 * single disk read has not proven the tree is clean, it has proven it was handed the wrong files.
 */
export function walkOutputTypes(
  files: readonly SourceFile[],
  contentsFields: readonly string[],
): string[] {
  if (contentsFields.length === 0) return [];
  const hasContents = new RegExp(`\\b(${contentsFields.join("|")})\\s*\\??:\\s*string`);
  const found = new Set<string>();
  for (const file of files) {
    if (!SOURCE_FILE.test(file.path)) continue;
    for (const [, aliasName, interfaceName, body] of file.text.matchAll(WALK_OUTPUT_TYPE)) {
      if (HAS_PATH.test(body) && hasContents.test(body)) found.add(aliasName ?? interfaceName);
    }
  }
  return [...found].sort();
}

/** `Type[]` for any of the derived walk-output names — the parameter shape that makes a recogniser. */
function walkInput(types: readonly string[]): RegExp | null {
  return types.length ? new RegExp(`\\b(${types.join("|")})\\[\\]`) : null;
}

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
export function treeScanRecognisers(
  files: readonly SourceFile[],
  producers: readonly SourceFile[] = files,
): Recogniser[] {
  // The vocabulary comes from the same files the recognisers do: hand the scan a wider tree and it
  // learns that tree's walk types, rather than staying fluent only in `lib/flags/`. And which field
  // holds a file's bytes comes from `producers` — whatever this tree actually reads a file into.
  const WALK_INPUT = walkInput(walkOutputTypes(files, contentsFieldNames(producers)));
  if (!WALK_INPUT) return [];
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
