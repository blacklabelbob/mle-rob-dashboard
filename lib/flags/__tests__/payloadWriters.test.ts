import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  SCOPED_PAYLOAD_WRITER,
  unscopedPayloadWriterRefusal,
  unscopedPayloadWriters,
  type SourceFile,
} from "../payloadWriters";
import { scannedByWalk, SOURCE_FILE, unscannedNotice, unscannedSources } from "../scanPerimeter";

/** This door's name in an `unscannedNotice` — a shared perimeter must say which guard went blind. */
const PAYLOAD_WRITE_GUARD = "the flags.payload write gate";

// Q84 inc.106 — the rule is tested on strings AND driven off the real tree, the 0021/0034/inc.51
// precedent. A guard that only ever sees its own fixtures proves the regex compiles; the walk is
// what makes the next writer of `flags.payload` turn this file red instead of shipping.

// Q84 inc.115 — the roots and the extension filter used to be two literals HERE, hand-copied from
// the read door's test. inc.114 fixed that copy over there (repo-root files enter; `.cjs`/`.jsx`/
// `.mts`/`.cts` enter) and this one stayed as it was, so `proxy.ts` — the production Basic-Auth
// gate — could write `flags.payload` unscoped and this guard would never have seen the file. The
// boundary now comes from `scanPerimeter`, shared by both doors, so it cannot be widened for one
// and not the other. The walk still lives in the test: the module is pure per CR-3 and the
// filesystem belongs to the caller.
const rel = (full: string) => path.relative(process.cwd(), full).split(path.sep).join("/");

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests write fixture payloads by design — this module's own fixtures below would
      // otherwise report themselves.
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

const WRITES_PAYLOAD = `await s.from("flags").insert({ id, title, payload: graded });`;

describe("who may write flags.payload", () => {
  it("names the scoped route and nothing else", () => {
    expect(
      unscopedPayloadWriters([
        { path: SCOPED_PAYLOAD_WRITER, text: WRITES_PAYLOAD },
        { path: "app/api/admin/people/route.ts", text: WRITES_PAYLOAD },
      ]),
    ).toEqual(["app/api/admin/people/route.ts"]);
  });

  it("needs BOTH the flags table and a payload key — either alone is somebody else's code", () => {
    expect(
      unscopedPayloadWriters([
        { path: "a.ts", text: `await s.from("flags").insert({ id, title });` },
        { path: "b.ts", text: `await s.from("orgs").update({ payload: x });` },
      ]),
    ).toEqual([]);
  });

  it("does not mistake a request body named payload for a column write", () => {
    // Every false positive here is a real line from a real flags-writing route on this tree.
    // They are why the key regex demands a leading `{` or `,`.
    const innocent = [
      `let payload: N8nErrorPayload;\npayload = await req.json();\nawait s.from("flags").insert(flag);`,
      `const payload = parsed.payload;\nconsole.log(payload.product);\nawait s.from("flags").insert(row);`,
      `return NextResponse.json({ error: "invalid payload" });\nawait s.from("flags").insert(row);`,
    ];
    expect(unscopedPayloadWriters(innocent.map((text, i) => ({ path: `r${i}.ts`, text })))).toEqual([]);
  });

  it("catches the shorthand key as well as the colon", () => {
    const shorthand = `await s.from("flags").upsert({ id, payload });`;
    expect(unscopedPayloadWriters([{ path: "x.ts", text: shorthand }])).toEqual(["x.ts"]);
  });

  it("says what to do, and stays silent when there is nothing to say", () => {
    expect(unscopedPayloadWriterRefusal([])).toBeNull();
    const said = unscopedPayloadWriterRefusal(["app/api/admin/people/route.ts"])!;
    expect(said).toContain("app/api/admin/people/route.ts");
    expect(said).toContain("POST /api/admin/flags");
  });
});

describe("the real tree", () => {
  it("has the scoped route in it, so the walk is proven to be looking at something", () => {
    expect(TREE.some((f) => f.path === SCOPED_PAYLOAD_WRITER)).toBe(true);
  });

  it("routes every payload write through the door that scopes it", () => {
    const offenders = unscopedPayloadWriters(TREE);
    expect(unscopedPayloadWriterRefusal(offenders) ?? "clean").toBe("clean");
  });

  // Q84 inc.115 — inc.114's pins, owed to this door too. Without them "no offenders" silently
  // means "no files", and the perimeter can shrink back without anything turning red.
  it("has no source file in this repo outside this guard's reach", () => {
    expect(unscannedNotice(unscannedSources(ALL_SOURCE), PAYLOAD_WRITE_GUARD)).toBeNull();
  });

  it("actually walked the repo — an empty listing would satisfy every rule above", () => {
    expect(TREE.length).toBeGreaterThan(100);
    // The two files inc.114 found outside the old literals. They are in THIS door's walk now.
    expect(ALL_SOURCE).toContain("proxy.ts");
    expect(ALL_SOURCE).toContain("scripts/net-sentinel.cjs");
    expect(TREE.some((f) => f.path === "proxy.ts")).toBe(true);
  });

  it("shares one perimeter with the read door — not a second copy that agrees today", () => {
    // The point of the increment: the boundary is `scanPerimeter`'s, so widening it for one door
    // widens it for both. A repo-root production file and a `.cjs` under a scanned root enter here
    // for exactly the reason they enter there.
    expect(scannedByWalk("proxy.ts")).toBe(true);
    expect(scannedByWalk("scripts/net-sentinel.cjs")).toBe(true);
    expect(scannedByWalk("src/App.tsx")).toBe(false);
  });
});
