import { describe, it, expect } from "vitest";
import {
  parseMigration,
  schemaEvidence,
  evidenceReport,
  liveSchemaFromOpenApi,
  liveRpcsFromOpenApi,
  liveShapeFromOpenApi,
  evidenceCeiling,
  parserEmittableLabels,
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

// ── inc.53: functions ──────────────────────────────────────────────────────────
// inc.52 declared every `create function` invisible. Half of that was true. The
// OpenAPI root lists exposed functions as `/rpc/<name>`, so a plain SQL function
// IS adjudicable; a `returns trigger` one never is, and neither is one created
// outside the exposed schema. These pin the split in both directions, because
// getting it wrong in the generous direction closes a backlog row on a guess.

const SHAPE = { tables: LIVE, rpcs: ["filter_page", "has_entity_access"] };

describe("functions", () => {
  it("treats a plain function as a visible object and finds it on prod", () => {
    const e = schemaEvidence("x.sql", "create or replace function filter_page(v jsonb)\nreturns setof record\nas $$ select 1; $$ language sql;", SHAPE);
    expect(e.present).toContain("filter_page()");
    expect(e.verdict).toBe("objects-present");
    expect(e.unverifiable).not.toContain("create function");
  });

  it("reports a plain function prod does not expose as MISSING — the one direction that is proof", () => {
    const e = schemaEvidence("x.sql", "create function ghost_fn(v jsonb) returns boolean as $$ select true; $$ language sql;", SHAPE);
    expect(e.missing).toEqual(["ghost_fn()"]);
    expect(e.verdict).toBe("objects-missing");
  });

  it("never adjudicates a trigger function — PostgREST cannot expose one, so it is honestly permanent", () => {
    const { objects, unverifiable } = parseMigration(
      "create or replace function public.touch_rows()\nreturns trigger\nlanguage plpgsql as $$ begin return new; end; $$;",
    );
    expect(objects).toEqual([]);
    expect(unverifiable).toContain("create trigger function");
  });

  it("does not bridge one definition's return type into the next", () => {
    const { objects, unverifiable } = parseMigration(
      [
        "create function public.touch_a() returns trigger as $$ begin return new; end; $$ language plpgsql;",
        "create function public.rank_it(a text) returns int as $$ select 1; $$ language sql;",
      ].join("\n"),
    );
    expect(unverifiable).toContain("create trigger function");
    expect(objects).toEqual([{ kind: "function", name: "rank_it" }]);
  });

  it("withholds a verdict on a function outside the exposed schema rather than calling it missing", () => {
    const e = schemaEvidence("x.sql", "create function auth.secret_fn() returns boolean as $$ select true; $$ language sql;", SHAPE);
    expect(e.missing).toEqual([]);
    expect(e.unverifiable).toContain("create function in schema auth");
  });

  it("withholds a function verdict entirely when the caller supplied no rpc list", () => {
    const e = schemaEvidence("x.sql", "create function ghost_fn() returns boolean as $$ select true; $$ language sql;", LIVE);
    expect(e.missing).toEqual([]);
    expect(e.unverifiable).toContain("create function");
    expect(e.verdict).toBe("no-visible-objects");
  });
});

describe("liveRpcsFromOpenApi", () => {
  it("reads /rpc/ paths and only those", () => {
    const doc = { paths: { "/": {}, "/orgs": {}, "/rpc/filter_page": {}, "/rpc/Has_Entity_Access": {} } };
    expect(liveRpcsFromOpenApi(doc)).toEqual(["filter_page", "has_entity_access"]);
    expect(liveRpcsFromOpenApi({})).toEqual([]);
    expect(liveShapeFromOpenApi(doc).rpcs).toEqual(["filter_page", "has_entity_access"]);
  });
});

describe("evidenceCeiling — can this file EVER be adjudicated read-only", () => {
  it("calls a grant-only file probeable: a read with the right key would settle it", () => {
    const c = evidenceCeiling(["grant"]);
    expect(c.ceiling).toBe("probeable-read-only");
    expect(c.probeable).toEqual(["grant"]);
  });

  it("calls constraints, triggers and indexes permanent — a write or a query plan is not a read", () => {
    for (const label of ["add constraint", "check constraint", "create trigger", "create trigger function", "create index"]) {
      expect(evidenceCeiling([label]).ceiling).toBe("permanent");
    }
  });

  it("caps a file on its WEAKEST statement, exactly like the verdict does", () => {
    // The grant could be probed; the index never can. The FILE is permanent.
    const c = evidenceCeiling(["grant", "create index"]);
    expect(c.ceiling).toBe("permanent");
    expect(c.probeable).toEqual(["grant"]);
    expect(c.permanent).toEqual(["create index"]);
  });

  it("reports an unrecognised label instead of folding it into either answer", () => {
    // Assuming "permanent" would stop anyone looking; assuming "probeable"
    // would send them looking for the wrong thing. Neither guess is allowed.
    // inc.55: the example is a label the parser CANNOT emit today, because every
    // label it can emit now has a home — that is the parity test below. This one
    // stands for the next label somebody adds to UNVERIFIABLE.
    const c = evidenceCeiling(["create extension", "grant"]);
    expect(c.ceiling).toBe("unclassified");
    expect(c.unclassified).toEqual(["create extension"]);
  });

  it("gives every label the parser can emit a home — a homeless one reads as 'not yet' forever", () => {
    // This is the rule with teeth. `create type` and `create function in schema x`
    // were both emitted by the parser and classified by nothing, so any file
    // carrying them would have reported `unclassified` — which the report prints
    // as "do not assume either way", i.e. indistinguishable from pending work.
    for (const label of parserEmittableLabels()) {
      expect(evidenceCeiling([label]).unclassified, `${label} has no ceiling classification`).toEqual([]);
    }
  });

  it("settles create type by a READ, and an unexposed function's schema by nothing", () => {
    // An enum's values arrive on any exposed column of that type, in the same
    // OpenAPI root this grader already fetches — the weakest access there is.
    expect(evidenceCeiling(["create type"]).ceiling).toBe("probeable-read-only");
    // PostgREST publishes one schema. A function outside it is never callable
    // through the data API at all, so no read, write or plan reaches it.
    const c = evidenceCeiling(["create function in schema private"]);
    expect(c.ceiling).toBe("permanent");
    expect(c.reason).toContain("does not expose");
  });

  it("attaches the ceiling to a blind file so 'no evidence' stops reading as 'not yet'", () => {
    const e = schemaEvidence("0032.sql", "grant select (id, name) on public.companies to app_reader;", SHAPE);
    expect(e.verdict).toBe("no-visible-objects");
    expect(e.ceiling?.ceiling).toBe("probeable-read-only");
    expect(e.reason).toContain("read-only probe");
  });

  it("splits the noEvidence bucket, and the three lists always sum to it", () => {
    const r = evidenceReport(
      [
        { name: "a.sql", sql: "grant select on public.companies to app_reader;" },
        { name: "b.sql", sql: "create index idx_a on companies (name);" },
        { name: "c.sql", sql: "create type mood as enum ('ok');" },
        { name: "d.sql", sql: "create table companies (id text);" },
      ],
      SHAPE,
    );
    expect(r.noEvidence).toEqual(["a.sql", "b.sql", "c.sql"]);
    // inc.55: c.sql's `create type` moved from unclassified to probeable, so no
    // SQL a human can write lands in `unclassified` any more — that bucket now
    // means "somebody added a label and skipped the ceiling", nothing else.
    expect(r.noEvidenceCeiling.probeable).toEqual(["a.sql", "c.sql"]);
    expect(r.noEvidenceCeiling.permanent).toEqual(["b.sql"]);
    expect(r.noEvidenceCeiling.unclassified).toEqual([]);
    const { probeable, permanent, unclassified } = r.noEvidenceCeiling;
    expect(probeable.length + permanent.length + unclassified.length).toBe(r.noEvidence.length);
  });
});
