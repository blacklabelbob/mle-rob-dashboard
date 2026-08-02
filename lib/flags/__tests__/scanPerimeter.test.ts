import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  descendableDir,
  EXCLUDED_DIRS,
  SCANNED_ROOTS,
  SOURCE_FILE,
  scannedByWalk,
  unpopulatedRootNotice,
  unpopulatedRoots,
} from "../scanPerimeter";

// Q84 inc.119 — the perimeter's OWN test, and it is central on purpose.
//
// Both doors already pin what the walk hands them. Nothing pinned the perimeter's other claim: the
// directory names it is built out of. Putting that assertion in one door's test would make the
// other door depend on which file someone happened to open — and inc.117 deleted two per-door
// copies of exactly that shape. The perimeter owns this question, so it is asked here once.
//
// This walk collects PATHS only — no `readFileSync`. The question is which directories yield
// anything, and reading 674 files to answer it would be ceremony.

const rel = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!descendableDir(entry.name)) continue;
      walk(full, acc);
    } else if (SOURCE_FILE.test(entry.name)) {
      acc.push(rel(full));
    }
  }
  return acc;
}

const ALL_SOURCE: string[] = walk(process.cwd(), []);

describe("the directories a walk descends", () => {
  it("skips what is excluded by design and descends everything else", () => {
    for (const excluded of EXCLUDED_DIRS) expect(descendableDir(excluded)).toBe(false);
    expect(descendableDir(".next")).toBe(false);
    expect(descendableDir(".git")).toBe(false);
    for (const root of SCANNED_ROOTS) expect(descendableDir(root)).toBe(true);
    expect(descendableDir("src")).toBe(true);
  });

  // The direction that matters: widening the module's perimeter must widen the WALKS with it. When
  // each walk carried its own copy of these names, dropping one here left both walks skipping the
  // directory anyway — the guard would claim coverage nothing ever handed it, and nothing would say
  // so. Asserting only over `EXCLUDED_DIRS` would not catch that: a name deleted from the list
  // leaves the loop, so the loop stops asking about the one name that just changed. The invariant is
  // stated over a FIXED probe set instead — for any directory, "does the walk descend it" and "does
  // the filter cover what is under it" must be the same answer.
  it.each([
    "node_modules",
    "__tests__",
    ".next",
    ".git",
    "src",
    "generated",
    "components",
    "hooks",
  ])("gives the walk and the path filter the same answer about %s", (name) => {
    expect(descendableDir(name)).toBe(scannedByWalk(`lib/${name}/x.ts`));
  });
});

describe("a root that names nothing", () => {
  it("is reported, because no rule below it can ever fail", () => {
    expect(unpopulatedRoots(["app/page.tsx", "lib/x.ts"])).toEqual(["components", "scripts"]);
  });

  it("counts only files the walk would actually hand a guard", () => {
    // A README under `scripts/` is not a source file, so the root is still dead to every rule.
    const paths = ["app/a.ts", "components/b.tsx", "lib/c.ts", "scripts/README.md"];
    expect(unpopulatedRoots(paths)).toEqual(["scripts"]);
  });

  it("is silent when every root holds something", () => {
    const paths = ["app/a.ts", "components/b.tsx", "lib/c.ts", "scripts/d.mjs"];
    expect(unpopulatedRoots(paths)).toEqual([]);
    expect(unpopulatedRootNotice([], "readerGate")).toBeNull();
  });

  // The notice deliberately does NOT borrow the coverage notices' opening promise. A reader who
  // learns the two sentences mean the same thing will treat a stale claim as a harmless one.
  it("names the guard, the fix, and the wrong fix", () => {
    const said = unpopulatedRootNotice(["scripts"], "readerGate") ?? "";
    expect(said).not.toContain("Nothing below is wrong");
    expect(said).toContain("scripts");
    expect(said).toContain("readerGate");
    expect(said).toContain("Remove the dead entry");
    expect(said).toContain("do not");
  });

  it("pluralises without reading like a template", () => {
    const one = unpopulatedRootNotice(["scripts"], "g") ?? "";
    const two = unpopulatedRootNotice(["components", "scripts"], "g") ?? "";
    expect(one).toContain("1 directory");
    expect(two).toContain("2 directories");
  });
});

describe("this repo, right now", () => {
  it("actually walked something — an empty listing makes every root look dead", () => {
    expect(ALL_SOURCE.length).toBeGreaterThan(100);
    expect(ALL_SOURCE).toContain("proxy.ts");
  });

  // Asserted THROUGH the notice, the shape both doors already use for their real-tree pin. A bare
  // `toEqual([])` prints the dead root and nothing else; whoever trips this is mid-rename and the
  // one thing they need is the sentence saying to delete the entry rather than mkdir to satisfy it.
  it("has no phantom root — every directory the perimeter claims holds source the walk sees", () => {
    expect(unpopulatedRootNotice(unpopulatedRoots(ALL_SOURCE), "scanPerimeter")).toBeNull();
  });
});
