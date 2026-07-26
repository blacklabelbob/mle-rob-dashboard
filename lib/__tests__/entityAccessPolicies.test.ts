import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACCESS_ENTITY_TYPES,
  ACCESS_LEVELS,
  SUBJECT_TYPES,
  accessLevelRank,
} from "../entityAccess";

/**
 * Q66 inc.2 — the ENFORCEMENT half.
 *
 * These are the tests you can run without a database. The "non-owner read returns zero
 * rows" clause of the DoD is a live-database fact and is proved on prod in an aborted
 * transaction (script at the foot of 0018); what CAN be pinned here — and is worth more
 * over time — is that the SQL policies and the TypeScript ladder never drift apart, and
 * that the two fail-closed properties this design rests on stay written down in SQL.
 *
 * The failure this file exists to catch: a policy is one string literal away from being
 * wide open. `has_entity_access('person', id, 'read')` — 'read' is not a level, it ranks
 * 0, and without the `> 0` guard in the predicate `rank(held) >= 0` is true for EVERY
 * grant row. That is a silent, total breach introduced by a typo, and no database error
 * would ever mention it.
 */

const MIGRATION = "supabase/migrations/0018_entity_access_policies.sql";
const SQL = readFileSync(path.join(process.cwd(), MIGRATION), "utf8");

/** Strip `--` comments so prose in the header can never satisfy an assertion. */
const CODE = SQL.split("\n")
  .map((line) => {
    const i = line.indexOf("--");
    return i === -1 ? line : line.slice(0, i);
  })
  .join("\n");

/** Every `has_entity_access('<entity>', <expr>, '<level>')` call site in the migration. */
const CALL_SITES = [
  ...CODE.matchAll(
    /has_entity_access\(\s*(?:'([a-z_]+)'|([A-Za-z_.]+))\s*,\s*[A-Za-z_.]+\s*,\s*'([a-z_]+)'\s*\)/g,
  ),
].map((m) => ({ entityLiteral: m[1] ?? null, entityExpr: m[2] ?? null, level: m[3] }));

describe("0018 <-> lib parity", () => {
  it("every required level named in a policy is a real level", () => {
    expect(CALL_SITES.length).toBeGreaterThan(0);
    for (const site of CALL_SITES) {
      expect(ACCESS_LEVELS as readonly string[]).toContain(site.level);
      // Belt and braces: the rank guard in the predicate keys off this being non-zero.
      expect(accessLevelRank(site.level)).toBeGreaterThan(0);
    }
  });

  it("every entity kind named in a policy is a real entity kind", () => {
    const literals = CALL_SITES.map((s) => s.entityLiteral).filter(
      (v): v is string => v !== null,
    );
    expect(literals.length).toBeGreaterThan(0);
    for (const kind of literals) {
      expect(ACCESS_ENTITY_TYPES as readonly string[]).toContain(kind);
    }
  });

  it("current_access_subjects emits exactly the SUBJECT_TYPES the TS ladder knows", () => {
    const fn = CODE.slice(
      CODE.indexOf("create or replace function current_access_subjects"),
      CODE.indexOf("create or replace function has_entity_access"),
    );
    const emitted = [...fn.matchAll(/select '([a-z_]+)'::text/g)].map((m) => m[1]);
    // Same set AND no extras: a fourth subject kind in SQL that expandSubjects() cannot
    // produce is a grant nobody can audit from the app.
    expect([...emitted].sort()).toEqual([...SUBJECT_TYPES].sort());
  });
});

describe("the two fail-closed properties, pinned in SQL", () => {
  it("the predicate refuses an unrecognised required level", () => {
    // Without this, a typo'd level opens the table instead of closing it.
    expect(CODE).toMatch(/access_level_rank\(\s*p_required_level\s*\)\s*>\s*0/);
    expect(accessLevelRank("read")).toBe(0);
  });

  it("levels are compared by rank, never as text", () => {
    // 'view' >= 'owner' is TRUE in text collation — a raw string >= grants a viewer
    // everything. There must be no bare comparison of access_level against a literal.
    expect(CODE).toMatch(
      /access_level_rank\(ea\.access_level\)\s*\n?\s*>=\s*access_level_rank\(p_required_level\)/,
    );
    expect(CODE).not.toMatch(/ea\.access_level\s*>=\s*'/);
  });

  it("the predicate is SECURITY DEFINER with a pinned search_path", () => {
    // DEFINER is required (the predicate reads the RLS-protected grant table); pinning
    // search_path is what stops a caller shadowing entity_access with their own table.
    expect(CODE).toMatch(/security definer/);
    expect(CODE).toMatch(/set search_path = public/);
  });
});

describe("scope of the increment, enforced", () => {
  const policies = [...CODE.matchAll(/create policy (\w+) on (\w+)\s+for (\w+)/g)].map(
    (m) => ({ name: m[1], table: m[2], command: m[3] }),
  );

  it("covers people, orgs, deals and the grant table itself", () => {
    expect(policies.map((p) => p.table).sort()).toEqual([
      "deals",
      "entity_access",
      "orgs",
      "people",
    ]);
  });

  it("creates SELECT policies only — writes stay service-role-only", () => {
    // Q66 inc.2 claims to be read-enforcement. A write policy landing here without the
    // identity model (Q6) would invent an authorship rule Rob has not decided.
    for (const p of policies) expect(p.command).toBe("select");
    expect(CODE).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });

  it("grants execute only to the roles that are actually subject to RLS", () => {
    // service_role bypasses RLS and never calls these; dashboard_ro (0011) sees views.
    expect(CODE).toMatch(/grant execute on function current_access_subjects\(\) to anon, authenticated/);
    expect(CODE).toMatch(/grant execute on function has_entity_access\(text, text, text\) to anon, authenticated/);
    expect(CODE).not.toMatch(/to\s+dashboard_ro/);
  });

  it("adds no table and enables RLS nowhere — 0017 already did that", () => {
    expect(CODE).not.toMatch(/create table/);
    expect(CODE).not.toMatch(/enable row level security/);
  });
});
