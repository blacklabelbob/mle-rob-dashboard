import { describe, expect, it } from "vitest";

import { compile, isFilterError, type Expr } from "../filters/ast";
import {
  FilterParseError,
  MAX_NODES,
  isFilterInputError,
  parseExpr,
  parseExprJson,
} from "../filters/parse";

const litNode = { op: "lit", lit: { lit: "person.status", value: "lit" } };

describe("parseExpr — structure", () => {
  it("round-trips a tree a saved view would actually hold", () => {
    const wire = JSON.parse(
      JSON.stringify({
        op: "and",
        args: [
          litNode,
          { op: "not", arg: { op: "lit", lit: { lit: "person.orgId", value: "org_1" } } },
          { op: "or", args: [] },
        ],
      }),
    );
    const parsed = parseExpr(wire);
    expect(parsed).toEqual(wire);
    // and the product is compilable, which is the only reason this function exists
    expect(compile(parsed, "person").sql).toContain("people.status = $1");
  });

  it("strips keys outside the grammar instead of passing them through", () => {
    const parsed = parseExpr({
      op: "lit",
      lit: { lit: "person.status", value: "lit", evil: "DROP TABLE people" },
      extra: 1,
    }) as { op: "lit"; lit: Record<string, unknown> };
    expect(Object.keys(parsed)).toEqual(["op", "lit"]);
    expect(Object.keys(parsed.lit)).toEqual(["lit", "value"]);
  });

  it("preserves empty and/or rather than dropping the clause", () => {
    expect(compile(parseExpr({ op: "and", args: [] }), "person").sql).toBe("TRUE");
    expect(compile(parseExpr({ op: "or", args: [] }), "person").sql).toBe("FALSE");
  });
});

describe("parseExpr — rejection", () => {
  it.each([
    ["null", null],
    ["a string", "person.status"],
    ["an array", [litNode]],
    ["an unknown operator", { op: "exec", args: [] }],
    ["a missing operator", { args: [] }],
    ["and with non-array args", { op: "and", args: { 0: litNode } }],
    ["a literal with no name", { op: "lit", lit: { value: "lit" } }],
    ["a literal with no value", { op: "lit", lit: { lit: "person.status" } }],
    ["an unknown literal name", { op: "lit", lit: { lit: "person.password", value: "x" } }],
    ["a nested bad node", { op: "and", args: [litNode, { op: "nope" }] }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseExpr(input)).toThrow(FilterParseError);
  });

  it("names the path of the offending node", () => {
    expect(() => parseExpr({ op: "and", args: [litNode, { op: "nope" }] })).toThrow(
      /\$\.args\[1\]/,
    );
  });

  it("caps node count, which depth alone does not bound", () => {
    // Depth 2 — a depth cap would wave this straight through.
    const flat = { op: "and", args: Array.from({ length: MAX_NODES + 5 }, () => litNode) };
    expect(() => parseExpr(flat)).toThrow(/larger than/);
  });

  it("caps depth", () => {
    let deep: unknown = litNode;
    for (let i = 0; i < 40; i++) deep = { op: "not", arg: deep };
    expect(() => parseExpr(deep)).toThrow(/deeper than/);
  });

  it("does not let __proto__ off the wire reach the compiler", () => {
    const wire = JSON.parse('{"op":"lit","lit":{"lit":"person.status","value":"lit","__proto__":{"polluted":true}}}');
    const parsed = parseExpr(wire) as { lit: Record<string, unknown> };
    expect(Object.keys(parsed.lit).sort()).toEqual(["lit", "value"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("parseExprJson", () => {
  it("parses a share-link payload", () => {
    expect(parseExprJson(JSON.stringify(litNode))).toEqual(litNode);
  });

  it("rejects malformed JSON before it becomes a stack trace", () => {
    expect(() => parseExprJson("{oops")).toThrow(FilterParseError);
  });

  it("rejects an oversized payload without parsing it", () => {
    expect(() => parseExprJson(`"${"x".repeat(70_000)}"`)).toThrow(/larger than/);
  });
});

describe("compile — unknown literal names fail loudly", () => {
  it("throws instead of emitting `people.undefined`", () => {
    // Right target prefix, column that does not exist: before this guard the compiler
    // produced the SQL text `people.evil = $1` and deferred the failure to Postgres.
    const bad = { op: "lit", lit: { lit: "person.evil", value: "abc" } } as unknown as Expr;
    expect(() => compile(bad, "person")).toThrow(/unknown filter literal/);
    try {
      compile(bad, "person");
    } catch (e) {
      expect(isFilterError(e)).toBe(true);
      expect(isFilterInputError(e)).toBe(true);
    }
  });

  it("isFilterInputError covers both layers", () => {
    expect(isFilterInputError(new FilterParseError("x"))).toBe(true);
    expect(isFilterInputError(new Error("x"))).toBe(false);
  });
});
