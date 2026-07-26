/**
 * Q67 inc.2 — the trust boundary in front of the filter AST.
 *
 * `compile()` takes an `Expr`. TypeScript guarantees that shape only for values written in
 * our own code; a saved view arrives as parsed JSONB and a share link arrives as
 * base64url'd JSON typed by whoever pasted the URL. Between those and `compile()` there
 * has to be one function that turns `unknown` into an `Expr` or throws — this is it.
 *
 * Pure and stateless per CR-3. Three rules, all of them load-bearing:
 *
 *  1. **Rebuild, never cast.** Every node returned here is a fresh object literal holding
 *     only the keys the grammar names. A cast would carry `__proto__`, extra keys, and
 *     whatever else came off the wire straight into the compiler.
 *  2. **Bound the tree, not just its depth.** `compile()` caps depth at 32; depth alone
 *     does not bound work, because a *flat* `and` with 200k args is depth 1. A share link
 *     is an untrusted string handed to us by a stranger, so node count is capped too.
 *  3. **Reject unknown names here, not at the database.** An unknown literal or operator
 *     is a malformed view, and the caller who can still show a useful error is this one.
 *
 * Value-level checks are deliberately NOT duplicated here — `compile()` re-validates every
 * value at bind time (that is what makes it safe on its own), and a second copy of those
 * rules is a second place for them to drift. This layer owns *structure*; the compiler
 * owns *values*.
 */

import { LITERAL_NAMES, isFilterError, type Expr, type Literal } from "./ast";

/** Matches `compile()`'s own depth cap, so nothing parses that cannot then compile. */
export const MAX_DEPTH = 32;

/**
 * Node ceiling for one tree. Comfortably above any human-built view (a busy segment is
 * tens of literals) and far below anything that costs real CPU to walk or to plan as SQL.
 */
export const MAX_NODES = 512;

export class FilterParseError extends Error {}

function fail(path: string, msg: string): never {
  throw new FilterParseError(`${path}: ${msg}`);
}

/** Plain-object check that also rejects arrays and prototype-carrying wrappers. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseLiteral(node: unknown, path: string): Literal {
  if (!isRecord(node)) fail(path, "literal must be an object");
  const name = node.lit;
  if (typeof name !== "string") fail(path, "literal is missing a `lit` name");
  if (!LITERAL_NAMES.includes(name)) {
    fail(path, `unknown literal ${JSON.stringify(name)}`);
  }

  if (name === "property") {
    // Rebuilt field-by-field: `entityType` and `propertyDefinitionId` are re-checked by
    // the compiler, and `value` is whatever JSON the property spine accepts, so its shape
    // belongs to `containmentFilter()` rather than to this grammar.
    if (!("value" in node)) fail(path, "property literal is missing `value`");
    return {
      lit: "property",
      entityType: node.entityType,
      propertyDefinitionId: node.propertyDefinitionId,
      value: node.value,
    } as Literal;
  }

  if (!("value" in node)) fail(path, `literal ${name} is missing \`value\``);
  return { lit: name, value: node.value } as Literal;
}

function parseNode(node: unknown, path: string, depth: number, budget: { n: number }): Expr {
  if (depth > MAX_DEPTH) fail(path, `tree deeper than ${MAX_DEPTH}`);
  if (++budget.n > MAX_NODES) fail(path, `tree larger than ${MAX_NODES} nodes`);
  if (!isRecord(node)) fail(path, "node must be an object");

  switch (node.op) {
    case "lit":
      return { op: "lit", lit: parseLiteral(node.lit, `${path}.lit`) };
    case "not":
      return { op: "not", arg: parseNode(node.arg, `${path}.arg`, depth + 1, budget) };
    case "and":
    case "or": {
      const args = node.args;
      if (!Array.isArray(args)) fail(path, `${node.op}: \`args\` must be an array`);
      return {
        op: node.op,
        // An empty args array is preserved, not rejected: `and: []` is TRUE and `or: []`
        // is FALSE by operator identity, and the compiler already spells that out. Making
        // it a parse error here would break round-tripping a legitimately empty view.
        args: args.map((a, i) => parseNode(a, `${path}.args[${i}]`, depth + 1, budget)),
      };
    }
    default:
      fail(path, `unknown operator ${JSON.stringify(node.op)}`);
  }
}

/**
 * Validate an untrusted value into an `Expr`, or throw `FilterParseError`.
 *
 * The returned tree contains only grammar keys — safe to hand to `compile()`, which then
 * re-checks every leaf value before binding it.
 */
export function parseExpr(input: unknown): Expr {
  return parseNode(input, "$", 0, { n: 0 });
}

/** Byte ceiling on a share link / stored view before it is even JSON-parsed. */
export const MAX_JSON_BYTES = 64 * 1024;

/**
 * Parse an `Expr` out of a JSON string (a saved-view payload or a decoded share link).
 * Size is checked before `JSON.parse` — parsing a megabyte to then reject it is work an
 * anonymous URL should never be able to buy.
 */
export function parseExprJson(text: string): Expr {
  if (typeof text !== "string") fail("$", "expected a JSON string");
  if (text.length > MAX_JSON_BYTES) fail("$", `payload larger than ${MAX_JSON_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("$", "payload is not valid JSON");
  }
  return parseExpr(parsed);
}

/** True for either failure mode, so a route can map both to one 400. */
export function isFilterInputError(e: unknown): e is Error {
  return e instanceof FilterParseError || isFilterError(e);
}
