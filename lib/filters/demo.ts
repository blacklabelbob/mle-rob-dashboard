/**
 * Q67b — the demo-row predicate for the saved-view route.
 *
 * THE QUESTION THIS ANSWERS (recorded in BUILD-QUEUE during Q67 inc.6, not silently
 * fixed): `/people` hides fabricated rep-training rows via `isDemo()`, but the filter AST
 * has no demo notion — so a `person.status = warm` saved view returned Rita Alvarez
 * (DEMO) while the page it was meant to replace did not. Two lists disagreeing about the
 * same filter is the failure, and it can be answered in exactly one of two places.
 *
 * **Answered at the ROUTE, not in the UI, and not inside `compile()`.**
 *  - Not the UI: a share link, a CSV export and a future agent all read the same route;
 *    a filter applied in one client is a filter the other consumers silently skip.
 *  - Not inside `compile()`: `compile()` renders the tree it was GIVEN. Folding a hidden
 *    extra clause into it would make the SQL stop matching the saved view, and the one
 *    caller that legitimately wants demo rows (the Rep Cockpit) would have no way out.
 *    So this is a separate, explicit fragment the route ANDs on — visible at the call
 *    site, and skippable by a caller that says so.
 *
 * Pure per CR-3: no network, no clock. Values are bound, never interpolated — the same
 * invariant as `ast.ts`, so that "no string literal reaches the emitted SQL" stays a rule
 * with no exceptions rather than a habit with one.
 */

import { DEFAULT_ALIAS, FilterError, type BindStyle, type FilterTarget } from "./ast";

/** Mirrors `lib/stats.isDemo` — fabricated rows are name-tagged "(DEMO)". */
export const DEMO_NAME_PATTERN = "%(DEMO)%";

/**
 * Mirrors the `demo-` id prefix used by `lib/leads/recycle`, `lib/tasks/todayRules` and
 * the fixtures themselves. Both conventions are checked because both exist: today every
 * demo person satisfies each, and a row that gains one without the other must still be
 * hidden rather than half-hidden.
 */
export const DEMO_ID_PATTERN = "demo-%";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export type DemoExclusionOptions = {
  alias?: string;
  bindStyle?: BindStyle;
  paramsExpr?: string;
  /**
   * How many parameters the caller has already bound. The fragment is ANDed onto a
   * compiled filter that owns `$1..$n`, so its own placeholders start after them.
   */
  paramOffset?: number;
};

export type CompiledDemoExclusion = { sql: string; params: unknown[] };

/**
 * Which columns carry the demo convention for each target.
 *
 * `deal` and `activity` have no name of their own, so they are judged by the ids they
 * hang off: an activity logged against a demo person is demo data even though its own id
 * is not. That is `todayRules`' rule, kept identical here on purpose — a second, subtly
 * different definition of "demo" is exactly how the two lists disagree again.
 */
const DEMO_COLUMNS: Record<FilterTarget, { name: readonly string[]; id: readonly string[] }> = {
  person: { name: ["name"], id: ["id"] },
  org: { name: ["name"], id: ["id"] },
  deal: { name: [], id: ["id", "person_id", "org_id"] },
  activity: { name: [], id: ["id", "person_id", "deal_id", "org_id"] },
};

/**
 * A WHERE fragment that is TRUE for every row that is NOT demo data.
 *
 * `coalesce(… , false)` is load-bearing: `NULL LIKE 'demo-%'` is NULL, and `NOT NULL` is
 * NULL, so a deal with no `org_id` would be filtered out by a predicate meant to remove
 * demo rows — real records vanishing from a rep's list with no error anywhere.
 */
export function compileDemoExclusion(
  target: FilterTarget,
  opts: DemoExclusionOptions = {},
): CompiledDemoExclusion {
  const cols = DEMO_COLUMNS[target];
  if (!cols) throw new FilterError(`unknown filter target ${JSON.stringify(target)}`);

  const alias = opts.alias ?? DEFAULT_ALIAS[target];
  const bindStyle = opts.bindStyle ?? "pg";
  const paramsExpr = opts.paramsExpr ?? "p_params";
  const offset = opts.paramOffset ?? 0;
  if (!IDENTIFIER.test(alias)) throw new FilterError(`illegal alias ${JSON.stringify(alias)}`);
  if (!IDENTIFIER.test(paramsExpr)) {
    throw new FilterError(`illegal params identifier ${JSON.stringify(paramsExpr)}`);
  }
  if (bindStyle !== "pg" && bindStyle !== "jsonb") {
    throw new FilterError(`unknown bind style ${JSON.stringify(bindStyle)}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new FilterError(`illegal param offset ${JSON.stringify(offset)}`);
  }

  const params: unknown[] = [];
  const bind = (value: string): string => {
    params.push(value);
    const ordinal = offset + params.length; // 1-based, like `$n`.
    if (bindStyle === "pg") return `$${ordinal}`;
    return `((${paramsExpr}->>${ordinal - 1})::text)`;
  };

  const parts: string[] = [];
  // One placeholder per column rather than one shared per pattern: params are positional
  // in both renderings, and reusing an ordinal is a re-numbering bug waiting for the day
  // someone reorders the clauses.
  for (const c of cols.name) parts.push(`NOT coalesce(${alias}.${c} LIKE ${bind(DEMO_NAME_PATTERN)}, false)`);
  for (const c of cols.id) parts.push(`NOT coalesce(${alias}.${c} LIKE ${bind(DEMO_ID_PATTERN)}, false)`);

  return { sql: `(${parts.join(" AND ")})`, params };
}

/** AND two fragments, keeping the parameter arrays in the order their placeholders assume. */
export function andFragments(
  left: CompiledDemoExclusion,
  right: CompiledDemoExclusion,
): CompiledDemoExclusion {
  return { sql: `(${left.sql} AND ${right.sql})`, params: [...left.params, ...right.params] };
}
