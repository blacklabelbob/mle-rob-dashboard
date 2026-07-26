/**
 * Q67 inc.1 — the serializable boolean filter AST.
 *
 * Design ported (not code-copied — Macro is AGPL-3.0) from the 2026-07-25 teardown,
 * `docs/research/macro-teardown-2026-07-25/02-crm.md` §9.2 B1/B2/B4.
 *
 * Everything else in Q67 rides on this file: saved views persist an `Expr` as JSONB, a
 * share link is the same object base64url'd, and the kanban group-by reuses the same
 * literals. So the shape here is a wire format — additive changes only.
 *
 * Pure and stateless per CR-3: no network, no Date.now(). `compile()` returns
 * `{ sql, params }` with EVERY user-supplied value bound as $n — the one rule that has
 * to exist before the first dynamic query runs, not after (§9.2 B4). Identifiers are
 * never interpolated from user input: every column name below is a literal in this file,
 * reachable only through a closed union.
 *
 * Macro's mistake we are deliberately not repeating (§9.2, "the one thing to get right"):
 * their CRM list target never got server-side property support, so it caps at 500 rows
 * and filters Stage/Owner in the browser. `orgs`, `people` and `deals` are first-class
 * targets here on day one.
 */

import {
  PROPERTY_ENTITY_TYPES,
  type PropertyEntityType,
  type PropertyValue,
  containmentFilter,
} from "../entityProperties";
import type { ActivitySource, ActivityType, DealStage, RoutingLane } from "../types";

/** The entity a filter tree runs against. Closed — it selects the FROM table. */
export const FILTER_TARGETS = ["person", "org", "deal", "activity"] as const;
export type FilterTarget = (typeof FILTER_TARGETS)[number];

/** Deal stages, mirrored from `DealStage` (0005's CHECK). Draft until Rob locks them. */
export const DEAL_STAGES: readonly DealStage[] = [
  "new_lead",
  "contacted",
  "meeting_booked",
  "meeting_held",
  "quote_sent",
  "negotiating",
  "signed",
  "invoiced",
  "paid",
  "delivering",
  "stalled",
  "lost",
];

export const ROUTING_LANES: readonly RoutingLane[] = [
  "auto_close",
  "rep",
  "bounty_hunter",
  "booker",
];

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  "call",
  "email",
  "meeting",
  "note",
  "status_change",
];

export const ACTIVITY_SOURCES: readonly ActivitySource[] = [
  "manual",
  "n8n",
  "api",
  "aidre",
  "dialer",
];

export const NETWORK_STATUSES = ["lit", "warm", "unlit"] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

/**
 * §9.2 B2 — per-entity typed literals. A literal is the leaf of the tree and the ONLY
 * place a value crosses into SQL. Each variant names one column; the union is what makes
 * "is this column filterable" a compile-time question instead of a string check.
 */
export type PersonLiteral =
  | { lit: "person.id"; value: string }
  | { lit: "person.status"; value: NetworkStatus }
  | { lit: "person.orgId"; value: string }
  | { lit: "person.repSource"; value: string }
  | { lit: "person.nameContains"; value: string };

export type OrgLiteral =
  | { lit: "org.id"; value: string }
  | { lit: "org.status"; value: NetworkStatus }
  | { lit: "org.nameContains"; value: string };

export type DealLiteral =
  | { lit: "deal.id"; value: string }
  | { lit: "deal.stage"; value: DealStage }
  | { lit: "deal.owner"; value: string }
  | { lit: "deal.valueGte"; value: number }
  | { lit: "deal.routingLane"; value: RoutingLane }
  | { lit: "deal.referralSourced"; value: boolean }
  | { lit: "deal.personId"; value: string }
  | { lit: "deal.orgId"; value: string };

export type ActivityLiteral =
  | { lit: "activity.type"; value: ActivityType }
  | { lit: "activity.source"; value: ActivitySource }
  | { lit: "activity.occurredAfter"; value: string }
  | { lit: "activity.personId"; value: string }
  | { lit: "activity.orgId"; value: string }
  | { lit: "activity.dealId"; value: string };

/**
 * §9.2 B3 — a custom-field filter, compiled to an EXISTS over `entity_properties` with
 * the `values @> …` containment the GIN index in 0015 supports. `entityType` is checked
 * against the closed `PROPERTY_ENTITY_TYPES` set before it ever reaches SQL.
 */
export type PropertyLiteral = {
  lit: "property";
  entityType: PropertyEntityType;
  propertyDefinitionId: string;
  value: PropertyValue;
};

export type Literal =
  | PersonLiteral
  | OrgLiteral
  | DealLiteral
  | ActivityLiteral
  | PropertyLiteral;

/**
 * §9.2 B1 — the boolean tree. Serialized as-is (no short-key encoding): a saved view is
 * read by humans debugging a share link, and the row is tiny either way.
 */
export type Expr =
  | { op: "and"; args: Expr[] }
  | { op: "or"; args: Expr[] }
  | { op: "not"; arg: Expr }
  | { op: "lit"; lit: Literal };

export const and = (...args: Expr[]): Expr => ({ op: "and", args });
export const or = (...args: Expr[]): Expr => ({ op: "or", args });
export const not = (arg: Expr): Expr => ({ op: "not", arg });
export const lit = (l: Literal): Expr => ({ op: "lit", lit: l });

/** Which target each literal is legal on. A tree may only mix one target's literals. */
const LITERAL_TARGET: Record<string, FilterTarget> = {
  person: "person",
  org: "org",
  deal: "deal",
  activity: "activity",
};

export type CompiledFilter = { sql: string; params: unknown[] };

class FilterError extends Error {}

/** Thrown-on-invalid, so a malformed saved view fails loudly instead of widening a query. */
export function isFilterError(e: unknown): e is Error {
  return e instanceof FilterError;
}

const UUID_ISH = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function requireOneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new FilterError(`${what}: ${JSON.stringify(v)} is not an allowed value`);
  }
  return v as T;
}

function requireId(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID_ISH.test(v)) {
    throw new FilterError(`${what}: ${JSON.stringify(v)} is not a valid id`);
  }
  return v;
}

/**
 * Column map. The right-hand sides are the ONLY identifiers that reach SQL, and they are
 * literals in this file — user input can select one, never spell one.
 */
const COLUMNS: Record<string, string> = {
  "person.id": "id",
  "person.status": "status",
  "person.orgId": "org_id",
  "person.repSource": "rep_source",
  "person.nameContains": "name",
  "org.id": "id",
  "org.status": "status",
  "org.nameContains": "name",
  "deal.id": "id",
  "deal.stage": "stage",
  "deal.owner": "owner_id",
  "deal.valueGte": "value",
  "deal.routingLane": "routing_lane",
  "deal.referralSourced": "referral_sourced",
  "deal.personId": "person_id",
  "deal.orgId": "org_id",
  "activity.type": "type",
  "activity.source": "source",
  "activity.occurredAfter": "occurred_at",
  "activity.personId": "person_id",
  "activity.orgId": "org_id",
  "activity.dealId": "deal_id",
};

type Ctx = { target: FilterTarget; params: unknown[]; alias: string };

function bind(ctx: Ctx, value: unknown): string {
  ctx.params.push(value);
  return `$${ctx.params.length}`;
}

function compileLiteral(l: Literal, ctx: Ctx): string {
  if (l.lit === "property") {
    if (!(PROPERTY_ENTITY_TYPES as readonly string[]).includes(l.entityType)) {
      throw new FilterError(`property filter: unknown entity type ${JSON.stringify(l.entityType)}`);
    }
    const defId = requireId(l.propertyDefinitionId, "property filter definition id");
    // entityType is a closed-enum member, but it is still bound rather than inlined —
    // no value in this compiler travels any path except a placeholder.
    return (
      `EXISTS (SELECT 1 FROM entity_properties ep WHERE ep.entity_id = ${ctx.alias}.id ` +
      `AND ep.entity_type = ${bind(ctx, l.entityType)} ` +
      `AND ep.property_definition_id = ${bind(ctx, defId)} ` +
      `AND ep.values @> ${bind(ctx, JSON.stringify(containmentFilter(l.value)))}::jsonb)`
    );
  }

  const prefix = l.lit.split(".")[0];
  const litTarget = LITERAL_TARGET[prefix];
  if (litTarget !== ctx.target) {
    throw new FilterError(
      `literal ${l.lit} cannot be used in a ${ctx.target} filter (mixing targets)`,
    );
  }
  const col = `${ctx.alias}.${COLUMNS[l.lit]}`;
  // The value is re-widened to `unknown` on purpose: the static type says what a caller
  // *should* pass, but a saved view arrives as parsed JSONB, so every branch below has to
  // re-check at runtime. Narrowing here would make TypeScript delete the checks that are
  // the whole point of this file.
  const name: string = l.lit;
  const raw: unknown = (l as { value: unknown }).value;

  switch (l.lit) {
    case "person.status":
    case "org.status":
      return `${col} = ${bind(ctx, requireOneOf(raw, NETWORK_STATUSES, name))}`;
    case "deal.stage":
      return `${col} = ${bind(ctx, requireOneOf(raw, DEAL_STAGES, name))}`;
    case "deal.routingLane":
      return `${col} = ${bind(ctx, requireOneOf(raw, ROUTING_LANES, name))}`;
    case "activity.type":
      return `${col} = ${bind(ctx, requireOneOf(raw, ACTIVITY_TYPES, name))}`;
    case "activity.source":
      return `${col} = ${bind(ctx, requireOneOf(raw, ACTIVITY_SOURCES, name))}`;
    case "deal.referralSourced":
      if (typeof raw !== "boolean") throw new FilterError(`${name}: expected a boolean`);
      return `${col} = ${bind(ctx, raw)}`;
    case "deal.valueGte":
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new FilterError(`${name}: expected a finite number`);
      }
      return `${col} >= ${bind(ctx, raw)}`;
    case "activity.occurredAfter":
      if (typeof raw !== "string" || !ISO_INSTANT.test(raw)) {
        throw new FilterError(`${name}: expected an ISO timestamp`);
      }
      return `${col} > ${bind(ctx, raw)}`;
    case "person.nameContains":
    case "org.nameContains": {
      if (typeof raw !== "string" || raw.trim() === "") {
        throw new FilterError(`${name}: expected a non-empty string`);
      }
      // % and _ are escaped so a pasted name can't turn into a table scan wildcard.
      const escaped = raw.replace(/([%_\\])/g, "\\$1");
      return `${col} ILIKE ${bind(ctx, `%${escaped}%`)}`;
    }
    default:
      // Everything remaining is an id-shaped equality.
      return `${col} = ${bind(ctx, requireId(raw, name))}`;
  }
}

function walk(e: Expr, ctx: Ctx, depth: number): string {
  if (depth > 32) throw new FilterError("filter tree too deep (max 32)");
  switch (e?.op) {
    case "lit":
      return compileLiteral(e.lit, ctx);
    case "not":
      return `NOT (${walk(e.arg, ctx, depth + 1)})`;
    case "and":
    case "or": {
      if (!Array.isArray(e.args)) throw new FilterError(`${e.op}: args must be an array`);
      // An empty AND is "everything", an empty OR is "nothing" — the identity of each
      // operator. Spelling it out beats a silently dropped clause.
      if (e.args.length === 0) return e.op === "and" ? "TRUE" : "FALSE";
      const parts = e.args.map((a) => walk(a, ctx, depth + 1));
      return `(${parts.join(e.op === "and" ? " AND " : " OR ")})`;
    }
    default:
      throw new FilterError(`unknown filter node ${JSON.stringify((e as { op?: string })?.op)}`);
  }
}

/**
 * Compile a tree into a parameterized WHERE fragment for `target`.
 *
 * The caller supplies the FROM/alias; `alias` defaults to the target's table so the
 * fragment is drop-in for `SELECT … FROM people p WHERE <sql>` style RPCs.
 */
export function compile(
  expr: Expr,
  target: FilterTarget,
  alias = DEFAULT_ALIAS[target],
): CompiledFilter {
  if (!(FILTER_TARGETS as readonly string[]).includes(target)) {
    throw new FilterError(`unknown filter target ${JSON.stringify(target)}`);
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) {
    throw new FilterError(`illegal alias ${JSON.stringify(alias)}`);
  }
  const ctx: Ctx = { target, params: [], alias };
  const sql = walk(expr, ctx, 0);
  return { sql, params: ctx.params };
}

export const DEFAULT_ALIAS: Record<FilterTarget, string> = {
  person: "people",
  org: "orgs",
  deal: "deals",
  activity: "activities",
};
