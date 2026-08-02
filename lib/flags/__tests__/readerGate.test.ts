import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  READER,
  ROW_ARG_COUNT,
  RULE_FILE,
  readerCallers,
  ungatedReaderCallers,
  ungatedReaderRefusal,
  type SourceFile,
} from "../readerGate";

// Q84 inc.107 — tested on strings AND driven off the real tree (the 0021/0034/inc.51 precedent,
// same as inc.106's payloadWriters). Fixtures prove the scan; the walk is what makes the next
// production caller that forgets the row turn this file red instead of shipping.

const ROOTS = ["app", "lib", "scripts", "components"];
const SOURCE = /\.(ts|tsx|mjs|js)$/;
const LIVE_CALLER = "components/ThingsToAddress.tsx";

function walk(dir: string, acc: SourceFile[]): SourceFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests call the reader two-arg BY DESIGN — that is the point of the module doc: a test
      // may state the reader's core rule without also stating a scope. Production may not.
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, acc);
    } else if (SOURCE.test(entry.name)) {
      acc.push({
        path: path.relative(process.cwd(), full).split(path.sep).join("/"),
        text: readFileSync(full, "utf8"),
      });
    }
  }
  return acc;
}

const TREE: SourceFile[] = ROOTS.reduce<SourceFile[]>((acc, r) => walk(path.join(process.cwd(), r), acc), []);

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

describe("the real tree", () => {
  it("has the live caller in the walk — an empty walk is not a clean bill of health", () => {
    expect(readerCallers(TREE)).toContain(LIVE_CALLER);
  });

  it("has no production caller reading a payload without its row", () => {
    expect(ungatedReaderRefusal(ungatedReaderCallers(TREE))).toBeNull();
  });

  it("pins the row's position, because the guard counts arguments to find it", () => {
    expect(ROW_ARG_COUNT).toBe(4);
  });
});
