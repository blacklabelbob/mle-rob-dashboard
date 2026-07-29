import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SEAM,
  SEAM_CANDIDATES,
  SEAM_PARTITIONS,
  SEAM_RULINGS,
  importSpecifiers,
  partitionGaps,
  resolveSpecifier,
  rulingBreaches,
  seamViolations,
  stripComments,
  surveyCandidate,
  type SeamFile,
} from "@/lib/coreSeam";

const REPO_ROOT = join(__dirname, "..", "..");

function collect(root: string): SeamFile[] {
  const out: SeamFile[] = [];
  const push = (rel: string) =>
    out.push({
      path: rel.replace(/\.(ts|tsx)$/, ""),
      source: readFileSync(join(REPO_ROOT, rel), "utf8"),
    });
  const walk = (relDir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, relDir))) {
      const rel = `${relDir}/${entry}`;
      // Tests inside a core root ship with it, but they legitimately reference
      // instance-shaped fixtures; the seam is about the module's own reach.
      if (entry === "__tests__" || entry.endsWith(".test.ts")) continue;
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry)) push(rel);
    }
  };
  // A root may be a directory (`lib/filters`) or a single module (`lib/csv`).
  if (existsSync(join(REPO_ROOT, root))) walk(root);
  else push(`${root}.ts`);
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

  // The second root, measured before it is promised. Pinned so the debt can
  // only shrink deliberately: a new instance import inside a candidate turns
  // this red, and a candidate reaching [] is the signal to move it into
  // SEAM.coreRoots.
  const PINNED: Record<string, { reaches: string[]; externals: string[] }> = {
    // inc.3: the language half alone. Whole-directory `lib/filters` pinned four
    // reaches and two packages; splitting at the adapter line leaves exactly two
    // modules of debt and no packages at all — that gap IS the argument for the
    // split, so it is asserted rather than described.
    // inc.4 paid half of it: `lib/entityProperties` was ruled core and promoted,
    // so it stopped being debt — this number went down because a decision was
    // made, which is the only way it is allowed to go down.
    "filters-lang": {
      reaches: ["lib/types"],
      externals: [],
    },
    "csv-import": {
      reaches: ["lib/notes", "lib/recordId", "lib/stats", "lib/types"],
      externals: [],
    },
  };

  it.each(SEAM_CANDIDATES.map((c) => [c.name, c] as const))(
    "candidate %s reaches exactly its pinned instance debt",
    (name, candidate) => {
      const survey = surveyCandidate(candidate, candidate.roots.flatMap(collect));
      expect(survey.fileCount).toBeGreaterThan(0);
      expect({ reaches: survey.reaches, externals: survey.externals }).toEqual(PINNED[name]);
      // An instance name in code is a different class of debt: it cannot be
      // paid by moving a file, so no candidate may acquire one.
      expect(survey.instanceLiterals).toEqual([]);
    },
  );

  // A partition is a claim about a whole directory, so it is only worth
  // anything while it stays exhaustive. The failure it exists to catch is
  // mundane and certain: someone adds `lib/filters/newThing.ts`, nobody
  // classifies it, and the split silently means less than it says.
  it.each(SEAM_PARTITIONS.map((p) => [p.dir, p] as const))(
    "partition %s claims every module on disk, exactly once",
    (_dir, partition) => {
      const onDisk = collect(partition.dir).map((f) => f.path);
      expect(partitionGaps(partition, onDisk)).toEqual([]);
      // The mirror failure: a path listed on either side that no longer exists
      // (renamed, deleted) makes the split read as covering more than it does.
      const claimed = [...partition.core, ...partition.instance];
      expect(claimed.filter((p) => !onDisk.includes(p))).toEqual([]);
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(partition.core.filter((p) => partition.instance.includes(p))).toEqual([]);
    },
  );

  // The partition is the *reason* for the candidate's shape. If they drift, the
  // surveyed debt stops describing the split this item actually argues for.
  it("surveys exactly the core half of the partition it came from", () => {
    const langs = SEAM_CANDIDATES.find((c) => c.name === "filters-lang");
    expect(langs?.roots).toEqual(SEAM_PARTITIONS[0].core);
  });

  // The rulings are the DoD's actual answer — "which modules are core" — so
  // they are the part most worth holding to the tree. A `core` ruling is
  // checked as a promise; an `instance` ruling is checked as a refusal that
  // must still be justified. Either can go stale without anyone touching this
  // file, which is exactly why the check reads the tree rather than the list.
  it.each(SEAM_RULINGS.map((r) => [r.module, r.verdict, r] as const))(
    "ruling %s = %s still holds against the tree",
    (module, _verdict, ruling) => {
      const files = collect(module);
      expect(files.length).toBeGreaterThan(0);
      expect(rulingBreaches(ruling, files)).toEqual([]);
    },
  );

  it("every ruling names a distinct module, and no module is both ruled and unruled", () => {
    const modules = SEAM_RULINGS.map((r) => r.module);
    expect(new Set(modules).size).toBe(modules.length);
    // A module ruled core must appear in coreRoots and vice-versa is NOT
    // required — a root can be sealed without a written ruling (lib/dedup was,
    // in inc.1). What must never happen is a root contradicting its own ruling.
    for (const r of SEAM_RULINGS)
      expect(SEAM.coreRoots.includes(r.module)).toBe(r.verdict === "core");
  });

  // Both directions of the ruling gate, driven red. Without these the rulings
  // are inc.3's defect again: a rule described in a doc comment and enforced
  // by nothing.
  it("fails a core ruling that is not a declared root, and one that leaks", () => {
    const notARoot = rulingBreaches(
      { module: "lib/labels", verdict: "core", reason: "claimed" },
      [{ path: "lib/labels", source: `export const x = 1;` }],
    );
    expect(notARoot).toHaveLength(1);
    expect(notARoot[0]).toContain("not in coreRoots");

    const leaks = rulingBreaches({ module: "lib/dedup", verdict: "core", reason: "claimed" }, [
      { path: "lib/dedup/run", source: `import { L } from "@/lib/labels";` },
    ]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toContain("lib/labels");
  });

  it("fails an instance ruling once the module stops being instance", () => {
    const clean = { module: "lib/types", verdict: "instance", reason: "claimed" } as const;
    // Cleaned up: no instance literal, no reach outside core. The ruling has
    // outlived its reason and must be re-decided, not inherited.
    expect(
      rulingBreaches(clean, [{ path: "lib/types", source: `export type Person = { id: string };` }]),
    ).toEqual([
      expect.stringContaining("no instance evidence"),
    ]);
    // An unlisted package is portable debt, not instance-ness — it must NOT
    // keep the ruling alive on its own.
    expect(
      rulingBreaches(clean, [{ path: "lib/types", source: `import z from "zod";` }]),
    ).toEqual([expect.stringContaining("no instance evidence")]);
    // A reach outside core is instance evidence, so this one holds.
    expect(
      rulingBreaches(clean, [
        { path: "lib/types", source: `type E = import("@/lib/equity").EquityFieldValue;` },
      ]),
    ).toEqual([]);
  });

  it("fails a ruling whose module no longer exists on disk", () => {
    expect(
      rulingBreaches({ module: "lib/gone", verdict: "core", reason: "claimed" }, []),
    ).toEqual([expect.stringContaining("no modules on disk")]);
  });

  it("reports an unclassified module as a gap", () => {
    expect(
      partitionGaps({ dir: "lib/x", core: ["lib/x/a"], instance: ["lib/x/b"] }, [
        "lib/x/a",
        "lib/x/b",
        "lib/x/c",
      ]),
    ).toEqual(["lib/x/c"]);
  });

  it("counts an import inside the candidate as free and one outside as debt", () => {
    const survey = surveyCandidate({ name: "lib/filters", roots: ["lib/filters"] }, [
      {
        path: "lib/filters/ast",
        source: `import { x } from "./parse";\nimport { y } from "@/lib/types";\nimport z from "react";`,
      },
    ]);
    expect(survey).toMatchObject({ reaches: ["lib/types"], externals: ["react"] });
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
