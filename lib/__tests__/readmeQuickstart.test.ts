// Q71 Phase 5 — the README quickstart, held to the same standard as the code it
// describes.
//
// The README now carries the three-path quickstart that Q71's DoD is written
// against ("git clone && npm i && npm run dev:demo"). A quickstart is a promise
// made to someone who has nothing else to go on, and the way it fails is not by
// being wrong on day one — it is by staying still while a script is renamed or a
// directory moves. That failure is silent: the prose still reads fine.
//
// So the two things a newcomer literally types or clicks are checked here:
// every `npm run X` the README names must exist in package.json, and every path
// it points at must exist on disk.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

/** Every `npm run <script>` mentioned anywhere in the README. */
export function npmScriptsNamed(text: string): string[] {
  const found = [...text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)].map(
    (m) => m[1]
  );
  return [...new Set(found)].sort();
}

/** Every `[label](./path)` link target, minus anchors. */
export function relativeLinkTargets(text: string): string[] {
  const found = [...text.matchAll(/\]\(\.\/([^)#]+)(?:#[^)]*)?\)/g)].map(
    (m) => m[1]
  );
  return [...new Set(found)].sort();
}

/**
 * Paths named in the ``` Structure ``` block. The block is indented prose, so a
 * top-level entry (`app/`) sets the prefix for the indented entries under it
 * (`  people/` → `app/people`). Trailing-slash directories and bare files are
 * both returned without the slash.
 */
export function structurePaths(text: string): string[] {
  const block = text.match(/## Structure\s*```([\s\S]*?)```/);
  if (!block) return [];
  const out: string[] = [];
  let prefix = "";
  for (const raw of block[1].split("\n")) {
    if (!raw.trim()) continue;
    const indented = /^\s{2,}/.test(raw);
    // The first whitespace-delimited token is the path; the rest is commentary.
    const token = raw.trim().split(/\s+/)[0];
    if (!/^[A-Za-z0-9_.*[\]-]+[A-Za-z0-9_./*[\]-]*$/.test(token)) continue;
    const clean = token.replace(/\/$/, "");
    if (indented) {
      if (prefix) out.push(`${prefix}/${clean}`);
    } else {
      prefix = clean;
      out.push(clean);
    }
  }
  // Globs (data/*.local.json) describe gitignored runtime artifacts, which a
  // clean clone correctly does not have. Naming them is the point; asserting
  // they exist would be asserting the opposite of what the README says.
  return [...new Set(out.filter((p) => !p.includes("*")))].sort();
}

describe("README quickstart", () => {
  const scripts = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8")
  ).scripts as Record<string, string>;

  it("names the three paths Q71's DoD is written against", () => {
    const named = npmScriptsNamed(README);
    expect(named).toContain("dev:demo");
    expect(named).toContain("seed:local");
    expect(named).toContain("seed:synthetic");
  });

  it("only tells the reader to run scripts that exist", () => {
    const named = npmScriptsNamed(README);
    // Non-vacuity: a README that stopped naming commands would pass silently.
    expect(named.length).toBeGreaterThan(4);
    const missing = named.filter((s) => !(s in scripts));
    expect(missing, `npm scripts named in README but absent: ${missing}`).toEqual(
      []
    );
  });

  it("links only to files that exist", () => {
    const targets = relativeLinkTargets(README);
    expect(targets.length).toBeGreaterThan(2);
    const missing = targets.filter((t) => !existsSync(join(ROOT, t)));
    expect(missing, `README links to missing files: ${missing}`).toEqual([]);
  });

  it("describes a directory tree that is actually there", () => {
    const paths = structurePaths(README);
    expect(paths.length).toBeGreaterThan(20);
    const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `README Structure names missing paths: ${missing}`).toEqual(
      []
    );
  });

  it("still says the repo carries no real data", () => {
    // The one claim a reader acts on before reading any code.
    expect(README).toMatch(/guard:pii/);
    expect(README).toMatch(/__synthetic/);
  });
});

describe("README quickstart parsers", () => {
  it("reads npm scripts, links and nested structure paths", () => {
    expect(npmScriptsNamed("run `npm run a:b` then npm run c")).toEqual([
      "a:b",
      "c",
    ]);
    expect(relativeLinkTargets("[x](./docs/y.md) [z](./a.md#frag) [u](http://n)")).toEqual([
      "a.md",
      "docs/y.md",
    ]);
    const tree = "## Structure\n\n```\napp/\n  people/   ledger\nlib/\n  crm.ts  model\ndata/\n  *.local.json  overlay\n```";
    expect(structurePaths(tree)).toEqual([
      "app",
      "app/people",
      "data",
      "lib",
      "lib/crm.ts",
    ]);
  });
});
