import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ABSTENTION,
  READER,
  ROW_ARG_COUNT,
  RULE_FILE,
  READER_GATE_GUARD,
  SCANNED_ROOTS,
  SOURCE_FILE,
  scannedByWalk,
  unscannedNotice,
  unscannedSources,
  abstainedReaderCallers,
  abstentionNotice,
  mismatchedRowCallers,
  mismatchedRowRefusal,
  readerCallers,
  ungatedReaderCallers,
  ungatedReaderRefusal,
  type SourceFile,
} from "../readerGate";

// Q84 inc.107 — tested on strings AND driven off the real tree (the 0021/0034/inc.51 precedent,
// same as inc.106's payloadWriters). Fixtures prove the scan; the walk is what makes the next
// production caller that forgets the row turn this file red instead of shipping.

const LIVE_CALLER = "components/ThingsToAddress.tsx";

const rel = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

// Q84 inc.114 — the walk collects EVERY source path in the repo and asks the guard which of them
// it covers. The roots and the extension filter used to be two literals here; they are now the
// module's own `scannedByWalk`, so the boundary cannot be widened in one place and not the other.
function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Tests call the reader two-arg BY DESIGN — that is the point of the module doc: a test
    // may state the reader's core rule without also stating a scope. Production may not.
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
      walk(full, acc);
    } else if (SOURCE_FILE.test(entry.name)) {
      acc.push(rel(full));
    }
  }
  return acc;
}

const ALL_SOURCE: string[] = walk(process.cwd(), []);
const TREE: SourceFile[] = ALL_SOURCE.filter(scannedByWalk).map((p) => ({
  path: p,
  text: readFileSync(path.join(process.cwd(), p), "utf8"),
}));

const GATED = `const c = ${READER}(f.payload, page, written, { title: f.title, detail: f.detail, entityId: f.entity_id });`;
const UNGATED = `const c = ${READER}(f.payload, page);`;

describe("who may read a payload without its row", () => {
  it("names the caller that omits the row and leaves the gated one alone", () => {
    expect(
      ungatedReaderCallers([
        { path: "components/Gated.tsx", text: GATED },
        { path: "components/Ungated.tsx", text: UNGATED },
      ]),
    ).toEqual(["components/Ungated.tsx"]);
  });

  it("reads a call that spans lines and carries a ternary — the shape the live caller has", () => {
    const live = `const controls = ${READER}(
      f.payload,
      mode === "entity" ? (person ?? entity ?? null) : null,
      written,
      { title: f.title, detail: f.detail, entityId: f.entity_id },
    );`;
    expect(ungatedReaderCallers([{ path: "a.tsx", text: live }])).toEqual([]);
    expect(readerCallers([{ path: "a.tsx", text: live }])).toEqual(["a.tsx"]);
  });

  it("counts a literal undefined in the row's place as omitting it — same reader, longer spelling", () => {
    expect(
      ungatedReaderCallers([{ path: "a.tsx", text: `${READER}(p, page, written, undefined)` }]),
    ).toEqual(["a.tsx"]);
  });

  it("does not mistake the declaration for a call", () => {
    const decl = `export function ${READER}(payload: unknown, pageId: string | null): X[] {}`;
    expect(readerCallers([{ path: "lib/flags/hostConfirmView.ts", text: decl }])).toEqual([]);
    expect(ungatedReaderCallers([{ path: "lib/flags/hostConfirmView.ts", text: decl }])).toEqual([]);
  });

  it("does not read a paren inside a string as structure", () => {
    expect(
      ungatedReaderCallers([{ path: "a.tsx", text: `${READER}(p, ")", w, { title: "a(b" })` }]),
    ).toEqual([]);
  });

  it("excludes only its own source, and only because it quotes the call it forbids", () => {
    expect(ungatedReaderCallers([{ path: RULE_FILE, text: UNGATED }])).toEqual([]);
    expect(readerCallers([{ path: RULE_FILE, text: GATED }])).toEqual([]);
    // Every other file is judged on the same string — the exclusion is a path, not a loophole.
    expect(ungatedReaderCallers([{ path: "lib/flags/readerGateOops.ts", text: UNGATED }])).toEqual([
      "lib/flags/readerGateOops.ts",
    ]);
  });

  it("the refusal says what the omission costs, since the compiler will not", () => {
    expect(ungatedReaderRefusal([])).toBeNull();
    const said = ungatedReaderRefusal(["components/Ungated.tsx"])!;
    expect(said).toContain("components/Ungated.tsx");
    expect(said).toContain("Set Domain to");
    expect(said).toContain("fourth argument");
  });
});

// Q84 inc.108 — the count says a row is PRESENT; only this says it is THIS row.
describe("a gated call whose row came from somewhere else", () => {
  const MISMATCHED = `${READER}(f.payload, page, written, { title: other.title, detail: other.detail });`;

  it("is invisible to the argument count — every argument is there and well-formed", () => {
    expect(ungatedReaderCallers([{ path: "a.tsx", text: MISMATCHED }])).toEqual([]);
    expect(mismatchedRowCallers([{ path: "a.tsx", text: MISMATCHED }])).toEqual(["a.tsx"]);
  });

  it("passes the two live spellings, which read the payload and the row off the same object", () => {
    expect(mismatchedRowCallers([{ path: "a.tsx", text: GATED }])).toEqual([]);
    // The digest call: multi-line, `null` for the page, the row's three fields off `f`.
    const digest = `${READER}(f.payload, null, [], {\n  title: f.title,\n  detail: f.detail,\n  entityId: f.entity_id,\n})`;
    expect(mismatchedRowCallers([{ path: "a.tsx", text: digest }])).toEqual([]);
  });

  it("abstains when the payload is not read off an object — no root, no opinion", () => {
    expect(mismatchedRowCallers([{ path: "a.tsx", text: `${READER}(payload, page, [], row)` }])).toEqual([]);
  });

  it("leaves the ungated and the omitted row to the guard that already names them", () => {
    expect(mismatchedRowCallers([{ path: "a.tsx", text: UNGATED }])).toEqual([]);
    expect(
      mismatchedRowCallers([{ path: "a.tsx", text: `${READER}(f.payload, page, [], undefined)` }]),
    ).toEqual([]);
  });

  it("does not mistake a property named like the root for the root itself", () => {
    expect(
      mismatchedRowCallers([{ path: "a.tsx", text: `${READER}(f.payload, page, [], { title: row.f })` }]),
    ).toEqual(["a.tsx"]);
    expect(
      mismatchedRowCallers([{ path: "a.tsx", text: `${READER}(f.payload, page, [], { title: fx.title })` }]),
    ).toEqual(["a.tsx"]);
  });

  it("excludes its own source for the same reason the other guard does", () => {
    expect(mismatchedRowCallers([{ path: RULE_FILE, text: MISMATCHED }])).toEqual([]);
  });

  // Q84 inc.109 — the hoisted row. inc.108 handed this over as an abstention; it was a NAG.
  describe("a row passed by name", () => {
    const call = `${READER}(f.payload, page, written, row);`;

    it("is followed to its declaration and left alone when it is the same row", () => {
      const hoisted = `const row = { title: f.title, detail: f.detail, entityId: f.entity_id };\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: hoisted }])).toEqual([]);
    });

    it("still offends when the hoisted row was built off another object — the catch survives", () => {
      const wrong = `const row = { title: other.title, detail: other.detail };\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: wrong }])).toEqual(["a.tsx"]);
    });

    it("reads a type annotation on the declaration without losing the initializer", () => {
      const typed = `const row: RowScope = { title: f.title, detail: f.detail };\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: typed }])).toEqual([]);
    });

    it("abstains when the row is declared nowhere in the file — imported, a param, destructured", () => {
      expect(mismatchedRowCallers([{ path: "a.tsx", text: call }])).toEqual([]);
      const destructured = `const { row } = props;\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: destructured }])).toEqual([]);
    });

    it("abstains when the name is declared twice — which one reached the call is not knowable here", () => {
      const twice = `const row = { title: other.title };\nfunction g() { const row = { title: f.title }; }\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: twice }])).toEqual([]);
    });

    // Q84 inc.110 — a declaration is not a value. Probed first: the middle case below was
    // ACCUSED, i.e. a false positive on a correct caller, not the silent miss inc.109 handed over.
    describe("and written to after it is declared", () => {
      it("abstains when the mutation is the one that makes the row correct — the false positive", () => {
        const fixed = `const row = { title: other.title };\nrow.title = f.title;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: fixed }])).toEqual([]);
      });

      it("abstains when the mutation is the one that makes it wrong — silence is the safe miss", () => {
        const broken = `const row = { title: f.title };\nrow.title = other.title;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: broken }])).toEqual([]);
      });

      it("abstains on wholesale reassignment and on Object.assign — same ignorance", () => {
        const reassigned = `let row = { title: other.title };\nrow = f;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: reassigned }])).toEqual([]);
        const assigned = `const row = { title: other.title };\nObject.assign(row, f);\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: assigned }])).toEqual([]);
        const compound = `const row = { title: other.title };\nrow.detail += f.detail;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: compound }])).toEqual([]);
      });

      it("does not read a comparison or an arrow as a write — the catch survives", () => {
        const compared = `const row = { title: other.title };\nif (row.title === f.title) log(row);\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: compared }])).toEqual(["a.tsx"]);
        const passed = `const row = { title: other.title };\nconst pick = () => row;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: passed }])).toEqual(["a.tsx"]);
      });

      it("does not read a write to a different binding that merely ends in the name", () => {
        const near = `const row = { title: other.title };\nmyRow.title = f.title;\n${call}`;
        expect(mismatchedRowCallers([{ path: "a.tsx", text: near }])).toEqual(["a.tsx"]);
      });
    });

    it("does not resolve a declaration that merely ends in the name", () => {
      // `myRow` is a different binding; matching it would grade the call on someone else's object.
      const other = `const myRow = { title: other.title };\n${call}`;
      expect(mismatchedRowCallers([{ path: "a.tsx", text: other }])).toEqual([]);
    });
  });

  it("the refusal names the confusion, not the syntax", () => {
    expect(mismatchedRowRefusal([])).toBeNull();
    const said = mismatchedRowRefusal(["components/Wrong.tsx"])!;
    expect(said).toContain("components/Wrong.tsx");
    expect(said).toContain("DIFFERENT finding's reach");
  });
});

// Q84 inc.111 — the four ignorances all return the same silent null, so green means either
// "every gated call grades its own finding" or "nothing could be read". This tells them apart.
describe("the calls the guard declined to grade", () => {
  const call = `${READER}(f.payload, page, written, row);`;

  it("says nothing about a call it fully read — an abstention is not the default", () => {
    expect(abstainedReaderCallers([{ path: "a.tsx", text: GATED }])).toEqual([]);
    const hoisted = `const row = { title: f.title, detail: f.detail };\n${call}`;
    expect(abstainedReaderCallers([{ path: "a.tsx", text: hoisted }])).toEqual([]);
  });

  it("says nothing about a call it graded as WRONG — silence is the only thing surfaced", () => {
    const wrong = `${READER}(f.payload, page, written, { title: other.title });`;
    expect(mismatchedRowCallers([{ path: "a.tsx", text: wrong }])).toEqual(["a.tsx"]);
    expect(abstainedReaderCallers([{ path: "a.tsx", text: wrong }])).toEqual([]);
  });

  it("names each of the four ignorances, so a gap is actionable rather than mysterious", () => {
    const cases: Array<[string, string]> = [
      [call, ABSTENTION.notDeclared],
      [`const row = { title: f.title };\nfunction g() { const row = { title: other.title }; }\n${call}`, ABSTENTION.declaredTwice],
      [`const row = { title: other.title };\nrow.title = f.title;\n${call}`, ABSTENTION.writtenTo],
      [`${READER}(payload, page, written, row);`, ABSTENTION.noRoot],
    ];
    for (const [text, reason] of cases) {
      expect(abstainedReaderCallers([{ path: "a.tsx", text }])).toEqual([{ path: "a.tsx", reason }]);
      // Every one of them is silent at the rule itself — that is the whole point of surfacing it.
      expect(mismatchedRowCallers([{ path: "a.tsx", text }])).toEqual([]);
    }
  });

  it("leaves the ungated call and the literal undefined to the guard that is already loud", () => {
    expect(abstainedReaderCallers([{ path: "a.tsx", text: UNGATED }])).toEqual([]);
    expect(
      abstainedReaderCallers([{ path: "a.tsx", text: `${READER}(f.payload, page, [], undefined)` }]),
    ).toEqual([]);
  });

  it("reports one file once per reason, however many times the spelling repeats", () => {
    expect(abstainedReaderCallers([{ path: "a.tsx", text: `${call}\n${call}` }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.notDeclared },
    ]);
  });

  it("excludes its own source for the same reason every other rule here does", () => {
    expect(abstainedReaderCallers([{ path: RULE_FILE, text: call }])).toEqual([]);
  });

  it("the notice leads with 'nothing is wrong', because a reader who misreads it edits correct code", () => {
    expect(abstentionNotice([])).toBeNull();
    const said = abstentionNotice([{ path: "components/X.tsx", reason: ABSTENTION.notDeclared }])!;
    expect(said.startsWith("Nothing below is wrong")).toBe(true);
    expect(said).toContain("components/X.tsx");
    expect(said).toContain(ABSTENTION.notDeclared);
    expect(said).toContain("UNGRADED");
  });
});

// Q84 inc.112 — every rule here is built on the list of calls, and the list matched one spelling
// of the name. A file that renames the reader was invisible at every door, including inc.111's.
describe("the reader reached through another name", () => {
  it("counts a call through an import alias, gated and ungated alike", () => {
    const imported = `import { ${READER} as read } from "@/lib/flags/hostConfirmView";`;
    const ungated = { path: "components/Aliased.tsx", text: `${imported}\nconst c = read(f.payload, page);` };
    const gated = {
      path: "components/AliasedGated.tsx",
      text: `${imported}\nconst c = read(f.payload, page, written, { title: f.title, entityId: f.entity_id });`,
    };
    expect(readerCallers([ungated, gated])).toEqual([
      "components/Aliased.tsx",
      "components/AliasedGated.tsx",
    ]);
    expect(ungatedReaderCallers([ungated, gated])).toEqual(["components/Aliased.tsx"]);
  });

  it("counts a call through a local binding, and is not fooled by a call assigned to a name", () => {
    const bound = `const read = ${READER};\nconst c = read(f.payload, page);`;
    expect(ungatedReaderCallers([{ path: "a.tsx", text: bound }])).toEqual(["a.tsx"]);
    // `const c = hostConfirmControls(...)` is the call itself, not a second name for the reader.
    expect(readerCallers([{ path: "b.tsx", text: GATED }])).toEqual(["b.tsx"]);
    expect(ungatedReaderCallers([{ path: "b.tsx", text: GATED }])).toEqual([]);
  });

  it("does not read somebody else's property or a longer name as the alias", () => {
    const decoy = `const read = ${READER};\nconst x = mod.read(f.payload, page);\nconst y = readAll(f.payload, page);`;
    expect(ungatedReaderCallers([{ path: "a.tsx", text: decoy }])).toEqual([]);
  });

  it("applies the row rules through the alias too — the same function, the same rules", () => {
    const text = `const read = ${READER};\nread(f.payload, page, written, { title: other.title });`;
    expect(mismatchedRowCallers([{ path: "a.tsx", text }])).toEqual(["a.tsx"]);
  });

  it("gives up on an alias it cannot pin, and REPORTS giving up rather than going quiet", () => {
    const shadowed = `const read = ${READER};\nfunction g() { const read = other; }\nread(f.payload, page);`;
    expect(ungatedReaderCallers([{ path: "a.tsx", text: shadowed }])).toEqual([]);
    expect(abstainedReaderCallers([{ path: "a.tsx", text: shadowed }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.aliasAmbiguous },
    ]);
    const reassigned = `let read = ${READER};\nread = other;\nread(f.payload, page);`;
    expect(abstainedReaderCallers([{ path: "a.tsx", text: reassigned }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.aliasAmbiguous },
    ]);
  });

  it("says nothing about a file whose alias it followed cleanly", () => {
    const clean = `const read = ${READER};\nread(f.payload, page, written, { title: f.title });`;
    expect(abstainedReaderCallers([{ path: "a.tsx", text: clean }])).toEqual([]);
  });
});

// Q84 inc.113 — inc.112 followed the reader under another LOCAL name. A property has no local name
// to follow, and the call needle excludes a dot by design, so such a file was invisible everywhere.
describe("the reader reached through a property", () => {
  const NAMESPACED = `import * as mod from "@/lib/flags/hostConfirmView";\nconst c = mod.${READER}(f.payload, page);`;

  it("reports the uncounted spelling instead of going quiet about the file", () => {
    expect(abstainedReaderCallers([{ path: "a.tsx", text: NAMESPACED }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.propertyAccess },
    ]);
  });

  it("does NOT count or grade the call — the receiver is a cross-file fact this walk lacks", () => {
    // Three arguments: it would be an offence if this file were entitled to call it the reader.
    expect(readerCallers([{ path: "a.tsx", text: NAMESPACED }])).toEqual([]);
    expect(ungatedReaderCallers([{ path: "a.tsx", text: NAMESPACED }])).toEqual([]);
    expect(mismatchedRowCallers([{ path: "a.tsx", text: NAMESPACED }])).toEqual([]);
  });

  it("covers the property BINDING too, whose calls run through a name inc.112 never sees", () => {
    const bound = `const read = mod.${READER};\nconst c = read(f.payload, page);`;
    expect(abstainedReaderCallers([{ path: "a.tsx", text: bound }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.propertyAccess },
    ]);
  });

  it("says nothing about the direct call or a longer name — the abstention is not the default", () => {
    expect(abstainedReaderCallers([{ path: "a.tsx", text: GATED }])).toEqual([]);
    expect(
      abstainedReaderCallers([{ path: "a.tsx", text: `const c = mod.${READER}Extra(f.payload);` }]),
    ).toEqual([]);
  });

  it("excludes its own source, which spells the property out in its own doctrine", () => {
    expect(abstainedReaderCallers([{ path: RULE_FILE, text: NAMESPACED }])).toEqual([]);
  });

  it("stacks with the alias it gave up on — one file can be uncounted two ways", () => {
    const both = `const read = ${READER};\nread = other;\nconst c = mod.${READER}(f.payload, page);`;
    expect(abstainedReaderCallers([{ path: "a.tsx", text: both }])).toEqual([
      { path: "a.tsx", reason: ABSTENTION.aliasAmbiguous },
      { path: "a.tsx", reason: ABSTENTION.propertyAccess },
    ]);
  });
});

describe("what the walk never visited", () => {
  it("covers every scanned root, the repo root itself, and every source extension", () => {
    for (const root of SCANNED_ROOTS) expect(scannedByWalk(`${root}/x.ts`)).toBe(true);
    expect(scannedByWalk("proxy.ts")).toBe(true); // repo-root production file
    for (const ext of ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]) {
      expect(scannedByWalk(`lib/x.${ext}`)).toBe(true);
    }
  });

  it("reports a source file outside the roots — the hole no abstention can fire on", () => {
    expect(unscannedSources(["src/App.tsx", "lib/ok.ts", "hooks/useX.ts"])).toEqual([
      "hooks/useX.ts",
      "src/App.tsx",
    ]);
  });

  it("does not report what is skipped BY DESIGN — a noisy list is an ignored list", () => {
    expect(
      unscannedSources([
        "lib/flags/__tests__/readerGate.test.ts",
        "node_modules/pkg/index.js",
        ".next/server/page.js",
      ]),
    ).toEqual([]);
  });

  it("does not report a non-source file — a .sql migration is not a caller", () => {
    expect(unscannedSources(["supabase/migrations/0035_x.sql", "docs/plans/PRD.md"])).toEqual([]);
  });

  it("says in its first clause that nothing listed is an offence, and names the blind door", () => {
    const said = unscannedNotice(["src/App.tsx"], READER_GATE_GUARD)!;
    expect(said).toContain("Nothing below is wrong");
    expect(said).toContain("src/App.tsx");
    expect(said).toContain("SCANNED_ROOTS");
    // Q84 inc.115 — both doors share one perimeter now, so a notice that does not say which of
    // them went quiet is a notice nobody can act on.
    expect(said).toContain(READER_GATE_GUARD);
    expect(unscannedNotice([], READER_GATE_GUARD)).toBeNull();
  });
});

describe("the real tree", () => {
  it("has no source file in this repo outside the guard's reach", () => {
    expect(unscannedNotice(unscannedSources(ALL_SOURCE), READER_GATE_GUARD)).toBeNull();
  });

  it("actually walked the repo — an empty listing would satisfy every rule below", () => {
    expect(TREE.length).toBeGreaterThan(100);
    expect(ALL_SOURCE).toContain("proxy.ts");
    expect(ALL_SOURCE).toContain("scripts/net-sentinel.cjs");
  });

  it("has the live caller in the walk — an empty walk is not a clean bill of health", () => {
    expect(readerCallers(TREE)).toContain(LIVE_CALLER);
  });

  it("has no production caller reading a payload without its row", () => {
    expect(ungatedReaderRefusal(ungatedReaderCallers(TREE))).toBeNull();
  });

  it("has no production caller grading a payload against another row", () => {
    expect(mismatchedRowRefusal(mismatchedRowCallers(TREE))).toBeNull();
  });

  it("has every gated call READABLE — so the mismatch rule's green is proof, not just silence", () => {
    expect(abstentionNotice(abstainedReaderCallers(TREE))).toBeNull();
  });

  it("pins the row's position, because the guard counts arguments to find it", () => {
    expect(ROW_ARG_COUNT).toBe(4);
  });
});
