import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  auditDeclaredKeys,
  declarationLines,
  findStringConstants,
  isDeclared,
  resolveEmittedKey,
} from "../keyDeclaration";
import { scanTree, type EmissionSite, type TreeReader } from "../filerCensus";
import { LEDGER_FILERS, type Filer } from "../keyNamespace";

const repoRoot = join(__dirname, "..", "..", "..");

/** The same reader shape the reporter and the census assertion build — one walk policy. */
const fsReader: TreeReader = {
  list: (dir) =>
    readdirSync(join(repoRoot, dir), { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    })),
  read: (path) => readFileSync(join(repoRoot, path), "utf8"),
};

const site = (path: string, value: string, line = 1): EmissionSite => ({ path, line, value });
const filer = (keys: string[], source = "lib/a.ts"): Filer => ({ name: "a", source, keys });

describe("findStringConstants", () => {
  it("reads a plain declaration in any of the three quotes", () => {
    const found = findStringConstants(
      ['const A = "one";', "const B = 'two';", "const C = `three`;"].join("\n"),
    );
    expect(found.get("A")).toBe("one");
    expect(found.get("B")).toBe("two");
    expect(found.get("C")).toBe("three");
  });

  it("reads an exported declaration, which is how every live key constant is written", () => {
    expect(findStringConstants('export const KEY = "meeting-archive/crm-gap";').get("KEY")).toBe(
      "meeting-archive/crm-gap",
    );
  });

  it("refuses a template with a hole in it — that value is not fixed at read time", () => {
    expect(findStringConstants("const K = `prefix:${name}`;").has("K")).toBe(false);
  });

  it("refuses a name declared twice with different values rather than picking one", () => {
    const found = findStringConstants(['const K = "one";', 'const K = "two";'].join("\n"));
    expect(found.has("K")).toBe(false);
  });

  it("keeps a name declared twice with the SAME value — there is nothing ambiguous about it", () => {
    const found = findStringConstants(['const K = "one";', 'const K = "one";'].join("\n"));
    expect(found.get("K")).toBe("one");
  });

  it("ignores a non-string constant", () => {
    expect(findStringConstants("const N = 4;").has("N")).toBe(false);
  });
});

describe("resolveEmittedKey", () => {
  const constants = new Map([["KEY_CRM_GAP", "meeting-archive/crm-gap"]]);

  it("resolves a string literal, trailing comma and all", () => {
    expect(resolveEmittedKey('"meeting-intake-silence",', new Map())).toEqual({
      kind: "resolved",
      key: "meeting-intake-silence",
    });
  });

  it("resolves an identifier through the file's own constants", () => {
    expect(resolveEmittedKey("KEY_CRM_GAP,", constants)).toEqual({
      kind: "resolved",
      key: "meeting-archive/crm-gap",
    });
  });

  it("will not guess at an identifier it cannot see declared", () => {
    const out = resolveEmittedKey("key,", constants);
    expect(out.kind).toBe("unjudged");
    expect(out.kind === "unjudged" && out.reason).toContain("`key`");
  });

  it("will not guess at an interpolated template", () => {
    expect(resolveEmittedKey("`wrapper-census-departure:${name}`,", new Map()).kind).toBe("unjudged");
  });

  it("will not guess at a call or any other expression", () => {
    expect(resolveEmittedKey("departureKey(d.name),", new Map()).kind).toBe("unjudged");
    expect(resolveEmittedKey("a ?? b,", new Map()).kind).toBe("unjudged");
  });
});

describe("isDeclared", () => {
  it("matches a literal exactly", () => {
    expect(isDeclared("a/b", ["a/b"])).toBe(true);
    expect(isDeclared("a/b", ["a/c"])).toBe(false);
  });

  it("matches a key inside a declared pattern family", () => {
    expect(isDeclared("wrapper-census-departure:run.sh", ["wrapper-census-departure:*"])).toBe(true);
  });

  it("does not treat a longer key as covered by a shorter literal", () => {
    expect(isDeclared("a/b-rows", ["a/b"])).toBe(false);
  });
});

describe("auditDeclaredKeys", () => {
  const read = () => 'const KEY = "declared/one";';

  it("passes a filer that emits exactly what it declares", () => {
    const audit = auditDeclaredKeys(
      [filer(["declared/one"])],
      [site("lib/a.ts", "KEY,")],
      read,
    );
    expect(audit.declared).toBe(true);
    expect(audit.checked).toBe(1);
    expect(declarationLines(audit)).toEqual([]);
  });

  it("catches the second key a filer started emitting and never listed", () => {
    const audit = auditDeclaredKeys(
      [filer(["declared/one"])],
      [site("lib/a.ts", "KEY,", 10), site("lib/a.ts", '"declared/two",', 20)],
      read,
    );
    expect(audit.declared).toBe(false);
    expect(audit.undeclared).toEqual([
      { filer: "a", path: "lib/a.ts", line: 20, key: "declared/two" },
    ]);
    expect(declarationLines(audit)[0]).toContain("UNDECLARED KEY");
  });

  it("reports an unresolvable value instead of passing it", () => {
    const audit = auditDeclaredKeys([filer(["declared/one"])], [site("lib/a.ts", "key,", 7)], read);
    expect(audit.checked).toBe(0);
    expect(audit.declared).toBe(true);
    expect(audit.unjudged).toHaveLength(1);
    expect(declarationLines(audit)[0]).toContain("NOT KEY-CHECKED");
  });

  it("skips a file no filer claims — that is the census's finding, not this one", () => {
    const audit = auditDeclaredKeys([filer(["declared/one"])], [site("lib/stranger.ts", '"x",')], read);
    expect(audit.checked).toBe(0);
    expect(audit.unjudged).toEqual([]);
    expect(declarationLines(audit)).toEqual([]);
  });

  it("reads each file once however many keys it emits", () => {
    let reads = 0;
    auditDeclaredKeys(
      [filer(["declared/one"])],
      [site("lib/a.ts", "KEY,", 1), site("lib/a.ts", "KEY,", 2)],
      () => {
        reads++;
        return 'const KEY = "declared/one";';
      },
    );
    expect(reads).toBe(1);
  });
});

describe("the live tree", () => {
  const audit = () => auditDeclaredKeys(LEDGER_FILERS, scanTree(fsReader), fsReader.read);

  // The assertion this file exists for: it fails the day a registered filer emits a key its entry
  // does not list, while the person who added it is still looking at the diff.
  it("declares every key the registered filers actually emit", () => {
    const live = audit();
    expect(live.undeclared).toEqual([]);
    expect(live.declared).toBe(true);
  });

  // The measurement's own limit, pinned so it cannot quietly grow. Both of today's unjudged sites
  // are `dedupeKey: key` in wrapperClock.ts, where `key` comes from `departureKey(...)` — a family
  // the registry declares as a pattern and this resolver deliberately does not chase.
  it("cannot key-check exactly the two runtime-built departure keys, and no others", () => {
    expect(
      audit()
        .unjudged.map((u) => `${u.path} ${u.value}`)
        .sort(),
    ).toEqual(["lib/integrity/wrapperClock.ts key,", "lib/integrity/wrapperClock.ts key,"]);
  });
});
