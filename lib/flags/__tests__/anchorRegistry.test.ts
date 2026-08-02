import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ANCHORS,
  declaredAnchorSites,
  unregisteredAnchorNotice,
  unregisteredAnchors,
  type RegisteredAnchor,
} from "../anchorRegistry";
import { missingAnchorNotice } from "../anchorPin";
import { SOURCE_FILE, scannedByWalk, type SourceFile } from "../scanPerimeter";

// Q84 inc.117 — the central pin. Fixtures prove the declaration scan; the walk is what makes a
// sixteenth guard added tomorrow turn this file red instead of shipping with nothing watching it.

const rel = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
      walk(full, acc);
    } else if (SOURCE_FILE.test(entry.name)) {
      acc.push(rel(full));
    }
  }
  return acc;
}

const TREE: SourceFile[] = walk(process.cwd(), [])
  .filter(scannedByWalk)
  .map((p) => ({ path: p, text: readFileSync(path.join(process.cwd(), p), "utf8") }));

describe("declaredAnchorSites", () => {
  it("finds an exported anchor declaration and names it path#EXPORT", () => {
    const files = [{ path: "lib/flags/a.ts", text: `export const A_ANCHOR: Anchor = { kind: "path", name: "x" };` }];
    expect(declaredAnchorSites(files)).toEqual(["lib/flags/a.ts#A_ANCHOR"]);
  });

  it("finds every anchor a module declares, not just the first", () => {
    const two = [
      {
        path: "lib/flags/a.ts",
        text: `export const A_ANCHOR: Anchor = { kind: "path", name: "x" };\nexport const B_ANCHOR: Anchor = { kind: "declaration", name: "y" };`,
      },
    ];
    expect(declaredAnchorSites(two)).toEqual(["lib/flags/a.ts#A_ANCHOR", "lib/flags/a.ts#B_ANCHOR"]);
  });

  it("does not count prose that quotes the shape mid-sentence — inc.116's live trap", () => {
    const prose = [
      { path: "lib/flags/doc.ts", text: `// it looks like \`export const READER_ANCHOR: Anchor = {…}\` on the line.` },
      { path: "lib/flags/doc2.ts", text: `const s = "export const X_ANCHOR: Anchor = 1";` },
    ];
    expect(declaredAnchorSites(prose)).toEqual([]);
  });

  it("does not count a module-private anchor — nobody outside can be drifting from it", () => {
    expect(declaredAnchorSites([{ path: "a.ts", text: `const LOCAL_ANCHOR: Anchor = { kind: "path", name: "x" };` }])).toEqual(
      [],
    );
  });

  it("does not count a same-named export of another type", () => {
    expect(
      declaredAnchorSites([{ path: "a.ts", text: `export const A_ANCHOR: AnchorList = [];\nexport const B: string = "Anchor";` }]),
    ).toEqual([]);
  });
});

describe("unregisteredAnchors", () => {
  const REGISTRY: readonly RegisteredAnchor[] = [
    { site: "lib/flags/a.ts#A_ANCHOR", guard: "the a gate", anchor: { kind: "path", name: "x" } },
  ];

  it("is silent when every declared anchor is registered", () => {
    const files = [{ path: "lib/flags/a.ts", text: `export const A_ANCHOR: Anchor = { kind: "path", name: "x" };` }];
    expect(unregisteredAnchors(files, REGISTRY)).toEqual([]);
    expect(unregisteredAnchorNotice([])).toBeNull();
  });

  it("names a door that declares an anchor nothing pins", () => {
    const files = [
      { path: "lib/flags/a.ts", text: `export const A_ANCHOR: Anchor = { kind: "path", name: "x" };` },
      { path: "lib/flags/b.ts", text: `export const B_ANCHOR: Anchor = { kind: "declaration", name: "y" };` },
    ];
    expect(unregisteredAnchors(files, REGISTRY)).toEqual(["lib/flags/b.ts#B_ANCHOR"]);
  });

  it("says what is NOT wrong first — the pin is missing, the door is fine", () => {
    const said = unregisteredAnchorNotice(["lib/flags/b.ts#B_ANCHOR"])!;
    expect(said.startsWith("Nothing below is wrong")).toBe(true);
    expect(said).toContain("lib/flags/b.ts#B_ANCHOR");
    expect(said).toContain("goes silent");
    expect(said).toContain("anchorRegistry.ts");
  });
});

describe("this repo", () => {
  // inc.106's lesson, applied to the registry: an empty registry satisfies every pin below it.
  it("registers at least the two doors that have anchors", () => {
    expect(ANCHORS.length).toBeGreaterThanOrEqual(2);
    expect(TREE.length).toBeGreaterThan(100);
  });

  it("still has every anchor it registers — the pin, once, for all doors", () => {
    for (const { anchor, guard } of ANCHORS) {
      expect(missingAnchorNotice(anchor, guard, TREE)).toBeNull();
    }
  });

  it("declares no anchor the registry does not pin", () => {
    expect(unregisteredAnchorNotice(unregisteredAnchors(TREE)) ?? "clean").toBe("clean");
  });

  it("finds each registered anchor's own declaration on the tree", () => {
    const declared = declaredAnchorSites(TREE);
    for (const { site } of ANCHORS) expect(declared).toContain(site);
  });

  // Found by this increment, not designed for: a raw NUL byte in readerGate.ts made grep and rg
  // call a 626-line production module "binary" and report NO MATCH for names that are in it. Every
  // scan in this family reads utf8 and was unaffected, but a guard nobody can grep is a guard the
  // next reader concludes does not exist.
  it("hides no walked source from text tooling", () => {
    expect(TREE.filter((f) => f.text.includes("\u0000")).map((f) => f.path)).toEqual([]);
  });
});
