import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READ_MODELS,
  SOURCE_COLUMNS,
  NEVER_EXPOSED,
  DASHBOARD_RO_ROLE,
  isCreatable,
} from "../readModel/contract";

// MC.8 leg 2: the migration is the contract's implementation, so it gets the
// same treatment the generated doc gets — parsed and compared, not eyeballed.
// If someone adds a column to a view without adding it to contract.ts (or the
// reverse), this fails. If someone exposes a token hash or signer IP, this
// fails. That is the whole guarantee.

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0011_read_models.sql"),
  "utf8",
);

/** Column aliases of a `create or replace view <name> as select ... from ...`. */
function viewColumns(name: string): string[] {
  const header = `create or replace view ${name} as`;
  const start = SQL.indexOf(header);
  if (start === -1) throw new Error(`view not found in migration: ${name}`);
  const body = SQL.slice(start + header.length);
  const selectList = body.split(/\nfrom /)[0];
  return [...selectList.matchAll(/\bas\s+([a-z_][a-z0-9_]*)/g)].map((m) => m[1]);
}

/** Everything between the view header and its terminating semicolon. */
function viewBody(name: string): string {
  const header = `create or replace view ${name} as`;
  const start = SQL.indexOf(header);
  const body = SQL.slice(start + header.length);
  return body.slice(0, body.indexOf(";"));
}

const CREATABLE = READ_MODELS.filter(isCreatable);
const BLOCKED = READ_MODELS.filter((m) => !isCreatable(m));

describe("0011_read_models.sql implements the contract", () => {
  it("creates a view for every creatable read model and no others", () => {
    const created = [...SQL.matchAll(/create or replace view (\w+) as/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(CREATABLE.map((m) => m.id).sort());
  });

  it.each(CREATABLE.map((m) => [m.id, m] as const))(
    "%s exposes exactly the contract's columns, in order",
    (_id, model) => {
      expect(viewColumns(model.id)).toEqual(model.columns.map((c) => c.name));
    },
  );

  it("does not create views for read models with no backing store", () => {
    // A zero-row view for these would read like a working feature (MC.8 rule).
    // Named in the header comment (deliberately absent ≠ forgotten), but never
    // created — a zero-row view would read like a working feature (MC.8 rule).
    for (const m of BLOCKED) expect(SQL).not.toContain(`view ${m.id}`);
    expect(BLOCKED.map((m) => m.id)).toEqual(["rm_delivery_phases", "rm_invoices_ar"]);
  });

  it("selects only from tables the contract declares as sources", () => {
    for (const model of CREATABLE) {
      const refs = [...viewBody(model.id).matchAll(/\b(?:from|join)\s+([a-z_]+)/g)].map(
        (m) => m[1],
      );
      for (const t of refs) expect(model.sourceTables).toContain(t);
    }
  });

  it("references no column outside SOURCE_COLUMNS", () => {
    // Guards the same invented-field failure mode as the contract test, but on
    // the SQL side: `d.stage_age` would sail past a human reviewer.
    const aliases: Record<string, string> = {};
    for (const [, table, alias] of SQL.matchAll(
      /\b(?:from|join)\s+([a-z_]+)\s+([a-z_]+)\b/g,
    )) {
      if (alias === "on") continue;
      aliases[alias] = table;
    }
    for (const [, alias, column] of SQL.matchAll(/\b([a-z_]+)\.([a-z_]+)\b/g)) {
      const table = aliases[alias];
      if (!table) continue; // schema-qualified or non-alias usage
      expect(SOURCE_COLUMNS[table], `unknown source table ${table}`).toBeDefined();
      expect(SOURCE_COLUMNS[table], `${table}.${column}`).toContain(column);
    }
  });

  it("exposes nothing on the NEVER_EXPOSED list", () => {
    const aliasByTable: Record<string, string> = {
      documents: "doc",
      signature_requests: "sr",
      deals: "d",
      people: "p",
      orgs: "o",
      tasks: "t",
      signature_events: "e",
    };
    for (const forbidden of NEVER_EXPOSED) {
      const [table, column] = forbidden.split(".");
      const alias = aliasByTable[table];
      expect(alias, `no alias mapped for ${table}`).toBeDefined();
      expect(SQL).not.toContain(`${alias}.${column}`);
    }
  });
});

describe("dashboard_ro role", () => {
  it("is created NOLOGIN and granted SELECT on every created view", () => {
    expect(SQL).toContain(`create role ${DASHBOARD_RO_ROLE.name} nologin`);
    const grant = SQL.slice(SQL.indexOf("grant select on"));
    for (const m of CREATABLE) expect(grant).toContain(m.id);
  });

  it("holds no write verb and no base-table grant", () => {
    const grants = [...SQL.matchAll(/grant\s+([a-z ,]+?)\s+on\b/g)].map((m) =>
      m[1].trim(),
    );
    for (const g of grants) {
      for (const denied of DASHBOARD_RO_ROLE.denies) {
        expect(g.toLowerCase()).not.toContain(denied.toLowerCase());
      }
    }
    // The only object-level grant is on views; base tables appear solely in a
    // REVOKE. `grant usage on schema public` is the connect path, not data.
    const objectGrants = SQL.match(/grant select on ([^;]+)/)?.[1] ?? "";
    for (const table of Object.keys(SOURCE_COLUMNS)) {
      expect(objectGrants).not.toContain(table);
    }
  });

  it("revokes base-table access explicitly rather than relying on defaults", () => {
    const revoke = SQL.slice(SQL.indexOf("revoke all on"), SQL.indexOf("grant usage"));
    for (const table of Object.keys(SOURCE_COLUMNS)) expect(revoke).toContain(table);
    expect(revoke).toContain(DASHBOARD_RO_ROLE.name);
  });
});
