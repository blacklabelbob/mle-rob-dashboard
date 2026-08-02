import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  treeScanRecognisers,
  undischargedRecognisers,
  undischargedVacuityNotice,
  dischargedBy,
  inModuleProxies,
} from "../vacuityDuty";
import { descendableDir, SOURCE_FILE, type SourceFile } from "../scanPerimeter";

// Q84 inc.122 — the rule under test is about THIS repo's guards, so the test reads them off disk.
// Reading bytes is the caller's job (CR-3, inc.114/inc.115): the module is pure, the walk is here.
const FLAGS_DIR = path.resolve(import.meta.dirname, "..");

function walk(dir: string, prefix: string, into: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      // `__tests__` is excluded from the guards' own walk, so it is walked separately below.
      if (descendableDir(entry.name)) walk(path.join(dir, entry.name), `${rel}/`, into);
      continue;
    }
    if (SOURCE_FILE.test(entry.name)) {
      into.push({ path: rel, text: readFileSync(path.join(dir, entry.name), "utf8") });
    }
  }
}

const modules: SourceFile[] = [];
walk(FLAGS_DIR, "lib/flags/", modules);

const testsDir = path.join(FLAGS_DIR, "__tests__");
const tests: SourceFile[] = readdirSync(testsDir)
  .filter((f) => SOURCE_FILE.test(f))
  .map((f) => ({
    path: `lib/flags/__tests__/${f}`,
    text: readFileSync(path.join(testsDir, f), "utf8"),
  }));

describe("treeScanRecognisers", () => {
  it("recognises a function that consumes the walk and answers with a list", () => {
    const found = treeScanRecognisers([
      { path: "lib/x.ts", text: "export function subjects(files: readonly SourceFile[]): string[] {" },
    ]);
    expect(found).toEqual([{ path: "lib/x.ts", name: "subjects" }]);
  });

  it("ignores a transform whose caller consumes the value", () => {
    // The class inc.121 refused: blinding this stops the expected output arriving, so it self-catches.
    expect(
      treeScanRecognisers([
        { path: "lib/x.ts", text: "export function linkify(detail: string): Segment[] {" },
      ]),
    ).toEqual([]);
  });

  it("ignores a walk consumer that answers with a single value, not a list", () => {
    expect(
      treeScanRecognisers([
        { path: "lib/x.ts", text: "export function refusal(files: readonly SourceFile[]): string | null {" },
      ]),
    ).toEqual([]);
  });

  it("ignores a file that is not source at all", () => {
    expect(
      treeScanRecognisers([
        { path: "docs/x.md", text: "export function subjects(files: readonly SourceFile[]): string[] {" },
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
  });

  it("has no recogniser that could go vacuous unnoticed", () => {
    const undischarged = undischargedRecognisers(recognisers, tests, modules);
    expect(undischargedVacuityNotice(undischarged)).toBeNull();
  });
});
