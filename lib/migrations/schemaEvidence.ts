/**
 * Q84 inc.52 — what the LIVE schema can prove about a migration, and what it cannot.
 *
 * inc.51 built the backlog off markers in the files: 2 pending, 0 disagreements,
 * and **36 unmarked** — every migration written before the convention existed.
 * The tempting shortcut is to back-fill 36 `-- APPLY-STATUS: APPLIED` lines by
 * assertion. That is the same guess this whole ladder was built to kill: nobody
 * checked, they just wrote it down.
 *
 * The honest source is prod itself. PostgREST publishes an OpenAPI root listing
 * every table/view it exposes and their columns — read-only, no schema access
 * needed. So a migration that creates `dedup_review(status, resolution_note…)`
 * can be checked against what actually exists.
 *
 * The trap, and the reason this module is more careful than "does the table
 * exist": **that root sees objects, not rules.** CHECK constraints, GRANTs, RLS
 * policies, indexes, functions and triggers are all invisible to it. `0034` is
 * exactly this case — the `dedup_review` TABLE exists on prod (it was created by
 * hand, which is why inc.50 found no migration for it) while the CHECKs that
 * migration adds do not. A verdict of "table present → applied" would have
 * declared a pending migration applied and closed a real backlog row on a lie.
 *
 * So evidence runs in one direction with confidence and one direction without:
 *
 *   an object MISSING  → proof the file is not fully applied.
 *   an object PRESENT  → proof only that the object exists (some path created
 *                        it), and says nothing about statements the root cannot
 *                        see. Any unverifiable statement caps the verdict.
 *
 * Pure per CR-3: no clock, no filesystem, no network. The caller fetches the
 * OpenAPI root and hands the shape in.
 */

/** table/view name → column names, as published by the PostgREST OpenAPI root. */
export type LiveSchema = Record<string, string[]>;

export type SchemaObject =
  | { kind: "table"; table: string }
  | { kind: "column"; table: string; column: string };

export type ParsedMigration = {
  /** Objects the OpenAPI root can adjudicate. */
  objects: SchemaObject[];
  /** Statements it cannot: constraints, grants, policies, indexes, functions… */
  unverifiable: string[];
};

/** Strip line comments and block comments so their prose cannot parse as DDL. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*--.*$/gm, " ");
}

function bareName(raw: string): string {
  const last = raw.trim().split(".").pop() ?? raw;
  return last.replace(/["`]/g, "").trim().toLowerCase();
}

const CREATE_TABLE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi;
const CREATE_VIEW = /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi;
const ALTER_TABLE = /^\s*alter\s+table\s+(?:if\s+exists\s+)?([\w".]+)/i;
const ADD_COLUMN = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/gi;

/**
 * Statements whose effect is real but invisible to the OpenAPI root. Listed by
 * the shape a human writes, not inferred — an unlisted statement simply does not
 * cap the verdict, and that is a bug we would rather find as a wrong verdict
 * than hide behind a catch-all that matches everything.
 */
const UNVERIFIABLE: Array<[RegExp, string]> = [
  [/\badd\s+constraint\b/i, "add constraint"],
  [/\bcheck\s*\(/i, "check constraint"],
  [/\bgrant\s+/i, "grant"],
  [/\brevoke\s+/i, "revoke"],
  [/\bcreate\s+(?:unique\s+)?index\b/i, "create index"],
  [/\bcreate\s+policy\b/i, "create policy"],
  [/\benable\s+row\s+level\s+security\b/i, "enable rls"],
  [/\bcreate\s+(?:or\s+replace\s+)?function\b/i, "create function"],
  [/\bcreate\s+trigger\b/i, "create trigger"],
  [/\bcreate\s+type\b/i, "create type"],
  [/\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i, "data change"],
];

export function parseMigration(sql: string): ParsedMigration {
  const body = stripComments(sql);
  const objects: SchemaObject[] = [];
  const seen = new Set<string>();

  const push = (o: SchemaObject) => {
    const key = o.kind === "table" ? `t:${o.table}` : `c:${o.table}.${o.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    objects.push(o);
  };

  for (const re of [CREATE_TABLE, CREATE_VIEW]) {
    re.lastIndex = 0;
    for (let m = re.exec(body); m; m = re.exec(body)) push({ kind: "table", table: bareName(m[1]) });
  }
  // Columns are read STATEMENT BY STATEMENT. The first cut of this matched
  // `alter table X … add column Y` across a window of characters, and prod's own
  // schema caught it in the first run: `alter table edges add constraint …` then
  // bridged to the NEXT statement's `alter table people add column org_id`, and
  // reported a missing `edges.org_id` that no migration ever wrote. A verdict
  // engine that invents an object is worse than no verdict, so the bridge is
  // gone — a column belongs to the ALTER TABLE it is written inside of.
  for (const stmt of body.split(";")) {
    const owner = ALTER_TABLE.exec(stmt);
    if (!owner) continue;
    ADD_COLUMN.lastIndex = 0;
    for (let m = ADD_COLUMN.exec(stmt); m; m = ADD_COLUMN.exec(stmt)) {
      push({ kind: "column", table: bareName(owner[1]), column: bareName(m[1]) });
    }
  }

  const unverifiable: string[] = [];
  for (const [re, label] of UNVERIFIABLE) {
    if (re.test(body) && !unverifiable.includes(label)) unverifiable.push(label);
  }

  return { objects, unverifiable };
}

export type Verdict =
  /** At least one object the file creates is absent from prod. Proof: not fully applied. */
  | "objects-missing"
  /** Every object exists and the file does nothing the root cannot see. Strongest evidence available. */
  | "objects-present"
  /** Every object exists, but the file also does things the root cannot see. NOT proof of applied. */
  | "objects-present-unverifiable-rules"
  /** Nothing in the file is visible to the root at all. No evidence either way. */
  | "no-visible-objects";

export type Evidence = {
  name: string;
  verdict: Verdict;
  present: string[];
  missing: string[];
  unverifiable: string[];
  /** One line a human can read without knowing any of the above. */
  reason: string;
};

function describe(o: SchemaObject): string {
  return o.kind === "table" ? o.table : `${o.table}.${o.column}`;
}

export function schemaEvidence(name: string, sql: string, live: LiveSchema): Evidence {
  const { objects, unverifiable } = parseMigration(sql);
  const present: string[] = [];
  const missing: string[] = [];

  for (const o of objects) {
    const cols = live[o.table];
    const exists = o.kind === "table" ? cols !== undefined : (cols?.includes(o.column) ?? false);
    (exists ? present : missing).push(describe(o));
  }

  if (missing.length) {
    return {
      name,
      verdict: "objects-missing",
      present,
      missing,
      unverifiable,
      reason: `prod is missing ${missing.join(", ")} — this migration has not fully landed`,
    };
  }
  if (!objects.length) {
    return {
      name,
      verdict: "no-visible-objects",
      present,
      missing,
      unverifiable,
      reason: unverifiable.length
        ? `only does things the OpenAPI root cannot see (${unverifiable.join(", ")}) — no evidence either way`
        : "creates no table or column the OpenAPI root can see — no evidence either way",
    };
  }
  if (unverifiable.length) {
    return {
      name,
      verdict: "objects-present-unverifiable-rules",
      present,
      missing,
      unverifiable,
      reason: `${present.join(", ")} exist, but ${unverifiable.join(", ")} cannot be seen from here — NOT proof it is applied`,
    };
  }
  return {
    name,
    verdict: "objects-present",
    present,
    missing,
    unverifiable,
    reason: `${present.join(", ")} all exist on prod and this file does nothing else`,
  };
}

export type EvidenceReport = {
  evidence: Evidence[];
  /** Files whose objects are missing — the alarming ones, regardless of any marker. */
  notLanded: string[];
  /** Files an APPLIED marker could be written for on evidence rather than assertion. */
  supportsApplied: string[];
  /** Files the live schema simply cannot speak to. */
  noEvidence: string[];
};

/**
 * `supportsApplied` is deliberately narrow: only `objects-present`, never the
 * `…-unverifiable-rules` case. Shrinking the unmarked list is the goal, but a
 * marker written off partial evidence is worth less than no marker at all.
 */
export function evidenceReport(
  files: Array<{ name: string; sql: string }>,
  live: LiveSchema,
): EvidenceReport {
  const evidence = [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => schemaEvidence(f.name, f.sql, live));

  return {
    evidence,
    notLanded: evidence.filter((e) => e.verdict === "objects-missing").map((e) => e.name),
    supportsApplied: evidence.filter((e) => e.verdict === "objects-present").map((e) => e.name),
    noEvidence: evidence.filter((e) => e.verdict === "no-visible-objects").map((e) => e.name),
  };
}

/**
 * The OpenAPI root, reduced to the shape above. Kept here (rather than in the
 * script) so the parsing the tests grade is the parsing that runs.
 */
export function liveSchemaFromOpenApi(doc: unknown): LiveSchema {
  const root = (doc ?? {}) as Record<string, unknown>;
  const defs =
    (root.definitions as Record<string, { properties?: Record<string, unknown> }> | undefined) ??
    ((root.components as { schemas?: Record<string, { properties?: Record<string, unknown> }> } | undefined)
      ?.schemas ??
      {});

  const out: LiveSchema = {};
  for (const [table, def] of Object.entries(defs)) {
    out[table.toLowerCase()] = Object.keys(def?.properties ?? {}).map((c) => c.toLowerCase());
  }
  return out;
}
