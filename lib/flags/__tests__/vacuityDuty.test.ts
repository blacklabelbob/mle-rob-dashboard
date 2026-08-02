import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  treeScanRecognisers,
  undischargedRecognisers,
  undischargedVacuityNotice,
  dischargedBy,
  inModuleProxies,
  walkOutputTypes,
  contentsFieldNames,
} from "../vacuityDuty";
import { SCANNED_ROOTS, SOURCE_FILE, type SourceFile } from "../scanPerimeter";

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
  it("recognises a function that consumes the walk and answers with a list", () => {
    const found = treeScanRecognisers([
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
      treeScanRecognisers([
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
      treeScanRecognisers([
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
      treeScanRecognisers([
        { path: "lib/a.ts", text: "export interface Readiness { path: string; ready: boolean }" },
        { path: "lib/b.ts", text: "export function worst(all: readonly Readiness[]): string[] {" },
      ]),
    ).toEqual([]);
  });

  it("ignores a list of findings ABOUT files — a reducer is not a guard", () => {
    expect(
      treeScanRecognisers([
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
      treeScanRecognisers([
        { path: "lib/x.ts", text: `${DECLARES}export function linkify(detail: string): Segment[] {` },
      ]),
    ).toEqual([]);
  });

  it("ignores a walk consumer that answers with a single value, not a list", () => {
    expect(
      treeScanRecognisers([
        {
          path: "lib/x.ts",
          text: `${DECLARES}export function refusal(f: readonly SourceFile[]): string | null {`,
        },
      ]),
    ).toEqual([]);
  });

  it("ignores a file that is not source at all", () => {
    expect(
      treeScanRecognisers([
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
    expect(treeScanRecognisers(modules)).toEqual([
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
});
