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

// Q84 inc.126 — THE GUARD IS INSIDE ITS OWN SUBJECT SET, AND THE DISCHARGE HALF OF THAT IS UNEARNED.
//
// inc.125's handover asked whether this module judging itself is sound, or whether a module that
// judges itself can go quiet about itself. MEASURED ON THE REAL TREE, BOTH DIRECTIONS SEPARATELY,
// because they do not have the same answer.
//
// FOUR OF THE NINETEEN LIVE RECOGNISERS ARE THIS FILE'S OWN EXPORTS — `contentsFieldNames`,
// `walkOutputTypes`, `treeScanRecognisers`, `undischargedRecognisers`. Not an accident of the regex:
// each one takes `SourceFile[]` and answers with a list whose healthy value is empty, which is
// inc.121's discriminator exactly. The scan is a member of the family it judges.
//
// THE DETECTION DIRECTION IS SOUND, AND IT IS SOUND FOR A REASON WORTH WRITING DOWN. If this rule
// narrows, it stops seeing its own four along with everyone else's fifteen — a guard cannot notice
// its own blindness, by construction. What stands between that and a silent green is not the guard;
// it is the real-tree pin in the test, which is the whole point of the duty this module exists to
// enforce. The mechanism defends itself only because it is pinned from outside, so the four are now
// pinned BY NAME rather than riding on a count, which is the weak pin inc.123 already refused once.
//
// THE DISCHARGE DIRECTION IS NOT SOUND, AND THAT IS THIS INCREMENT'S FINDING. `dischargedBy` asks
// for two things in one file: the name, and a disk read. A test that exercises these functions at
// all MUST import them by name, and MUST read the real tree to be worth anything — so both
// conditions are met by the file's import block plus a single `readFileSync(` token. MEASURED, not
// reasoned: strip every line containing `expect(` from this module's own test and all four stay
// discharged; cut the file down to its imports and one such token and they still do. THESE FOUR CAN
// NEVER BE REPORTED UNDISCHARGED, whatever the test does or stops doing.
//
// SAID PLAINLY: THAT IS NOT A SELF-ONLY DEFECT, WHICH IS WHY NO SELF-EXEMPTION IS ADDED HERE. Every
// recogniser whose discharging evidence lives in its own real-tree test enjoys the same free pass;
// self-membership only makes it unavoidable rather than likely. Excluding this file from its own
// sweep would be the hand-chosen literal inc.117/inc.118/inc.123/inc.124/inc.125 each deleted once,
// and would delete the detection direction — the sound half — to paper over the other. The limit is
// pinned in code below instead, so it cannot be rediscovered as prose a sixth time.

// Q84 inc.127 — A MENTION WAS BEING READ AS EVIDENCE, AND THE FIX COSTS NOTHING ON THIS TREE.
//
// inc.126 measured the hole and left it open on purpose: `dischargedBy` asked for the NAME and a
// disk read in one file, and an import line supplies the name. Strip every assertion out of a
// module's own test and its recognisers stayed discharged. inc.126 declined to paper over that with
// a self-exemption — the right call — and handed the real question here: can a discharging test be
// required to ASSERT something about the name, and what does that cost on guards like `anchorSites`
// that are pinned only through a wrapper?
//
// MEASURED ON THE REAL TREE BEFORE ANY CODE, BOTH CANDIDATE RULES, AND THEY ARE NOT CLOSE.
//   • name inside an `expect(…)` somewhere in the file — 19 of 19 recognisers still discharge.
//     ZERO false reds. Including `anchorSites`, whose wrapper `missingAnchorNotice` is what the
//     assertions actually name; the proxy hop already handles that and needed no change.
//   • name inside an `expect(…)` in the SAME `it(…)` block as the disk read — 4 of 19. FIFTEEN
//     false reds, and the reason is structural rather than sloppy: this repo walks the tree ONCE at
//     describe scope and asserts against the result in many blocks (CR-3 — the module is pure, the
//     caller owns the filesystem). That rule would demand every test re-read the disk per assertion,
//     punishing the exact pattern the perimeter was built around. Refused, and the number is why.
//
// SO THE RULE NOW WANTS AN ASSERTION, AND THE HOLE inc.126 MEASURED IS CLOSED: assertion-free, this
// module's own four exports come back UNDISCHARGED, where before they could not. That test is
// inverted below rather than deleted — the fact it pinned was true when written and is false now.
//
// THE RESIDUAL LIMIT IS REAL AND IS SAID OUT LOUD RATHER THAN LEFT FOR inc.128 TO FIND. The disk
// read and the assertion still need not be in the same test — that is the 15/19 measurement above,
// accepted deliberately. What this rule proves is that a test ASSERTS ABOUT the named subject in a
// file that reads the real tree; it does not prove the assertion ran against what was read. That is
// what a name-matching rule can honestly claim, so the notice now says so instead of implying more.

import { SOURCE_FILE, descendableDir, type SourceFile } from "./scanPerimeter";

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
 * A MENTION IS NOT EVIDENCE — inc.127. The name must sit inside an `expect(…)`, because an import
 * line names every function a test imports and that was enough until inc.127 measured it.
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
const READS_DISK_ALL = /readdirSync|readFileSync|readdir\(|readFile\(/g;

/** `it(` / `test(` and their modifiers — `it.skip(`, `test.each(`, `it.concurrent.only(`. */
const TEST_BLOCK_OPEN = /\b(?:it|test)(?:\.\w+)*\s*\(/g;

/** How far an `expect(` reaches — these assertions are one statement, several of them wrapped. */
const ASSERTION_WINDOW = 400;

/**
 * Byte ranges of every `it(…)` / `test(…)` callback body in `testText`, by brace balance.
 *
 * DELIBERATELY A LEXICAL SCAN AND NOT A PARSER, WITH BOTH FAILURE DIRECTIONS STATED. An unbalanced
 * brace inside a string or comment can widen a range (a module-scope read then reads as nested →
 * a FALSE RED, which is loud and gets fixed) or close one early (a nested read reads as
 * module-scope → back to the pre-inc.128 rule, no worse than before). Neither direction can
 * manufacture evidence that was not there.
 */
function testBlockRanges(testText: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of testText.matchAll(TEST_BLOCK_OPEN)) {
    const open = testText.indexOf("{", match.index ?? 0);
    if (open < 0) continue;
    let depth = 0;
    for (let at = open; at < testText.length; at++) {
      if (testText[at] === "{") depth++;
      else if (testText[at] === "}" && --depth === 0) {
        ranges.push([open, at]);
        break;
      }
    }
  }
  return ranges;
}

/**
 * Whether `testText` reads the real tree AT MODULE SCOPE — outside every `it(…)` body.
 *
 * inc.127 left this residual open by name: the disk read and the assertion need not be in the same
 * test. Requiring the same `it(…)` block was measured and refused (4 of 19 — this repo walks the
 * tree ONCE at describe scope by design, CR-3). SCOPE is the tie that rule could not make by BLOCK,
 * and the difference is not stylistic: a module-scope read executes on import, before every
 * assertion in the file and unconditionally, while a read inside an `it(…)` body runs only if that
 * test runs. `it.skip`, `.only` elsewhere, or a `-t` filter and the disk is never touched — yet the
 * file still says `readFileSync` and the pre-inc.128 rule still called that a real-tree pin.
 *
 * MEASURED BEFORE ADOPTING, exactly as inc.127's two candidates were: 19 of 19 live recognisers
 * still discharge. Zero false reds, because the pattern this repo already follows IS the walk at
 * module scope.
 */
function readsDiskAtModuleScope(testText: string): boolean {
  const ranges = testBlockRanges(testText);
  for (const match of testText.matchAll(READS_DISK_ALL)) {
    const at = match.index ?? 0;
    if (!ranges.some(([open, close]) => at > open && at < close)) return true;
  }
  return false;
}

/**
 * Whether some assertion in `testText` is ABOUT `name` — the name inside an `expect(…)` statement,
 * not merely present in the file. An import line names every function a test imports, so a mention
 * proves only that the module was loaded (inc.126 measured that: assertion-free, this module's own
 * exports still discharged). Bounded to one statement so a name three assertions later cannot ride
 * along on an unrelated `expect(`.
 */
function assertsAbout(name: string, testText: string): boolean {
  const mentioned = new RegExp(`\\b${name}\\b`);
  for (let at = testText.indexOf("expect("); at >= 0; at = testText.indexOf("expect(", at + 1)) {
    const statement = testText.slice(at, at + ASSERTION_WINDOW);
    const end = statement.indexOf(";");
    if (mentioned.test(end >= 0 ? statement.slice(0, end) : statement)) return true;
  }
  return false;
}

export function dischargedBy(name: string, testText: string): boolean {
  if (!assertsAbout(name, testText)) return false;
  if (testText.includes("vacuousGuardNotice")) return true;
  // inc.128 — the read must be at module scope, not merely somewhere in the file. `READS_DISK`
  // remains the vocabulary both paths share; only WHERE it counts has narrowed.
  return READS_DISK.test(testText) && readsDiskAtModuleScope(testText);
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
    `proves the regex works on text someone typed, not on the repo. The name must appear inside an ` +
    `assertion; importing it is not evidence. The disk read must sit at MODULE SCOPE, outside every ` +
    `it(...) body — a read inside a skipped or filtered test never runs. What that proves is that a ` +
    `test ASSERTS ABOUT the name in a file that walked the real tree before it — not that the ` +
    `assertion ran against what was walked.`
  );
}

// Q84 inc.129 — THE SCAN CAN GO BLIND AND ANSWER `[]`, WHICH IS THE ONE VACUITY IT NEVER CHECKED
// ON ITSELF. A previous driver run left an untracked probe in `__tests__` that called
// `treeScanRecognisers(all, walkOutputTypes(all, contentsFieldNames(all)))` — passing the derived
// `string[]` where the `producers: SourceFile[]` overload wanted the FILES. Every element then had
// an undefined `.path`, `contentsFieldNames` matched nothing, `walkOutputTypes` returned `[]`,
// `WALK_INPUT` came back null, and the scan returned `[]` at the top of its body without ever
// looking at a file. The probe printed `recognisers: 0` and a `LOST []` measurement, and both read
// as findings about the tree. They were findings about a broken instrument.
//
// THAT IS NOT A HYPOTHETICAL AND IT IS NOT inc.125's CASE. inc.125 pinned the near-silence: hand
// the scan modules as their own producers and the vocabulary collapses to `content`, leaving ONE
// recogniser where the tree has nineteen — a plausible number, believed because it is not zero.
// This is the other end of the same axis, and it is worse precisely because it IS zero: nineteen
// recognisers exist, the caller swept the whole tree, and the answer was the empty array that
// `undischargedRecognisers` then passes through and `undischargedVacuityNotice` renders as null.
// The entire duty reports discharged. Green, on a tree the scan never read.
//
// WHY A NOTICE RATHER THAN A THROW. Every other blindness in this family is REPORTED, not raised
// (`unscannedNotice`, `unpopulatedRootNotice`, `vacuousGuardNotice`) — because the caller is a
// guard's test and its job is to print what it cannot see, not to die. Throwing would also make
// the legitimate empty case unavailable: a caller may hand this scan a genuinely typeless subtree
// and be entitled to `[]`. What it is not entitled to is `[]` WITHOUT BEING TOLD which `[]` it got.
//
// AND THE CHECK IS THE SCAN'S OWN DERIVATION, RE-ASKED — not a second copy of it (inc.4, inc.5,
// inc.115: a hand-copied ladder is the defect this queue has deleted three times). Both halves are
// named, because they fail for different reasons and the fix differs: an empty BYTES-FIELD set
// means the producers never read a file (wrong argument, or modules-only), while an empty WALK-TYPE
// set means the files hold no type shaped like walk output (wrong tree, or the grammar drifted).

/**
 * The sentence the scan prints when it could not learn a vocabulary — so its `[]` means "I never
 * looked", not "this tree is clean".
 *
 * Arguments are exactly `treeScanRecognisers`' own, and must be the SAME values, or this answers
 * about a derivation the scan did not run. A caller pinning a clean tree pins this null alongside
 * the recogniser count, because the two silences are otherwise the same silence.
 *
 * Refuses the `Nothing below is wrong` opening for the reason `vacuousGuardNotice` does: this names
 * a claim that has stopped being about anything, not code that is merely unwatched.
 */
export function illiterateScanNotice(
  files: readonly SourceFile[],
  producers: readonly SourceFile[] = files,
): string | null {
  const fields = contentsFieldNames(producers);
  const types = walkOutputTypes(files, fields);
  if (types.length) return null;
  const cause = fields.length
    ? `it learned the bytes-field vocabulary (${fields.join(", ")}) but found no type on the ` +
      `${files.length} file(s) it was given carrying one of those fields alongside a path`
    : `not one of the ${producers.length} producer(s) it was given reads a file into a field ` +
      `beside a path, so the bytes-field vocabulary is empty and no walk type could be derived`;
  return (
    `treeScanRecognisers returned an empty list because ${cause}. That empty list is the SAME ` +
    `value it returns for a repo with no tree-scanning guards at all, so undischargedRecognisers ` +
    `passes it through and the whole vacuity duty reports discharged without a single file having ` +
    `been examined. Do not read the zero as a measurement of the tree — it is a measurement of the ` +
    `arguments. Check that producers are SourceFile objects (a derived string[] passed here has an ` +
    `undefined .path and matches nothing) and that they include the TESTS, where this repo's walks ` +
    `live by design.`
  );
}

// Q84 inc.130 — A ONE-FIELD VOCABULARY IS STILL REPORTED LITERATE, AND A FLOOR IS NOT THE FIX.
// inc.129 closed the zero (`illiterateScanNotice`): a scan that learned nothing now says so instead
// of returning the same `[]` a clean tree returns. inc.125 measured the other end and left it open —
// hand the scan modules as their own producers and the vocabulary collapses to `content`, one field,
// which yields ONE recogniser where the tree has nineteen. `illiterateScanNotice` returns null for
// that, correctly: a vocabulary was learned. It is just the wrong one, and 1 is believed where 0
// would be questioned.
//
// THE OBVIOUS FIX IS A FLOOR, AND IT IS NOT DEFENSIBLE. "Fewer than N fields is too thin" requires
// an N nobody can derive. This tree happens to have five walk-output types and two bytes-field
// spellings today; any constant written down here is a hand-written question one level down from a
// derived answer — the exact defect inc.115, inc.125 and inc.127 each deleted. A floor of 2 passes
// this tree by luck and starts lying the moment a producer set legitimately has one spelling.
//
// SO GATE THE CAUSE, NOT THE SIZE. The collapse has one mechanism, and it is a fact about the
// ARGUMENTS rather than a judgement about the count: the producer set contained no test file. This
// repo's walks live in tests by design (CR-3 — the module stays pure and the caller owns the
// filesystem), so producers drawn only from the walk's own perimeter can only ever see the handful
// of disk reads that leaked into modules. That question has an exact, derived answer already in the
// grammar: `descendableDir` is what the walk itself asks before entering a directory, and a file the
// walk refuses to descend to is precisely what a `__tests__` file is. No number is invented, and if
// `EXCLUDED_DIRS` ever changes this check follows it instead of drifting away from it.
//
// WHY IT IS NOT FOLDED INTO illiterateScanNotice. Those are different failures with different fixes
// and, more to the point, different truth values: illiteracy is "I never looked", thinness is "I
// looked in a place that could not hold the answer". A caller may also be entitled to a testless
// producer set — a subtree genuinely without tests — so this reports rather than throws, exactly as
// the rest of this family does.

/** A path the walk would never hand a guard because it refuses to enter the directory it sits in. */
function beyondTheWalk(filePath: string): boolean {
  return filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => !descendableDir(segment));
}

/**
 * The sentence the scan prints when it learned a vocabulary, but learned it from producers that
 * could not have held the whole one — so its answer is thin rather than wrong, and thin reads as
 * true.
 *
 * Null when the scan is blind outright: that is `illiterateScanNotice`'s sentence, and printing both
 * for one cause would make the reader treat the pair as noise. Null too when the producer set does
 * include files from beyond the walk's perimeter, which on this tree means the tests.
 *
 * Arguments are `treeScanRecognisers`' own and must be the SAME values, for the reason
 * `illiterateScanNotice` names: anything else answers about a derivation the scan did not run.
 */
export function testlessProducerNotice(
  files: readonly SourceFile[],
  producers: readonly SourceFile[] = files,
): string | null {
  const fields = contentsFieldNames(producers);
  if (!fields.length || !walkOutputTypes(files, fields).length) return null;
  const sources = producers.filter((p) => SOURCE_FILE.test(p.path));
  if (!sources.length || sources.some((p) => beyondTheWalk(p.path))) return null;
  return (
    `treeScanRecognisers learned its bytes-field vocabulary (${fields.join(", ")}) from ` +
    `${sources.length} producer(s) of which NOT ONE sits beyond the walk's own perimeter — no test ` +
    `file is among them. This repo's walks live in tests by design, so a producer set drawn only ` +
    `from scanned roots sees just the disk reads that leaked into modules, and the vocabulary comes ` +
    `back thin rather than empty. The recogniser count that follows is therefore a plausible ` +
    `number, not a measurement: a believable 1 gets accepted where a 0 would have been questioned. ` +
    `Pass the tests as producers — treeScanRecognisers(modules, [...modules, ...tests]) — and ` +
    `compare the counts before trusting either. This is deliberately NOT a floor on how many fields ` +
    `count as enough: no such number can be derived from the tree, so none is written here.`
  );
}
