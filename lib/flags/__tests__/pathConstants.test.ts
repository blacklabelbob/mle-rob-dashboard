import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  pathConstants,
  unanchoredPathConstantNotice,
  unanchoredPathConstants,
} from "../pathConstants";
import { ANCHORS, type RegisteredAnchor } from "../anchorRegistry";
import { SOURCE_FILE, scannedByWalk, type SourceFile } from "../scanPerimeter";

// Q84 inc.118 — fixtures prove the shape; the walk is what makes tomorrow's guard, whose rule
// hangs off a bare path string nobody thought to anchor, turn this file red instead of shipping.

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

const file = (text: string, p = "lib/flags/a.ts"): SourceFile[] => [{ path: p, text }];

describe("pathConstants", () => {
  it("finds an exported string constant whose value is a repo path", () => {
    expect(pathConstants(file(`export const RULE = "lib/flags/readerGate.ts";`))).toEqual([
      { site: "lib/flags/a.ts#RULE", value: "lib/flags/readerGate.ts" },
    ]);
  });

  it("reads single quotes too — the family writes both", () => {
    expect(pathConstants(file(`export const RULE = 'app/api/x/route.ts';`))[0].value).toBe("app/api/x/route.ts");
  });

  it("ignores a constant quoted mid-sentence in prose — inc.116's trap, one level over", () => {
    const prose = ` * The door excludes itself: export const RULE_FILE = "lib/flags/readerGate.ts" is the path.`;
    expect(pathConstants(file(prose))).toEqual([]);
  });

  it("ignores a string that is not shaped like a path", () => {
    const notPaths = `export const KIND = "host-confirm";\nexport const GUARD = "the payload-read gate";`;
    expect(pathConstants(file(notPaths))).toEqual([]);
  });

  it("ignores a bare filename with no directory — it is not a claim about where a file lives", () => {
    expect(pathConstants(file(`export const F = "readerGate.ts";`))).toEqual([]);
  });

  it("returns every path constant a module declares, sorted by site", () => {
    const two = `export const B = "lib/b.ts";\nexport const A = "lib/a.ts";`;
    expect(pathConstants(file(two)).map((c) => c.site)).toEqual(["lib/flags/a.ts#A", "lib/flags/a.ts#B"]);
  });
});

describe("unanchoredPathConstants", () => {
  const pinned: RegisteredAnchor[] = [
    { site: "lib/flags/a.ts#A_ANCHOR", guard: "a door", anchor: { kind: "path", name: "lib/flags/readerGate.ts" } },
  ];

  it("says nothing about a path some registered anchor already pins", () => {
    const src = file(`export const RULE = "lib/flags/readerGate.ts";`);
    expect(unanchoredPathConstants(src, pinned)).toEqual([]);
  });

  it("reports a walked path no anchor pins", () => {
    const src = file(`export const OTHER = "lib/flags/payloadWriters.ts";`);
    expect(unanchoredPathConstants(src, pinned)).toEqual([
      { site: "lib/flags/a.ts#OTHER", value: "lib/flags/payloadWriters.ts" },
    ]);
  });

  it("does NOT report a path outside the perimeter — an anchor there would be permanently red", () => {
    const src = file(`export const CONTRACT = "docs/partners/PARTNER-WEBHOOK-CONTRACT.md";`);
    expect(unanchoredPathConstants(src, pinned)).toEqual([]);
  });

  it("matches on the anchor's VALUE, so two doors naming one file is one pin", () => {
    const src = [
      { path: "lib/flags/a.ts", text: `export const RULE = "lib/flags/readerGate.ts";` },
      { path: "lib/flags/b.ts", text: `export const SAME = "lib/flags/readerGate.ts";` },
    ];
    expect(unanchoredPathConstants(src, pinned)).toEqual([]);
  });

  it("ignores a DECLARATION anchor of the same spelling — it proves a name exists, not a file", () => {
    const declaration: RegisteredAnchor[] = [
      { site: "lib/flags/a.ts#D", guard: "a door", anchor: { kind: "declaration", name: "lib/flags/readerGate.ts" } },
    ];
    const src = file(`export const RULE = "lib/flags/readerGate.ts";`);
    expect(unanchoredPathConstants(src, declaration)).toHaveLength(1);
  });
});

describe("unanchoredPathConstantNotice", () => {
  it("is null when every walked path constant is pinned", () => {
    expect(unanchoredPathConstantNotice([])).toBeNull();
  });

  it("leads with what is NOT wrong, so nobody edits a path that is currently right", () => {
    const notice = unanchoredPathConstantNotice([{ site: "lib/flags/a.ts#RULE", value: "lib/a.ts" }]);
    expect(notice).toContain("Nothing below is wrong, it is unwatched");
    expect(notice).toContain("lib/flags/a.ts#RULE → lib/a.ts");
    expect(notice).toContain("goes quiet");
    expect(notice).toContain("lib/flags/anchorRegistry.ts");
  });
});

describe("the real tree", () => {
  it("declares the path constants this family hangs rules off", () => {
    const sites = pathConstants(TREE).map((c) => c.site);
    expect(sites).toContain("lib/flags/readerGate.ts#RULE_FILE");
    expect(sites).toContain("lib/flags/payloadWriters.ts#SCOPED_PAYLOAD_WRITER");
  });

  it("pins every walked path constant on this tree", () => {
    const loose = unanchoredPathConstants(TREE, ANCHORS);
    expect(unanchoredPathConstantNotice(loose) ?? "clean").toBe("clean");
  });

  it("leaves the out-of-perimeter contract path alone rather than demanding a red anchor", () => {
    const contract = pathConstants(TREE).find((c) => c.site === "lib/partnerHooks.ts#PARTNER_CONTRACT");
    expect(contract?.value).toBe("docs/partners/PARTNER-WEBHOOK-CONTRACT.md");
    expect(unanchoredPathConstants(TREE, ANCHORS).map((c) => c.site)).not.toContain(
      "lib/partnerHooks.ts#PARTNER_CONTRACT",
    );
  });
});
