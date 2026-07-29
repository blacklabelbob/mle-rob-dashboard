import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SEAM,
  importSpecifiers,
  resolveSpecifier,
  seamViolations,
  stripComments,
  type SeamFile,
} from "@/lib/coreSeam";

const REPO_ROOT = join(__dirname, "..", "..");

function collect(root: string): SeamFile[] {
  const out: SeamFile[] = [];
  const walk = (relDir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, relDir))) {
      const rel = `${relDir}/${entry}`;
      // Tests inside a core root ship with it, but they legitimately reference
      // instance-shaped fixtures; the seam is about the module's own reach.
      if (entry === "__tests__" || entry.endsWith(".test.ts")) continue;
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry))
        out.push({ path: rel.replace(/\.(ts|tsx)$/, ""), source: readFileSync(join(REPO_ROOT, rel), "utf8") });
    }
  };
  walk(root);
  return out;
}

describe("core-vs-instance seam (Q74)", () => {
  it("every declared core root is non-empty on disk", () => {
    for (const root of SEAM.coreRoots) expect(collect(root).length).toBeGreaterThan(0);
  });

  it("no core module reaches instance config — the real check, run against the real tree", () => {
    const files = SEAM.coreRoots.flatMap(collect);
    expect(seamViolations(files)).toEqual([]);
  });

  // A gate that cannot go red is decoration. These prove it goes red.
  it("fails when a core module imports an instance module", () => {
    const v = seamViolations([
      { path: "lib/dedup/merge", source: `import { TYPE_LABELS } from "@/lib/labels";` },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("instance-import");
    expect(v[0].detail).toContain("lib/labels");
  });

  it("fails on a relative escape out of the core root", () => {
    const v = seamViolations([{ path: "lib/dedup/run", source: `import x from "../types";` }]);
    expect(v[0]).toMatchObject({ kind: "instance-import" });
    expect(v[0].detail).toContain("lib/types");
  });

  it("fails on an unlisted package dependency", () => {
    const v = seamViolations([{ path: "lib/dedup/run", source: `import ky from "some-http-lib";` }]);
    expect(v[0]).toMatchObject({ kind: "unlisted-external" });
  });

  it("allows listed externals and intra-core imports", () => {
    expect(
      seamViolations([
        {
          path: "lib/dedup/detector",
          source: `import { timingSafeEqual } from "node:crypto";\nimport { collectDedupRows } from "@/lib/dedup/run";`,
        },
      ]),
    ).toEqual([]);
  });

  it("fails on an instance literal baked into code, but not one merely mentioned in a comment", () => {
    expect(
      seamViolations([{ path: "lib/dedup/run", source: `const owner = "MyLocalEverything";` }])[0],
    ).toMatchObject({ kind: "instance-literal" });
    expect(
      seamViolations([{ path: "lib/dedup/run", source: `// MLE's own ledger lives elsewhere\nexport const x = 1;` }]),
    ).toEqual([]);
  });

  it("collects dynamic imports and re-exports, not just static ones", () => {
    const specs = importSpecifiers(
      `export { a } from "./a";\nconst m = await import("@/lib/labels");\nconst r = require("node:fs");`,
    );
    expect(specs).toEqual(["./a", "@/lib/labels", "node:fs"]);
  });

  it("resolves specifiers to repo-relative module paths", () => {
    expect(resolveSpecifier("@/lib/dedup/run", "lib/dedup/merge")).toBe("lib/dedup/run");
    expect(resolveSpecifier("./run", "lib/dedup/merge")).toBe("lib/dedup/run");
    expect(resolveSpecifier("../types", "lib/dedup/merge")).toBe("lib/types");
    expect(resolveSpecifier("react", "lib/dedup/merge")).toBeNull();
  });

  it("strips block and line comments without eating protocol slashes", () => {
    expect(stripComments(`/* MLE */ const u = "https://x.dev"; // MLE`).trim()).toBe(
      `const u = "https://x.dev";`,
    );
  });
});
