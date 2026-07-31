import { describe, it, expect } from "vitest";
import {
  parseMigration,
  schemaEvidence,
  evidenceReport,
  liveSchemaFromOpenApi,
} from "../schemaEvidence";

const LIVE = {
  dedup_review: ["pair_key", "status", "resolution_note"],
  companies: ["id", "name"],
};

describe("parseMigration", () => {
  it("reads created tables and added columns, ignoring their comments", () => {
    const sql = `
-- create table ghosts (this is prose, not DDL)
create table if not exists public.dedup_review (pair_key text primary key);
alter table public.companies add column if not exists founded_year int;
`;
    const p = parseMigration(sql);
    expect(p.objects).toEqual([
      { kind: "table", table: "dedup_review" },
      { kind: "column", table: "companies", column: "founded_year" },
    ]);
    expect(p.unverifiable).toEqual([]);
  });

  it("never bridges a column onto the table of an earlier statement", () => {
    // 0003's real shape, and the first run's false alarm: an ALTER on `edges`
    // followed by an ALTER on `people` reported a missing `edges.org_id`.
    const p = parseMigration(`
alter table edges add constraint edges_from_one check (num_nonnulls(from_id, from_org_id) = 1);
alter table people add column if not exists org_id text references orgs(id);
`);
    expect(p.objects).toEqual([{ kind: "column", table: "people", column: "org_id" }]);
  });

  it("keeps every column of a multi-column alter on its own table", () => {
    const p = parseMigration(
      "alter table edges add column if not exists from_org_id text, add column if not exists to_org_id text;",
    );
    expect(p.objects).toEqual([
      { kind: "column", table: "edges", column: "from_org_id" },
      { kind: "column", table: "edges", column: "to_org_id" },
    ]);
  });

  it("names what the OpenAPI root cannot see", () => {
    const p = parseMigration(`
alter table dedup_review add constraint dedup_review_status_ck check (status in ('open','merged'));
grant select on companies to reporter;
create index idx_dedup_status on dedup_review (status);
`);
    expect(p.objects).toEqual([]);
    expect(p.unverifiable).toContain("add constraint");
    expect(p.unverifiable).toContain("grant");
    expect(p.unverifiable).toContain("create index");
  });
});

describe("schemaEvidence", () => {
  it("calls a missing object proof the migration has not fully landed", () => {
    const e = schemaEvidence("0099_x.sql", "create table people_v2 (id text);", LIVE);
    expect(e.verdict).toBe("objects-missing");
    expect(e.missing).toEqual(["people_v2"]);
  });

  it("does NOT call a table's existence proof when the file also adds rules it cannot see", () => {
    // 0034's real shape: the table exists on prod (created by hand), the CHECKs do not.
    const e = schemaEvidence(
      "0034_dedup_review.sql",
      `create table if not exists dedup_review (pair_key text primary key);
       alter table dedup_review add constraint status_ck check (status in ('open'));`,
      LIVE,
    );
    expect(e.verdict).toBe("objects-present-unverifiable-rules");
    expect(e.reason).toContain("NOT proof");
  });

  it("gives no evidence either way for a grants-only migration", () => {
    const e = schemaEvidence("0032_role_read_grants.sql", "grant select (name) on companies to booker;", LIVE);
    expect(e.verdict).toBe("no-visible-objects");
  });

  it("supports applied only when every object exists and the file does nothing else", () => {
    const e = schemaEvidence("0010_companies.sql", "create table companies (id text, name text);", LIVE);
    expect(e.verdict).toBe("objects-present");
  });

  it("checks a column against its own table, not any table", () => {
    const e = schemaEvidence("0011_x.sql", "alter table companies add column status text;", LIVE);
    expect(e.verdict).toBe("objects-missing");
    expect(e.missing).toEqual(["companies.status"]);
  });
});

describe("evidenceReport", () => {
  it("buckets files and keeps supportsApplied narrow", () => {
    const r = evidenceReport(
      [
        { name: "b.sql", sql: "create table companies (id text);" },
        { name: "a.sql", sql: "create table missing_one (id text);" },
        { name: "c.sql", sql: "grant select on companies to booker;" },
        { name: "d.sql", sql: "create table dedup_review (x text); create index i on dedup_review (x);" },
      ],
      LIVE,
    );
    expect(r.evidence.map((e) => e.name)).toEqual(["a.sql", "b.sql", "c.sql", "d.sql"]);
    expect(r.notLanded).toEqual(["a.sql"]);
    expect(r.supportsApplied).toEqual(["b.sql"]);
    expect(r.noEvidence).toEqual(["c.sql"]);
    // d.sql is present-but-unverifiable: counted nowhere, on purpose.
  });
});

describe("liveSchemaFromOpenApi", () => {
  it("reads PostgREST's definitions block", () => {
    const live = liveSchemaFromOpenApi({
      definitions: { Deals: { properties: { Id: {}, amount: {} } } },
    });
    expect(live).toEqual({ deals: ["id", "amount"] });
  });

  it("survives a document with neither definitions nor components", () => {
    expect(liveSchemaFromOpenApi({})).toEqual({});
    expect(liveSchemaFromOpenApi(null)).toEqual({});
  });
});
