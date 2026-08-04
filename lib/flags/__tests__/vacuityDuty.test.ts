import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  treeScanRecognisers,
  scanTreeWithNotices,
  undischargedRecognisers,
  undischargedVacuityNotice,
  dischargedBy,
  inModuleProxies,
  walkOutputTypes,
  contentsFieldNames,
  illiterateScanNotice,
  testlessProducerNotice,
} from "../vacuityDuty";
import { SCANNED_ROOTS, SOURCE_FILE, descendableDir, type SourceFile } from "../scanPerimeter";

// Q84 inc.122 — the rule under test is about THIS repo's guards, so the test reads them off disk.
// Reading bytes is the caller's job (CR-3, inc.114/inc.115): the module is pure, the walk is here.
//
// Q84 inc.123 — and the tree it reads is the PERIMETER'S, not `lib/flags/`. The old literal meant a
// guard one directory away was never asked whether it owes this duty; `mailScopeBreaches` and
// `seamViolations` were exactly that. Third deletion of a hand-chosen walk on this queue.
//
// `__tests__` is DELIBERATELY walked here, where both doors exclude it: the discharging evidence
// lives in test files, so a walk that skips them would find every recogniser undischarged. Modules
// and tests are split by path as they are collected, because they answer different questions.
const REPO = path.resolve(import.meta.dirname, "../../..");

const modules: SourceFile[] = [];
const tests: SourceFile[] = [];

function walk(dir: string, prefix: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        walk(path.join(dir, entry.name), `${rel}/`);
      }
      continue;
    }
    if (!SOURCE_FILE.test(entry.name)) continue;
    const file = { path: rel, text: readFileSync(path.join(dir, entry.name), "utf8") };
    (rel.includes("__tests__/") ? tests : modules).push(file);
  }
}

for (const root of SCANNED_ROOTS) walk(path.join(REPO, root), `${root}/`);

// Q84 inc.123 — a fixture must now DECLARE the walk type it uses, because the vocabulary is derived
// from the same files the recognisers are. That is not incidental: it is the rule under test. A
// fixture that names `SourceFile[]` without declaring it is a file set in which no walk type exists.
// Q84 inc.125 — and it must now also show a PRODUCER filling that type's bytes field from disk,
// for the same reason: which field holds the bytes is derived from what the tree reads a file into,
// so a fixture declaring `text: string` and never reading a file into `text` is a file set in which
// nothing is walk output. Same discipline inc.123 introduced, one level down.
const DECLARES =
  "export type SourceFile = { path: string; text: string };\n" +
  'const walked = { path: rel, text: readFileSync(abs, "utf8") };\n';

describe("contentsFieldNames", () => {
  it("reads the bytes field off a real disk read, whatever it is spelled", () => {
    // The case the hard-coded `text|content|source` could not see: same meaning, different noun.
    const fields = contentsFieldNames([
      { path: "lib/w.ts", text: 'const f = { path: rel, body: readFileSync(abs, "utf8") };' },
    ]);
    expect(fields).toEqual(["body"]);
  });

  it("reads the promise form and a namespaced import too", () => {
    const fields = contentsFieldNames([
      { path: "lib/w.ts", text: "const f = { path: rel, raw: await fs.readFile(abs) };" },
    ]);
    expect(fields).toEqual(["raw"]);
  });

  it("requires the enclosing literal to carry a path — a file read is not a walked file", () => {
    // Without this the rule would mean "any field ever handed a file", and `config: string` on any
    // type would read as walk output. The discriminator is the PAIR, never either half.
    const fields = contentsFieldNames([
      { path: "lib/w.ts", text: 'const c = { config: readFileSync(abs, "utf8") };' },
    ]);
    expect(fields).toEqual([]);
  });

  it("is not fooled by a template interpolation standing between path and the read", () => {
    // `${f}` opens a brace that is not a literal; reading it as one hides the `path` key above it.
    const fields = contentsFieldNames([
      {
        path: "lib/w.ts",
        text: "const d = {\n  path: `.claude/agents/${f}`,\n  content: readFileSync(abs),\n};",
      },
    ]);
    expect(fields).toEqual(["content"]);
  });
});

describe("walkOutputTypes", () => {
  it("admits a type whose bytes field the tree's own producers name", () => {
    const files = [
      { path: "lib/w.ts", text: 'const f = { path: rel, body: readFileSync(abs, "utf8") };' },
      { path: "lib/t.ts", text: "export type Blob = { path: string; body: string };" },
    ];
    expect(walkOutputTypes(files, contentsFieldNames(files))).toEqual(["Blob"]);
  });

  it("finds NO walk types when no producer was handed in, rather than all of them", () => {
    // The trap named in the module: an empty vocabulary means the scan was handed the wrong files,
    // and answering "nothing is walk output" keeps that indistinguishable from a clean tree only
    // for a caller that ignores it. The real-tree test above pins the members by name for that.
    const files = [{ path: "lib/t.ts", text: "export type Blob = { path: string; body: string };" }];
    expect(walkOutputTypes(files, contentsFieldNames(files))).toEqual([]);
  });
});

describe("treeScanRecognisers", () => {
  // Q84 inc.132 — `producers` is REQUIRED now, so these fixtures say out loud what the removed
  // default used to say for them: this set is its own producer set, which is true of a fixture that
  // carries both the disk read and the declaration. The real tree cannot honestly say that, and
  // that is the whole reason the default had to go — it let the real caller take this shape by
  // forgetting rather than by deciding. Named, so a reader sees a claim instead of an absence.
  const scanOwnProducers = (files: SourceFile[]) => treeScanRecognisers(files, files);

  // Q84 inc.132 — AND THE REMOVAL ITSELF IS PINNED, not merely done. `Function.length` counts
  // parameters before the first defaulted one, so re-adding `producers = files` drops this to 1 and
  // turns this red. Without it the only thing standing behind "the silent path is gone" is `tsc`,
  // which runs in the build and not in the suite — and a guarantee this thread argued for across
  // four increments should not be restorable by a one-token edit no test notices.
  it("cannot be handed one set by omission — the producers default is gone", () => {
    expect(treeScanRecognisers.length).toBe(2);
    // The composite is the deliberate exception, and it reads as one: 1 defaulted parameter.
    expect(scanTreeWithNotices.length).toBe(1);
  });

  it("recognises a function that consumes the walk and answers with a list", () => {
    const found = scanOwnProducers([
      {
        path: "lib/x.ts",
        text: `${DECLARES}export function subjects(files: readonly SourceFile[]): string[] {`,
      },
    ]);
    expect(found).toEqual([{ path: "lib/x.ts", name: "subjects" }]);
  });

  it("recognises one over a walk type it has never heard of, declared anywhere in the set", () => {
    // The half the widened walk alone would not have fixed: a guard elsewhere brings its own noun.
    expect(
      scanOwnProducers([
        {
          path: "lib/a.ts",
          text:
            "export type BlobFile = { path: string; content: string };\n" +
            "const b = { path: rel, content: readFileSync(abs) };",
        },
        { path: "lib/b.ts", text: "export function breaches(f: readonly BlobFile[]): string[] {" },
      ]),
    ).toEqual([{ path: "lib/b.ts", name: "breaches" }]);
  });

  it("recognises one over a walk type declared as an interface, not a type alias", () => {
    // Q84 inc.124 — which keyword the author reached for must not decide whether their guard is
    // asked whether it owes a vacuity pin.
    expect(
      scanOwnProducers([
        {
          path: "lib/a.ts",
          text:
            "export interface BlobFile { path: string; content: string }\n" +
            "const b = { path: rel, content: readFileSync(abs) };",
        },
        { path: "lib/b.ts", text: "export function breaches(f: readonly BlobFile[]): string[] {" },
      ]),
    ).toEqual([{ path: "lib/b.ts", name: "breaches" }]);
  });

  it("ignores an interface carrying a path and no bytes — the negative survives the wider grammar", () => {
    expect(
      scanOwnProducers([
        { path: "lib/a.ts", text: "export interface Readiness { path: string; ready: boolean }" },
        { path: "lib/b.ts", text: "export function worst(all: readonly Readiness[]): string[] {" },
      ]),
    ).toEqual([]);
  });

  it("ignores a list of findings ABOUT files — a reducer is not a guard", () => {
    expect(
      scanOwnProducers([
        {
          path: "lib/x.ts",
          text:
            "export type Finding = { path: string; reason: string };\n" +
            "export function worst(all: readonly Finding[]): string[] {",
        },
      ]),
    ).toEqual([]);
  });

  it("ignores a transform whose caller consumes the value", () => {
    // The class inc.121 refused: blinding this stops the expected output arriving, so it self-catches.
    expect(
      scanOwnProducers([
        { path: "lib/x.ts", text: `${DECLARES}export function linkify(detail: string): Segment[] {` },
      ]),
    ).toEqual([]);
  });

  it("ignores a walk consumer that answers with a single value, not a list", () => {
    expect(
      scanOwnProducers([
        {
          path: "lib/x.ts",
          text: `${DECLARES}export function refusal(f: readonly SourceFile[]): string | null {`,
        },
      ]),
    ).toEqual([]);
  });

  it("ignores a file that is not source at all", () => {
    expect(
      scanOwnProducers([
        {
          path: "docs/x.md",
          text: `${DECLARES}export function subjects(f: readonly SourceFile[]): string[] {`,
        },
      ]),
    ).toEqual([]);
  });
});

describe("dischargedBy", () => {
  it("accepts a real-tree pin that names the function", () => {
    expect(dischargedBy("subjects", "const f = readFileSync(p); expect(subjects(f)).toContain(x)")).toBe(true);
  });

  it("accepts a vacuity notice that names the function", () => {
    expect(dischargedBy("subjects", "expect(vacuousGuardNotice(subjects(files), g, s)).toBeNull()")).toBe(true);
  });

  it("refuses string fixtures alone — they prove the regex, not the repo", () => {
    // inc.120 measured exactly this: the live rewrite left every fixture green.
    expect(dischargedBy("subjects", 'expect(subjects([{path: "app/a.ts", text: "x"}])).toEqual([])')).toBe(false);
  });

  it("refuses a real-tree test that never names the function", () => {
    expect(dischargedBy("subjects", "readFileSync(p); expect(other(files)).toContain(x)")).toBe(false);
  });

  // Q84 inc.127 — a MENTION is not evidence. An import line names every function a test imports.
  it("refuses a real-tree test that only imports the function", () => {
    expect(
      dischargedBy("subjects", 'import { subjects } from "../x";\nreadFileSync(p);\nexpect(1).toBe(1)'),
    ).toBe(false);
  });

  // ...and the name must be in THAT assertion, not three statements downstream of one.
  it("refuses a name that merely follows an unrelated assertion", () => {
    expect(
      dischargedBy("subjects", `readFileSync(p); expect(other(f)).toBe(1);${" ".repeat(60)}\nconst s = subjects(f);`),
    ).toBe(false);
  });

  // Q84 inc.128 — THE DISK READ MUST BE AT MODULE SCOPE, and the case below is why that is not
  // pedantry: a read inside `it.skip(…)` NEVER EXECUTES, so the file says `readFileSync` and no
  // file was ever opened. inc.127's rule counted that as a real-tree pin.
  it("refuses a disk read that only ever runs inside a skipped test", () => {
    expect(
      dischargedBy(
        "subjects",
        'it.skip("walks", () => { const f = readFileSync(p); });\nit("x", () => { expect(subjects(fixture)).toEqual([]); });',
      ),
    ).toBe(false);
  });

  // ...and the same read hoisted out of the block is accepted, which is the pattern this repo
  // already uses everywhere (CR-3 — the module is pure, the caller owns the filesystem).
  it("accepts the same read hoisted to module scope", () => {
    expect(
      dischargedBy(
        "subjects",
        'const f = readFileSync(p);\nit("x", () => { expect(subjects(f)).toEqual([]); });',
      ),
    ).toBe(true);
  });

  // The vacuity-notice path is unchanged and deliberately so: it pins the SENTENCE Rob would read,
  // which owes nothing to the filesystem. Narrowing it would have been a second, unmeasured change.
  it("still accepts a vacuity-notice pin written inside a test block", () => {
    expect(
      dischargedBy("subjects", 'it("x", () => { expect(vacuousGuardNotice(subjects(f), g, s)).toBeNull(); });'),
    ).toBe(true);
  });
});

describe("inModuleProxies", () => {
  const mod = [
    "export function subjects(files: readonly SourceFile[]): string[] {",
    "  return files.map((f) => f.path);",
    "}",
    "export function notice(files: readonly SourceFile[]): string | null {",
    "  return subjects(files).length ? null : 'blind';",
    "}",
    "export function unrelated(): void {}",
  ].join("\n");

  it("names the wrapper that calls the recogniser", () => {
    expect(inModuleProxies("subjects", mod)).toEqual(["notice"]);
  });

  it("does not count a function that merely sits nearby", () => {
    expect(inModuleProxies("nothing", mod)).toEqual([]);
  });

  it("pins a recogniser reached only through its wrapper", () => {
    const recogniser = [{ path: "lib/x.ts", name: "subjects" }];
    const realTreeTest = [{ path: "t.ts", text: "readFileSync(p); expect(notice(files)).toBeNull()" }];
    expect(undischargedRecognisers(recogniser, realTreeTest)).toEqual(recogniser);
    expect(
      undischargedRecognisers(recogniser, realTreeTest, [{ path: "lib/x.ts", text: mod }]),
    ).toEqual([]);
  });
});

describe("undischargedVacuityNotice", () => {
  it("says nothing when every recogniser is pinned", () => {
    expect(undischargedVacuityNotice([])).toBeNull();
  });

  it("names the guard, its file, and which fix is the stronger one", () => {
    const notice = undischargedVacuityNotice([{ path: "lib/flags/x.ts", name: "subjects" }]);
    expect(notice).toContain("subjects (lib/flags/x.ts)");
    expect(notice).toContain("NAMED subject read off the real tree");
    // Coverage's promise is not this notice's to make (inc.119/inc.120).
    expect(notice).not.toContain("Nothing below is wrong");
  });
});

describe("the live guard family", () => {
  it("was handed modules and tests at all — an empty sweep must not read as clean", () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(tests.length).toBeGreaterThan(0);
  });

  // Q84 inc.125 — PRODUCERS ARE MODULES *AND* TESTS, and that argument is the rule, not a detail.
  // This repo's walks live in test files by design (CR-3), so `treeScanRecognisers(modules)` would
  // derive its bytes-field vocabulary from `scripts/gen-agent-inventory.mjs` alone, lose
  // `SourceFile`, and report a clean tree while seeing nothing. Pinned below by name, not by count.
  const producers = [...modules, ...tests];
  const recognisers = treeScanRecognisers(modules, producers);

  // Q84 inc.122 — the pair inc.121 established: the pin above proves the sweep REACHED files, this
  // one proves the rule was ABOUT some. This guard owes its own duty and discharges it here.
  it("recognises tree-scanning guards on the real tree", () => {
    expect(recognisers.length).toBeGreaterThan(0);
    // Named, not merely counted: the write door inc.120 pinned is one of them.
    expect(recognisers).toContainEqual({
      path: "lib/flags/payloadWriters.ts",
      name: "payloadWriteSubjects",
    });
    // Q84 inc.123 — and one from OUTSIDE `lib/flags/`, which is the whole point of both halves of
    // this increment: the old walk could not reach this file and the old vocabulary could not have
    // named its type. A count would have gone on passing after either half was reverted.
    expect(recognisers).toContainEqual({ path: "lib/coreSeam.ts", name: "seamViolations" });
  });

  // Q84 inc.125 — the bytes-field vocabulary, read off the real tree's own disk reads. Named
  // members rather than a length, because an empty derived set is exactly how this scan goes blind.
  it("learns which field holds a file's bytes from what the tree reads a file into", () => {
    const fields = contentsFieldNames(producers);
    // `text` (`SourceFile`), `content` (`FleetDoc`, `AssetSource`), `source` (`SeamFile`,
    // `MailFile`) — the three that used to be typed into the module, now read off 16 disk-read
    // sites across 9 producer files in `lib/flags/__tests__/`, `lib/__tests__/` and
    // `scripts/gen-agent-inventory.mjs`.
    expect(fields).toEqual(expect.arrayContaining(["content", "source", "text"]));

    // AND THE LIMIT, STATED RATHER THAN HIDDEN BY AN EXACT-MATCH ASSERTION THAT WOULD JUST BREAK:
    // this derivation reads TEXT, and a fixture string in a test file is text. The `body` and `raw`
    // fixtures a few describes up are producer-shaped, so they widen the LIVE vocabulary. That is
    // not fixable by excluding this file (a hand-chosen literal, the defect this whole thread keeps
    // deleting) and it is bounded: an extra field name only adds a CANDIDATE, and a candidate still
    // needs a real type declaring `path` plus that field to become walk output. Pinned, not assumed
    // — the type vocabulary below is exactly the five, fixture-invented nouns included.
    expect(fields).toContain("body");
    expect(walkOutputTypes(modules, fields)).toEqual([
      "AssetSource",
      "FleetDoc",
      "MailFile",
      "SeamFile",
      "SourceFile",
    ]);
  });

  // Q84 inc.125 — THE DEFAULT `producers = files` IS THE TRAP THE MODULE COMMENT NAMES, pinned by
  // its exact survivor because the first draft of that comment guessed the failure's shape and was
  // wrong. Modules alone leave one non-test producer (`scripts/gen-agent-inventory.mjs`), so the
  // vocabulary collapses to `content`, `SourceFile` drops out — and the scan still answers with the
  // one recogniser whose walk type happens to spell its bytes that way. A plausible 1 is believed
  // where a 0 would be questioned, which is why this is pinned by NAME and against the live count.
  it("collapses to a believable near-silence — not to zero — when handed modules as their own producers", () => {
    expect(contentsFieldNames(modules)).toEqual(["content"]);
    expect(walkOutputTypes(modules, contentsFieldNames(modules))).toEqual(["AssetSource", "FleetDoc"]);
    // Q84 inc.132 — WRITTEN OUT, because the default that used to write it is gone. This pin is the
    // reason a raw scan stays callable at all: a guard that cannot reproduce the failure it warns
    // about is prose, so `scanTreeWithNotices` does not get to be the only door. What changed is
    // that the thin scan is now a sentence someone typed, not an argument someone forgot.
    expect(treeScanRecognisers(modules, modules)).toEqual([
      { path: "lib/flags/fleetResolveDoc.ts", name: "resolveInstructionSubjects" },
    ]);
    // ...against a real tree that has nineteen. The gap IS the defect.
    expect(recognisers.length).toBe(19);
  });

  it("learns the walk's vocabulary from the tree, not from a list in the module", () => {
    const types = walkOutputTypes(modules, contentsFieldNames(producers));
    expect(types).toContain("SourceFile");
    // Declared in `lib/coreSeam.ts` — a name nothing in `lib/flags/` has ever mentioned.
    expect(types).toContain("SeamFile");
    // Q84 inc.124 — declared as an `export interface`, the form 235 exported declarations on this
    // tree use and the derivation could not read until now.
    expect(types).toContain("AssetSource");
    // A finding ABOUT a file is not a file: `{path, name}` and `{path, reason}` stay out, or this
    // rule degrades into "any type holding a path".
    expect(types).not.toContain("Recogniser");
    expect(types).not.toContain("ReaderAbstention");
    // And that negative holds in the newly admitted form: both are interfaces carrying a `path` and
    // no bytes, so widening the grammar did not widen the meaning.
    expect(types).not.toContain("RepairDoorReadiness");
    expect(types).not.toContain("ResearchDigest");
  });

  // Q84 inc.126 — THE SCAN IS A MEMBER OF THE FAMILY IT JUDGES, pinned by name because a count is
  // exactly the pin this thread has refused twice. Four of the nineteen are this module's own
  // exports; each takes the walk's output and answers with an empty-when-healthy list, so inc.121's
  // discriminator catches them the same way it catches everyone else's guards.
  it("counts its own exports among the recognisers it judges", () => {
    const self = recognisers.filter((r) => r.path === "lib/flags/vacuityDuty.ts").map((r) => r.name);
    expect(self).toEqual([
      "contentsFieldNames",
      "treeScanRecognisers",
      "undischargedRecognisers",
      "walkOutputTypes",
    ]);
  });

  // Q84 inc.126 measured the limit of that self-membership; Q84 inc.127 CLOSED it, so this pin is
  // inverted rather than deleted — the fact it recorded was true when written and is false now.
  // `dischargedBy` wanted a name and a disk read in one file, and a test that exercises these four
  // must import them by name, so the import block alone discharged them however little the file
  // asserted. It now wants the name inside an `expect(…)`: strip every assertion out of THIS file
  // and all four come back UNDISCHARGED. Measured across the whole tree before the rule changed —
  // 19 of 19 recognisers still discharge, zero false reds — so this is not a self-exemption, which
  // is what inc.126 rightly refused.
  it("reports its own exports undischarged when its test asserts nothing", () => {
    const own = readFileSync(path.join(REPO, "lib/flags/__tests__/vacuityDuty.test.ts"), "utf8");
    const assertionFree = own
      .split("\n")
      .filter((line) => !line.includes("expect("))
      .join("\n");
    const self = recognisers.filter((r) => r.path === "lib/flags/vacuityDuty.ts");
    expect(self.length).toBe(4);
    for (const r of self) expect(dischargedBy(r.name, assertionFree)).toBe(false);
  });

  // Q84 inc.127 — and the OTHER direction, which is what makes the rule above worth having rather
  // than merely stricter: with its assertions intact, every one of the nineteen still discharges.
  // A rule that closes a hole by turning the tree red is not a fix, it is a different bug.
  it("still discharges every live recogniser once assertions are required", () => {
    expect(undischargedRecognisers(recognisers, tests, modules)).toEqual([]);
  });

  it("has no recogniser that could go vacuous unnoticed", () => {
    const undischarged = undischargedRecognisers(recognisers, tests, modules);
    expect(undischargedVacuityNotice(undischarged)).toBeNull();
  });

  // Q84 inc.129 — the clean-tree pin lives HERE, next to the count it is worthless without. Nineteen
  // recognisers and zero undischarged is the same pair of numbers a blind scan reports, so the
  // green above only means something once this null says the scan could read.
  //
  // Q84 inc.131 — and it is now asked through the one entry point that cannot be given a different
  // argument set than the scan got. `illiterateScanNotice` alone was half the question: a THIN scan
  // is literate, reports 1 recogniser and 0 undischarged, and would have passed every pin above.
  //
  // Q84 inc.133 — and the live guard now PROVES it read them rather than merely asserting they are
  // empty next to a list it took anyway. `read` is what the scan handed over; the assertion that it
  // is empty is a fact about what this guard was shown, not about a property it could have skipped.
  it("says the scan could see AND was not handed a thin producer set when it reports the tree clean", () => {
    const scanned = scanTreeWithNotices(modules, producers);
    let read: readonly string[] | null = null;
    // Same arguments, same answer as the raw scan — the composite reports, it does not re-scan.
    expect(scanned.recognisersHavingRead((n) => (read = n))).toEqual(recognisers);
    expect(read).toEqual([]);
  });
});

// Q84 inc.129 — the scan's own vacuity. `treeScanRecognisers` returns `[]` for a repo with no
// tree-scanning guards AND for a scan that never read a file, and `undischargedRecognisers` cannot
// tell those apart: it passes the empty list through and the whole duty reports discharged.
describe("illiterateScanNotice", () => {
  const producers = [...modules, ...tests];

  // The exact instrument failure a previous run of this queue shipped into `__tests__` and read as
  // a finding: the derived `string[]` handed to the `SourceFile[]` parameter. Every element has an
  // undefined `.path`, so nothing matches, and the scan answers `[]` having opened nothing.
  const derived = walkOutputTypes(modules, contentsFieldNames(producers));
  const asFiles = derived as unknown as SourceFile[];

  it("fires on the empty list a blind scan returns, which is otherwise a clean bill of health", () => {
    expect(treeScanRecognisers(asFiles, asFiles)).toEqual([]);
    expect(undischargedVacuityNotice(undischargedRecognisers([], tests, modules))).toBeNull();
    expect(illiterateScanNotice(asFiles, asFiles)).not.toBeNull();
  });

  it("names the producers when no disk read was found, and says what to pass instead", () => {
    const said = illiterateScanNotice(modules, []) ?? "";
    expect(said).toContain("0 producer(s)");
    expect(said).toContain("SourceFile");
    // The fix is the argument, not the tree — and the tests are half of what belongs in it.
    expect(said).toContain("TESTS");
  });

  it("names the vocabulary it DID learn when the files hold no walk type, because the fix differs", () => {
    const said = illiterateScanNotice([{ path: "lib/x.ts", text: "export const a = 1;" }], producers);
    expect(said).toContain("bytes-field vocabulary (");
    expect(said).toContain("text");
    expect(said).toContain("1 file(s)");
    // Two silences, two sentences: an empty producer set and an empty walk-type set are not the
    // same defect, and a notice that said one thing for both would send the reader to the wrong end.
    expect(said).not.toBe(illiterateScanNotice(modules, []));
  });

  it("stays null wherever a walk type was actually derived, including inc.125's near-silence", () => {
    // Modules as their own producers collapses the vocabulary to one field — a THIN scan, not a
    // blind one. This notice must not claim that case, or it stops meaning "I never looked".
    expect(treeScanRecognisers(modules, modules).length).toBeGreaterThan(0);
    expect(illiterateScanNotice(modules, modules)).toBeNull();
  });
});

// Q84 inc.130 — THE CASE THE LINE ABOVE DELIBERATELY LEAVES OPEN. inc.129 gave the zero a sentence;
// the near-silence still had none, and a plausible 1 is the more dangerous of the two because it
// never prompts the question. Pinned against the LIVE tree in both directions, because the whole
// claim is about which producer set was passed and a fixture cannot exhibit that.
describe("testlessProducerNotice", () => {
  const producers = [...modules, ...tests];

  it("fires on exactly inc.125's collapse, where the illiteracy notice is correctly silent", () => {
    // The same arguments, the same derivation, two different verdicts — that is the point.
    expect(illiterateScanNotice(modules, modules)).toBeNull();
    const said = testlessProducerNotice(modules, modules) ?? "";
    expect(said).not.toBe("");
    // It names the thin vocabulary it actually learned, so the reader can see it is the wrong one.
    expect(contentsFieldNames(modules)).toEqual(["content"]);
    expect(said).toContain("vocabulary (content)");
    // And it says what to pass instead, in the form that fixes it.
    expect(said).toContain("[...modules, ...tests]");
  });

  it("stays silent on the live producer set, which is the one call that is not thin", () => {
    expect(testlessProducerNotice(modules, producers)).toBeNull();
    // Not silent by accident: the live set is strictly richer, and that gap is the defect's size.
    expect(contentsFieldNames(producers).length).toBeGreaterThan(contentsFieldNames(modules).length);
    expect(treeScanRecognisers(modules, producers).length).toBe(19);
    expect(treeScanRecognisers(modules, modules).length).toBe(1);
  });

  it("defers to illiterateScanNotice rather than doubling it when the scan learned nothing", () => {
    // No disk read at all: blind, not thin. One cause must not print two sentences.
    expect(illiterateScanNotice(modules, [])).not.toBeNull();
    expect(testlessProducerNotice(modules, [])).toBeNull();
    // Fields learned but no walk type on the files given — still illiteracy, still not this. The
    // producers here must be TESTLESS, or the perimeter check alone would return null and this
    // would pass without the deferral ever running: mutation-checked, and the first draft of this
    // test passed `producers` and stayed green with the deferral deleted.
    const barren = [{ path: "lib/x.ts", text: "export const a = 1;" }];
    expect(illiterateScanNotice(barren, modules)).not.toBeNull();
    expect(testlessProducerNotice(barren, modules)).toBeNull();
    // And the same pair with tests in the producer set, which the perimeter check answers instead.
    expect(illiterateScanNotice(barren, producers)).not.toBeNull();
    expect(testlessProducerNotice(barren, producers)).toBeNull();
  });

  // THE TEST THAT ACTUALLY DECIDES THE DESIGN, and it exists because the mutation run demanded it:
  // substituting `fields.length >= 2` for the perimeter check left all of the above GREEN. A floor
  // passes this tree by luck — the live producer set happens to have two spellings — so nothing
  // written so far distinguished the rule that is derived from the constant that is invented. This
  // fixture separates them: ONE bytes-field spelling, learned from a producer set that DOES include
  // the tests, is a complete vocabulary and must stay silent. A floor calls it thin and is wrong.
  it("stays silent on a one-field vocabulary that a test producer supplied — size is not the question", () => {
    const declaring = {
      path: "lib/a.ts",
      text: "export type Blob = { path: string; body: string };",
    };
    const testProducer = {
      path: "lib/__tests__/a.test.ts",
      text: 'const f = { path: rel, body: readFileSync(abs, "utf8") };',
    };
    const withTests = [declaring, testProducer];
    // One spelling only — the exact input any floor of 2 would reject.
    expect(contentsFieldNames(withTests)).toEqual(["body"]);
    // And a walk type was genuinely derived from it, so this is not illiteracy either.
    expect(walkOutputTypes([declaring], contentsFieldNames(withTests))).toEqual(["Blob"]);
    expect(testlessProducerNotice([declaring], withTests)).toBeNull();
    // Same vocabulary, same size, tests removed: now it IS thin, and the notice fires. The count did
    // not change between these two calls — only where the producers came from. That is the claim.
    expect(contentsFieldNames([declaring, { ...testProducer, path: "lib/a.probe.ts" }])).toEqual([
      "body",
    ]);
    expect(
      testlessProducerNotice([declaring], [declaring, { ...testProducer, path: "lib/a.probe.ts" }]),
    ).not.toBeNull();
  });

  it("asks descendableDir rather than matching a directory name typed in here", () => {
    // The predicate is the walk's own. A producer beyond the perimeter silences the notice, and it
    // is EXCLUDED_DIRS that decides which those are — rename the concept and this follows.
    const one = modules.slice(0, 1);
    expect(one).toHaveLength(1);
    const withTest = [...one, tests[0]];
    expect(tests[0].path).toContain("__tests__");
    expect(descendableDir("__tests__")).toBe(false);
    expect(testlessProducerNotice(modules, withTest)).toBeNull();
  });
});

// Q84 inc.131 — THE CALL. Both notices existed and neither was compulsory: the live guard asked the
// illiteracy one and had never asked the thinness one, so a THIN scan (1 recogniser, 0 undischarged,
// literate) would have walked past every pin in this file. `undischargedRecognisers` cannot be the
// place that demands them — it is handed a LIST, never the arguments behind it, so requiring the
// sentences there would mean trusting a caller to pass the same values twice, which is the very
// failure the notices exist to catch. The scan's entry point is the only place the arguments are
// written once.
describe("scanTreeWithNotices", () => {
  const producers = [...modules, ...tests];

  /** Q84 inc.133 — the written no-op: what a caller who wants only the list must now say out loud. */
  const listOnly = (scanned: ReturnType<typeof scanTreeWithNotices>) =>
    scanned.recognisersHavingRead(() => {});

  it("carries inc.130's sentence on inc.125's collapse, which the live guard never asked for", () => {
    const thin = scanTreeWithNotices(modules, modules);
    // Literate, plausible, and wrong — the shape that used to pass.
    expect(listOnly(thin).length).toBe(1);
    expect(illiterateScanNotice(modules, modules)).toBeNull();
    expect(thin.notices).toHaveLength(1);
    expect(thin.notices[0]).toContain("NOT ONE sits beyond the walk's own perimeter");
  });

  it("carries inc.129's sentence on the blind scan, and only that one", () => {
    const derived = walkOutputTypes(modules, contentsFieldNames(producers));
    const asFiles = derived as unknown as SourceFile[];
    const blind = scanTreeWithNotices(asFiles, asFiles);
    expect(listOnly(blind)).toEqual([]);
    // Exactly one cause, exactly one sentence: the thinness notice defers, so nothing here has to
    // suppress it. Two sentences for one defect would read as noise.
    expect(blind.notices).toHaveLength(1);
    expect(blind.notices[0]).toContain("measurement of the arguments");
  });

  it("hands the scan and both notices the identical argument set", () => {
    // The whole reason this function exists rather than a docstring asking callers to be careful.
    for (const [files, given] of [
      [modules, producers],
      [modules, modules],
      [modules, []],
    ] as const) {
      const scanned = scanTreeWithNotices(files, given);
      const expected = [
        illiterateScanNotice(files, given),
        testlessProducerNotice(files, given),
      ].filter(Boolean);
      let read: readonly string[] | null = null;
      expect(scanned.recognisersHavingRead((n) => (read = n))).toEqual(
        treeScanRecognisers(files, given),
      );
      expect(scanned.notices).toEqual(expected);
      // Q84 inc.133 — and what the caller is HANDED is the same set the property shows. A handler
      // fed a different list would make the gate a ceremony: read one thing, be judged on another.
      expect(read).toEqual(expected);
    }
  });

  // Q84 inc.133 — THE GATE ITSELF, pinned so it cannot quietly become a property again. Restoring
  // `recognisers` as a field is a small edit that no other test in this file would notice, and the
  // hole it reopens is the one this increment closed: a caller destructuring past both sentences
  // with nothing on the record. `Function.length` reads the arity, so a handler defaulted to a
  // no-op — the same silent-by-omission trick inc.132 deleted downstairs — turns this red too.
  it("hands the recogniser list over only through a stated notice decision", () => {
    const scanned = scanTreeWithNotices(modules, producers);
    expect(scanned).not.toHaveProperty("recognisers");
    expect(typeof scanned.recognisersHavingRead).toBe("function");
    expect(scanned.recognisersHavingRead.length).toBe(1);
  });

  // Q84 inc.133 — and the clean case is a decision too. If `handle` were skipped when there is
  // nothing to say, every caller would be trained on a gate that only fires when something is
  // wrong, and the empty list — the one that means "asked, and the answer was nothing" — would be
  // indistinguishable from never having asked. That is this whole thread's defect in miniature.
  it("invokes the handler even when there is nothing to report", () => {
    let calls = 0;
    const scanned = scanTreeWithNotices(modules, producers);
    scanned.recognisersHavingRead((n) => {
      calls += 1;
      expect(n).toEqual([]);
    });
    expect(calls).toBe(1);
  });

  // Q84 inc.132 — the scan's default is GONE and this one stays, and the difference is not taste.
  // Retitled rather than deleted: the fact it recorded ("exactly as the scan does") was true when
  // written and is false now, and inverting a pin is how this thread has handled that since inc.127.
  //
  // Q84 inc.133 — compared field-by-field rather than whole. The return value now carries a closure,
  // and two closures are never `toEqual`, so the old whole-object comparison would have gone red for
  // a reason that has nothing to do with the claim. The claim is unchanged: same list, same
  // sentences, and it is now stated in the two parts a reader can check.
  it("may default producers to files — because omitting them here is reported, not silent", () => {
    const omitted = scanTreeWithNotices(modules);
    expect(omitted.notices).toEqual(scanTreeWithNotices(modules, modules).notices);
    expect(listOnly(omitted)).toEqual(listOnly(scanTreeWithNotices(modules, modules)));
    // THE REASON THE DEFAULT SURVIVES HERE: a caller who omits is TOLD. The same omission on the
    // raw scan produced this list with nobody to say so, which is why the compiler now refuses it.
    expect(omitted.notices).toContain(testlessProducerNotice(modules, modules));
    expect(listOnly(omitted).length).toBe(1);
  });
});
