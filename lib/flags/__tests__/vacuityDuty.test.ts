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
const DECLARES = "export type SourceFile = { path: string; text: string };\n";

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
        { path: "lib/a.ts", text: "export type BlobFile = { path: string; content: string };" },
        { path: "lib/b.ts", text: "export function breaches(f: readonly BlobFile[]): string[] {" },
      ]),
    ).toEqual([{ path: "lib/b.ts", name: "breaches" }]);
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

  const recognisers = treeScanRecognisers(modules);

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

  it("learns the walk's vocabulary from the tree, not from a list in the module", () => {
    const types = walkOutputTypes(modules);
    expect(types).toContain("SourceFile");
    // Declared in `lib/coreSeam.ts` — a name nothing in `lib/flags/` has ever mentioned.
    expect(types).toContain("SeamFile");
    // A finding ABOUT a file is not a file: `{path, name}` and `{path, reason}` stay out, or this
    // rule degrades into "any type holding a path".
    expect(types).not.toContain("Recogniser");
    expect(types).not.toContain("ReaderAbstention");
  });

  it("has no recogniser that could go vacuous unnoticed", () => {
    const undischarged = undischargedRecognisers(recognisers, tests, modules);
    expect(undischargedVacuityNotice(undischarged)).toBeNull();
  });
});
