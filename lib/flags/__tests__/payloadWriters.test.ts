import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  SCOPED_PAYLOAD_WRITER,
  unscopedPayloadWriterRefusal,
  unscopedPayloadWriters,
  type SourceFile,
} from "../payloadWriters";

// Q84 inc.106 — the rule is tested on strings AND driven off the real tree, the 0021/0034/inc.51
// precedent. A guard that only ever sees its own fixtures proves the regex compiles; the walk is
// what makes the next writer of `flags.payload` turn this file red instead of shipping.

const ROOTS = ["app", "lib", "scripts", "components"];
const SOURCE = /\.(ts|tsx|mjs|js)$/;

function walk(dir: string, acc: SourceFile[]): SourceFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests write fixture payloads by design — this module's own fixtures below would
      // otherwise report themselves.
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
});
