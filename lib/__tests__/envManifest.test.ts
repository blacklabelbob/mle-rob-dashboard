import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, no types by design (same shape as the guard scripts)
import {
  AMBIENT,
  diffEnvManifest,
  isTestPath,
  parseEnvExample,
  scanEnvReads,
} from "../../scripts/env-manifest.mjs";

// Q71 Phase 5: `.env.example` must list every variable the code reads.
// The load-bearing test is the LAST one — it runs against the real repo, so it
// fails the day someone adds `process.env.NEW_THING` without documenting it.
// The unit tests above it use INVENTED variable names throughout, so this file
// can never become a copy of the manifest it is grading.

const repoRoot = path.resolve(__dirname, "..", "..");

describe("scanEnvReads", () => {
  it("finds direct process.env reads in both dot and bracket form", () => {
    const src = `const a = process.env.FAKE_ALPHA; const b = process.env["FAKE_BETA"];`;
    expect(scanEnvReads(src)).toEqual(["FAKE_ALPHA", "FAKE_BETA"]);
  });

  // The repo's real pattern: `function f(env: NodeJS.ProcessEnv = process.env)`
  // then `env.X`. A scanner blind to this reported four live webhook secrets as
  // unread and would have blessed an incomplete example file.
  it("finds reads through an injected env parameter", () => {
    const src = `export function cfg(env: NodeJS.ProcessEnv = process.env) {
      return { s: env.FAKE_INJECTED_SECRET };
    }`;
    expect(scanEnvReads(src)).toContain("FAKE_INJECTED_SECRET");
  });

  it("does not treat other objects' SCREAMING_SNAKE members as env reads", () => {
    const src = `const x = config.FAKE_NOT_ENV; const y = settings["FAKE_ALSO_NOT"];`;
    expect(scanEnvReads(src)).toEqual([]);
  });

  it("ignores lowercase and too-short members so ordinary code cannot inflate the set", () => {
    const src = `process.env.nodeEnv; env.ID; env.mode;`;
    expect(scanEnvReads(src)).toEqual([]);
  });

  it("dedupes repeated reads of one variable", () => {
    const src = `process.env.FAKE_DUP; process.env.FAKE_DUP; env.FAKE_DUP;`;
    expect(scanEnvReads(src)).toEqual(["FAKE_DUP"]);
  });

  // The scanner's own comment said `env.NODE` must not match — and the scanner
  // read that sentence and required NODE to be documented. A name discussed in
  // prose is not a read; the same rule parseEnvExample already applies.
  it("does not count a name that appears only in a line or block comment", () => {
    const src = [
      "// process.env.FAKE_IN_LINE_COMMENT",
      "/* env.FAKE_IN_BLOCK_COMMENT */",
      "/**",
      " * process.env.FAKE_IN_JSDOC",
      " */",
      "const real = process.env.FAKE_REAL_READ;",
    ].join("\n");
    expect(scanEnvReads(src)).toEqual(["FAKE_REAL_READ"]);
  });

  it("resumes scanning after a block comment closes, including on the same line", () => {
    const src = `/* env.FAKE_HIDDEN */ const a = process.env.FAKE_AFTER_BLOCK;`;
    expect(scanEnvReads(src)).toEqual(["FAKE_AFTER_BLOCK"]);
  });

  // Trailing comments are NOT stripped, by choice: finding the real start of a
  // mid-line `//` needs string tracking, which misreads quotes inside a regex
  // literal and can drop a real read. Over-reporting is the survivable error.
  it("still scans a trailing comment rather than risk losing a real read", () => {
    expect(scanEnvReads(`const a = 1; // process.env.FAKE_TRAILING`)).toEqual(["FAKE_TRAILING"]);
  });

  it("keeps a read that sits inside a template literal", () => {
    const src = "const u = `${process.env.FAKE_IN_TEMPLATE}/path`;";
    expect(scanEnvReads(src)).toEqual(["FAKE_IN_TEMPLATE"]);
  });
});

describe("parseEnvExample", () => {
  it("counts a KEY= assignment, with or without a value", () => {
    expect(parseEnvExample("FAKE_EMPTY=\nFAKE_FILLED=value\n")).toEqual([
      "FAKE_EMPTY",
      "FAKE_FILLED",
    ]);
  });

  // A name mentioned only in a comment is not documented: a reader copying the
  // file to .env.local gets no key, which is exactly the failure being prevented.
  it("does not count a name that appears only inside a comment", () => {
    expect(parseEnvExample("# FAKE_COMMENTED=whatever\nFAKE_REAL=\n")).toEqual(["FAKE_REAL"]);
  });
});

describe("diffEnvManifest", () => {
  it("reports an undocumented variable with the file that reads it", () => {
    const result = diffEnvManifest({
      sources: [{ file: "lib/thing.ts", text: "process.env.FAKE_MISSING" }],
      exampleText: "",
    });
    expect(result.undocumented).toEqual([{ name: "FAKE_MISSING", files: ["lib/thing.ts"] }]);
  });

  it("passes when the read variable is documented", () => {
    const result = diffEnvManifest({
      sources: [{ file: "lib/thing.ts", text: "process.env.FAKE_OK" }],
      exampleText: "FAKE_OK=\n",
    });
    expect(result.undocumented).toEqual([]);
  });

  // Tests set vars to drive branches; requiring a reader to configure a test
  // harness in a fresh clone would document the wrong thing.
  it("skips test files, and still requires a var that non-test code also reads", () => {
    const result = diffEnvManifest({
      sources: [
        { file: "lib/__tests__/x.test.ts", text: "process.env.FAKE_TEST_ONLY = '1'" },
        { file: "lib/__tests__/y.test.ts", text: "process.env.FAKE_SHARED = '1'" },
        { file: "lib/y.ts", text: "process.env.FAKE_SHARED" },
      ],
      exampleText: "",
    });
    expect(result.undocumented.map((u: { name: string }) => u.name)).toEqual(["FAKE_SHARED"]);
  });

  it("reports a documented-but-unread variable without failing on it", () => {
    const result = diffEnvManifest({ sources: [], exampleText: "FAKE_PLATFORM_ONLY=\n" });
    expect(result.unread).toEqual(["FAKE_PLATFORM_ONLY"]);
    expect(result.undocumented).toEqual([]);
  });

  it("does not demand documentation for variables the OS supplies", () => {
    const result = diffEnvManifest({
      sources: [{ file: "scripts/x.mjs", text: "process.env.PATH; process.env.HOME; process.env.LANG;" }],
      exampleText: "",
    });
    expect(result.undocumented).toEqual([]);
  });

  // The exclusion must stay a closed list of OS-supplied names, not a drawer
  // for anything undocumented. A variable a HUMAN picks the value of belongs in
  // .env.example even if one script reads it — so growing this set is a change
  // that has to be argued for, not one that slips in with an unrelated commit.
  it("keeps the ambient set closed to OS-supplied names", () => {
    expect([...AMBIENT].sort()).toEqual(["HOME", "LANG", "PATH"]);
  });

  it("still requires documentation for an app variable read by only one script", () => {
    const result = diffEnvManifest({
      sources: [{ file: "scripts/x.mjs", text: "process.env.OFFLINE_PORT;" }],
      exampleText: "",
    });
    expect(result.undocumented.map((u: { name: string }) => u.name)).toEqual(["OFFLINE_PORT"]);
  });

  it("classifies both __tests__ paths and .test/.spec filenames as tests", () => {
    expect(isTestPath("lib/__tests__/a.ts")).toBe(true);
    expect(isTestPath("lib/a.test.ts")).toBe(true);
    expect(isTestPath("scripts/a.spec.mjs")).toBe(true);
    expect(isTestPath("lib/attestation.ts")).toBe(false);
  });
});

describe("the real repository", () => {
  const scannable = /\.(ts|tsx|mjs|cjs|js|jsx)$/;
  const sources = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && scannable.test(f))
    .map((file) => ({ file, text: readFileSync(path.join(repoRoot, file), "utf8") }));
  const exampleText = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

  it("documents every environment variable that non-test code reads", () => {
    const { undocumented } = diffEnvManifest({ sources, exampleText });
    const detail = undocumented
      .map((u: { name: string; files: string[] }) => `${u.name} (${u.files[0]})`)
      .join(", ");
    expect(detail).toBe("");
  });

  // Non-vacuity: if the scanner silently stopped matching, the test above would
  // pass against an empty example file and prove nothing.
  it("actually finds a substantial number of reads", () => {
    const { readCount } = diffEnvManifest({ sources, exampleText });
    expect(readCount).toBeGreaterThan(20);
  });

  // The defect this item was blocked on: `.gitignore`'s `.env*` swallowed the
  // example file, so a clean clone had no env documentation at all and the CLI
  // would have exited on ENOENT. Pinned so a future `.env*` tidy-up can't undo it.
  it("keeps .env.example tracked in git", () => {
    const tracked = execFileSync("git", ["ls-files", "--", ".env.example"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe(".env.example");
  });

  // Names, never values. A real secret pasted here would be committed by design.
  it("carries no filled-in secret values", () => {
    const filled = exampleText
      .split("\n")
      .filter((l) => /^[A-Z][A-Z0-9_]*=.+/.test(l))
      .map((l) => l.split("=")[0]);
    expect(filled).toEqual(["STORAGE_SOURCE"]); // the one legitimate default
  });

  it("documents the two variables a Supabase-backed clone cannot boot without", () => {
    const documented = parseEnvExample(exampleText);
    expect(documented).toContain("SUPABASE_URL");
    expect(documented).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
