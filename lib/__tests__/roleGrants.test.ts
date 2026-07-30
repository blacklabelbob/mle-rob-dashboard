/**
 * Q73 rollout half — the tests that grade `lib/security/roleGrants.ts`.
 *
 * The DoD asks for "a per-role read test that fails if a booker-role token can select a
 * `quoted_amount`, `paid`, or a phone/email column it should not — code, not a config
 * screenshot (CR-3)". That test cannot connect to prod, because the grants are NOT APPLIED and
 * applying them is Rob's call. So it is driven one layer in, against the artifact that WILL be
 * applied: the generated SQL. If `quoted_amount` is absent from every booker GRANT in the
 * migration, then a booker token cannot select it once the migration lands — and this file
 * fails the day someone edits the model into granting it back.
 *
 * The drift check is the other half of that argument: the committed migration must be exactly
 * what the generator produces from the model, or these assertions grade a file nobody applies.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALLOWANCES,
  COVERED_TABLES,
  DENIALS,
  READ_ROLES,
  grantBreaches,
  permittedColumns,
  renderRoleGrantSql,
  uncoveredSensitive,
  type ReadRole,
} from "@/lib/security/roleGrants";

// @ts-expect-error — plain .mjs helpers, deliberately shared with the audit script.
import { readSchema, stripComments, splitTop } from "../../scripts/lib/schema-from-migrations.mjs";
// @ts-expect-error — same.
import { sensitiveByTable, MONEY, PII, hits } from "../../scripts/lib/sensitive-columns.mjs";

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATION = join(REPO_ROOT, "supabase/migrations/0032_role_read_grants.sql");

const schema: Map<string, Set<string>> = readSchema();
const sensitive: Map<string, string[]> = sensitiveByTable(schema);
const sql = renderRoleGrantSql(schema);

/** The exact column list a role is granted on a table, read back out of the generated SQL. */
function grantedInSql(table: string, role: ReadRole): string[] {
  const re = new RegExp(`grant select \\(([^)]*)\\) on public\\.${table} to ${role};`);
  const m = re.exec(sql);
  if (!m) throw new Error(`no grant for ${role} on ${table} in the generated SQL`);
  return m[1].split(",").map((c) => c.trim());
}

describe("the model is internally sound", () => {
  it("has no breaches against the real schema", () => {
    // The generator refuses to write on any breach, so a red here is a build that cannot ship.
    expect(grantBreaches(schema, sensitive)).toEqual([]);
  });

  it("decides every money/PII column on every table it covers", () => {
    const decided = new Set([
      ...DENIALS.map((d) => `${d.table}.${d.column}`),
      ...ALLOWANCES.map((a) => `${a.table}.${a.column}`),
    ]);
    const undecided: string[] = [];
    for (const table of COVERED_TABLES) {
      for (const col of sensitive.get(table) ?? []) {
        if (!decided.has(`${table}.${col}`)) undecided.push(`${table}.${col}`);
      }
    }
    expect(undecided).toEqual([]);
  });

  it("states every reason, on both lists", () => {
    for (const d of DENIALS) expect(d.because.trim(), `${d.table}.${d.column}`).not.toBe("");
    for (const a of ALLOWANCES) expect(a.because.trim(), `${a.table}.${a.column}`).not.toBe("");
  });

  it("names no column twice across the two lists", () => {
    const keys = [
      ...DENIALS.map((d) => `${d.table}.${d.column}`),
      ...ALLOWANCES.map((a) => `${a.table}.${a.column}`),
    ];
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("reports the sensitive tables it does NOT cover instead of implying completeness", () => {
    const uncovered = uncoveredSensitive(sensitive);
    expect(uncovered.length).toBeGreaterThan(0);
    for (const u of uncovered) {
      expect(COVERED_TABLES).not.toContain(u.table);
      expect(u.columns.length).toBeGreaterThan(0);
    }
  });
});

describe("grantBreaches fails in both directions", () => {
  const realSchema = () => new Map([["people", new Set(["id", "name", "phone"])]]);

  it("flags a denial naming a column that does not exist — a typo protects nothing", () => {
    const b = grantBreaches(new Map([["people", new Set(["id"])]]), new Map([["people", []]]));
    expect(b.some((x) => x.kind === "unknown-column")).toBe(true);
  });

  it("flags a denial naming a table that is in no migration", () => {
    const b = grantBreaches(new Map(), new Map());
    expect(b.some((x) => x.kind === "unknown-table")).toBe(true);
  });

  it("flags a sensitive column on a covered table that nobody decided", () => {
    // `people.phone` sensitive, but pretend neither list mentions it by dropping the
    // allowance's table from the schema's sensitive map is not enough — assert on the real
    // model instead, which currently decides it, then on a synthetic gap.
    const b = grantBreaches(realSchema(), new Map([["people", ["id"]]]));
    expect(b.some((x) => x.kind === "undecided-sensitive" && x.detail.includes("people.id"))).toBe(true);
  });

  it("does not flag a sensitive column that is deliberately granted", () => {
    const b = grantBreaches(schema, sensitive);
    for (const a of ALLOWANCES) {
      expect(b.some((x) => x.detail.startsWith(`${a.table}.${a.column} is money/PII`))).toBe(false);
    }
  });
});

describe("the DoD's own refusals, read out of the generated SQL", () => {
  it("withholds quoted_amount from BOTH new roles, on people and orgs", () => {
    for (const table of ["people", "orgs"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}`).not.toContain("quoted_amount");
      }
    }
  });

  it("withholds the invoice ledger's paid-state — the `paid` the DoD names", () => {
    for (const role of READ_ROLES) {
      const cols = grantedInSql("invoice_ledger", role);
      expect(cols).not.toContain("payment_state");
      expect(cols).not.toContain("amount");
    }
  });

  it("withholds equity from both roles everywhere it exists (Q41 owners-only)", () => {
    for (const table of ["people", "orgs", "deals"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}`).not.toContain("equity");
      }
    }
  });

  it("withholds the e-sign audit trail from both roles", () => {
    for (const role of READ_ROLES) {
      const cols = grantedInSql("signature_requests", role);
      for (const col of ["signer_name", "signer_email", "signer_ip", "signer_user_agent"]) {
        expect(cols, `${role}`).not.toContain(col);
      }
    }
  });

  it("withholds a booker from deal size and from other people's recordings", () => {
    expect(grantedInSql("deals", "mle_booker_read")).not.toContain("value");
    expect(grantedInSql("people", "mle_booker_read")).not.toContain("transcript_url");
    // …and the rep, whose working number it is, keeps deal value.
    expect(grantedInSql("deals", "mle_rep_read")).toContain("value");
  });

  it("KEEPS phone and email for both roles — outreach is the job, not a leak", () => {
    // The inverse assertion matters as much: a model that withheld these would pass every
    // test above while making the roles useless, and someone would quietly drop the roles.
    for (const table of ["people", "orgs"]) {
      for (const role of READ_ROLES) {
        expect(grantedInSql(table, role), `${role} on ${table}`).toContain("phone");
        expect(grantedInSql(table, role), `${role} on ${table}`).toContain("email");
      }
    }
  });

  it("grants only columns that actually exist on the table", () => {
    for (const table of COVERED_TABLES) {
      const real = schema.get(table) ?? new Set<string>();
      for (const role of READ_ROLES) {
        for (const col of grantedInSql(table, role)) {
          expect(real.has(col), `${table}.${col} granted but not in any migration`).toBe(true);
        }
      }
    }
  });

  it("revokes table-level SELECT before granting a column list", () => {
    // A table-level GRANT cannot be narrowed by a column-level REVOKE, so the revoke MUST
    // precede the grant or every denial above is decorative.
    for (const table of COVERED_TABLES) {
      for (const role of READ_ROLES) {
        const revoke = sql.indexOf(`revoke select on public.${table} from ${role};`);
        const grant = sql.indexOf(`grant select (`, revoke);
        expect(revoke, `${role} on ${table}`).toBeGreaterThan(-1);
        expect(grant).toBeGreaterThan(revoke);
      }
    }
  });

  it("never touches service_role, which every server route reads through", () => {
    expect(sql).not.toMatch(/revoke[^\n]*service_role/);
    expect(sql).toContain("service_role is deliberately untouched");
  });

  it("says NOT APPLIED in the file itself, not only in the queue", () => {
    expect(sql).toContain("*** NOT APPLIED. ***");
  });
});

describe("permittedColumns", () => {
  it("subtracts only what the given role is denied", () => {
    const all = ["id", "value", "equity", "stage"];
    expect(permittedColumns("deals", all, "mle_rep_read")).toEqual(["id", "stage", "value"]);
    expect(permittedColumns("deals", all, "mle_booker_read")).toEqual(["id", "stage"]);
  });

  it("leaves an uncovered table untouched", () => {
    expect(permittedColumns("verticals", ["id", "name"], "mle_booker_read")).toEqual(["id", "name"]);
  });
});

describe("the committed migration has not drifted from the model", () => {
  it("is byte-identical to the generator's output", () => {
    // Without this, every assertion above grades a string this test built in memory while the
    // file `supabase db push` would actually apply says something else.
    expect(readFileSync(MIGRATION, "utf8")).toBe(sql);
  });
});

describe("stripComments — the parser fix this increment rests on", () => {
  it("does not read a comma-carrying comment sentence as a column", () => {
    const body = `create table if not exists t (
  -- an amount is counted, never coerced to 0.
  issue_date text not null,
  amount numeric
);`;
    const cols = readSchemaFrom(body).get("t")!;
    expect(cols.has("never")).toBe(false);
    expect(cols.has("issue_date")).toBe(true);
    expect(cols.has("amount")).toBe(true);
  });

  it("keeps a -- that lives inside a string literal", () => {
    const kept = stripComments("select 'a--b' , x -- gone\n");
    expect(kept).toContain("'a--b'");
    expect(kept).not.toContain("gone");
  });

  it("keeps a dollar-quoted body intact", () => {
    const kept = stripComments("do $$ -- inner\nbegin end $$; -- outer\n");
    expect(kept).toContain("-- inner");
    expect(kept).not.toContain("outer");
  });

  it("blanks a block comment without eating the newlines around it", () => {
    const kept = stripComments("a\n/* x\ny */\nb");
    expect(kept.split("\n").length).toBe(4);
    expect(kept).not.toContain("x");
  });

  it("preserves length, so splitTop's paren depth cannot be thrown by prose", () => {
    const src = "-- a (unclosed paren in prose\ncreate table t (id uuid);";
    expect(stripComments(src).length).toBe(src.length);
    expect(splitTop(stripComments(src))).toBeDefined();
  });

  it("proves the real invoice_ledger no longer carries invented columns", () => {
    const cols = schema.get("invoice_ledger")!;
    for (const invented of ["never", "not", "plus", "which"]) {
      expect(cols.has(invented), `${invented} is comment prose, not a column`).toBe(false);
    }
    for (const real of ["issue_date", "status_text", "due_date", "source_sha256"]) {
      expect(cols.has(real), `${real} was swallowed by the old parser`).toBe(true);
    }
  });
});

describe("the classifier is shared, not copied", () => {
  it("still calls the audit's own worst columns sensitive", () => {
    expect(hits("quoted_amount", MONEY)).toBe(true);
    expect(hits("equity", MONEY)).toBe(true);
    expect(hits("signer_email", PII)).toBe(true);
    expect(hits("phone", PII)).toBe(true);
  });

  it("classifies by name only, which is why every count is a floor", () => {
    expect(hits("notes", MONEY) || hits("notes", PII)).toBe(false);
    expect(hits("payload", MONEY) || hits("payload", PII)).toBe(false);
  });
});

/** Parse a one-off SQL string through the real reader, via a temp dir. */
function readSchemaFrom(sqlText: string): Map<string, Set<string>> {
  const { mkdtempSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "rolegrants-"));
  writeFileSync(join(dir, "0001_t.sql"), sqlText);
  return readSchema(dir);
}
