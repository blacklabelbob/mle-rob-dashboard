import { describe, it, expect } from "vitest";
import {
  parseMigration,
  schemaEvidence,
  evidenceReport,
  liveSchemaFromOpenApi,
  liveRpcsFromOpenApi,
  liveShapeFromOpenApi,
  evidenceCeiling,
  splitStatements,
  unrecognisedStatements,
  UNRECOGNISED_LABEL,
  COMMENT_UNGRADED,
  COMMENT_UNEXPOSED,
  humanDescription,
  parserEmittableLabels,
  statementsToGrade,
  doBlockBody,
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
    // LABELLED statement lands in `unclassified` any more.
    //
    // inc.56 correction — that comment used to read "no SQL a human can write",
    // and that was false in the direction that mattered: a statement the parser
    // labels nothing for (`comment on`, `do $$ … $$`, `drop trigger`) now emits
    // an `unrecognised statement:` label, which lands here on purpose. So the
    // bucket means one of two things, both worth reading: a label added without
    // a ceiling, or a shape nobody has classified yet. The four statements below
    // are all recognised, which is why this list is still empty.
    expect(r.noEvidenceCeiling.probeable).toEqual(["a.sql", "c.sql"]);
    expect(r.noEvidenceCeiling.permanent).toEqual(["b.sql"]);
    expect(r.noEvidenceCeiling.unclassified).toEqual([]);
    const { probeable, permanent, unclassified } = r.noEvidenceCeiling;
    expect(probeable.length + permanent.length + unclassified.length).toBe(r.noEvidence.length);
  });
});

/**
 * inc.56 — the inverse of inc.55's failure. inc.55 fixed labels the ceiling did
 * not classify; these cover statements the parser never labels at all, which let
 * a file report the STRONGEST verdict for a reason nobody checked.
 */
describe("statement coverage (inc.56)", () => {
  it("does not split on a semicolon inside a function body or a string", () => {
    const sql = `
      create function bump() returns trigger as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$ language plpgsql;
      insert into notes (body) values ('a; b; c');
    `;
    // Two statements, not seven — the six inner semicolons are body text.
    expect(splitStatements(sql)).toHaveLength(2);
    expect(unrecognisedStatements(sql)).toEqual([]);
  });

  it("reports a statement shape no rule claims, and names it", () => {
    // Re-aimed inc.57: `comment on … is '…'` is now a graded object, not an
    // unrecognised shape. `comment on … is null` still is — its evidence runs the
    // opposite way and nobody has built that, so it must not be quietly claimed.
    expect(unrecognisedStatements("comment on column people.phase2_estimate is null;")).toEqual([
      "comment on column people.phase2_estimate",
    ]);
    // Re-aimed inc.60: the DO WRAPPER is no longer the unrecognised shape — the
    // block is opened and its body graded, so what surfaces is the statement
    // inside it. A bare `null` is PL/pgSQL's no-op and could plausibly join
    // NO_EFFECT, but ZERO migrations write one (measured 2026-08-01), and a rule
    // for a shape nobody wrote is the assertion this ladder exists to kill. So it
    // stays loud, and the day someone writes one it will say so by name.
    expect(unrecognisedStatements("do $$ begin if true then null; end if; end $$;")).toEqual(["null"]);
  });

  it("ignores statements that leave nothing behind for any read to differ on", () => {
    expect(unrecognisedStatements("begin; commit; set search_path = public; reset role;")).toEqual([]);
  });

  it("treats a TEMP table as leaving nothing behind — 0031, live (inc.59)", () => {
    // Session-scoped: it cannot outlive the migration, so no later read, write or
    // plan differs on it. All four spellings, since the SQL standard allows them.
    for (const stmt of [
      "create temporary table _people_renumber on commit drop as select id from people;",
      "create temp table t as select 1;",
      "create global temporary table t (a int);",
      "create local temp table t (a int);",
    ]) {
      expect(unrecognisedStatements(stmt)).toEqual([]);
    }
    // …and it must never be read as a table prod should be carrying. A phantom
    // object here would report `_people_renumber` MISSING and declare an applied
    // migration unapplied — the loudest possible wrong verdict on this ladder.
    const p = parseMigration("create temporary table _people_renumber on commit drop as select id from people;");
    expect(p.objects).toEqual([]);
    expect(p.unverifiable).toEqual([]);
  });

  it("does NOT wave through an UNLOGGED table — durable, not session-scoped (inc.59)", () => {
    // The near-miss neighbour of the rule above: `unlogged` is not crash-safe but
    // it IS durable, so it must not ride the temp exemption. It stays LOUD —
    // unrecognised, therefore `unclassified` — rather than silently excused.
    // No parse rule is added for it: zero migrations write one (measured
    // 2026-08-01), and inc.56's coverage check is what will name it the day one
    // does. This pins which side of the line it falls on, not a rule for it.
    expect(unrecognisedStatements("create unlogged table keep_me (a int);")).toEqual([
      "create unlogged table keep_me",
    ]);
    expect(evidenceCeiling([`${UNRECOGNISED_LABEL}create unlogged table keep_me`]).ceiling).toBe("unclassified");
  });

  it("does not invent a `drop sequence` rule for a shape nobody has written (inc.59)", () => {
    // Same discipline inc.58 applied to `drop index` / `drop function`: the twin
    // is imaginable, but zero migrations write it (measured 2026-08-01), so it
    // gets no capping label — it surfaces loudly instead.
    // It earns no capping label of its own — what it carries is the loud
    // unrecognised marker, which is the whole difference being pinned here.
    expect(parseMigration("drop sequence people_record_no_seq;").unverifiable).toEqual([
      `${UNRECOGNISED_LABEL}drop sequence people_record_no_seq`,
    ]);
    expect(unrecognisedStatements("drop sequence people_record_no_seq;")).toEqual(["drop sequence people_record_no_seq"]);
  });

  it("excuses the verification echo at the end of 0004 — and NOTHING wider (inc.61)", () => {
    // The one shape a human was actually seen to write: 0004_flags.sql closes
    // with a count of what it just inserted. It is a read that leaves nothing
    // behind, so it belongs on NO_EFFECT's side of the line, not in the loud
    // bucket. The whole statement is matched — an alias and a schema qualifier
    // are the only variation allowed.
    expect(unrecognisedStatements("select count(*) as flags from flags;")).toEqual([]);
    expect(unrecognisedStatements("select count(*) from public.flags;")).toEqual([]);
    expect(unrecognisedStatements('select count( * ) as "n rows" from "flags";')).toEqual([]);
  });

  it("keeps every OTHER select loud — a token match on `select` would write rows (inc.61)", () => {
    // This is the reason the rule above is anchored at both ends rather than
    // written `^select`. Each of these leads with `select` and each of them does
    // real work; a leading-token exemption would wave all five through and they
    // would never be seen again.
    const writes = [
      "select count(*) into totals from flags",
      "select nextval('people_record_no_seq')",
      "select backfill_everything()",
      "select count(*) from flags where slow_fn(id)",
    ];
    for (const stmt of writes) {
      expect(unrecognisedStatements(`${stmt};`)).toHaveLength(1);
    }
    // The fifth shape is the one that proves the point differently, and it is
    // asserted as what it actually is rather than lumped in above: a writing CTE
    // leads with `with`, and the `insert` inside it is already claimed as
    // `data change` — so it is capped, not excused. Either way it is not silent.
    expect(
      parseMigration("with moved as (insert into flags (title) values ('x') returning id) select count(*) from moved;")
        .unverifiable,
    ).toEqual(["data change"]);
    // And 0031's real one — it assigns a variable that drives an `execute
    // format(…)`, so it is work and stays exactly where inc.56 put it.
    expect(
      unrecognisedStatements("select string_agg(quote_ident(a.attname), ', ') into cols from pg_attribute a;"),
    ).toEqual(["select string_agg(quote_ident(a.attname), ', ')"]);
  });

  it("does not excuse an unlisted change just because it leads with a claimed word", () => {
    // `alter table … set default` leads with `alter`, so ALTER_TABLE claims it —
    // this pins the known hole rather than pretending it is covered.
    expect(unrecognisedStatements("alter table people alter column tier set default 'a';")).toEqual([]);
    // But a bare `set` is session-only and genuinely no-effect.
    expect(unrecognisedStatements("set local role app_reader;")).toEqual([]);
  });

  it("STOPS a file claiming 'does nothing else' when it does something unread", () => {
    // 0014_phase2_estimate.sql, live: it reported `objects-present` — "all exist
    // on prod and this file does nothing else" — while running two COMMENT ONs.
    const sql = `
      alter table people add column phase2_estimate numeric;
      comment on column people.phase2_estimate is 'phase 2 estimate';
    `;
    // Re-aimed inc.57: the caller supplies no `documented` list, so the comment is
    // WITHHELD — never graded missing — and the withholding itself caps the file.
    const e = schemaEvidence("0014.sql", sql, { people: ["id", "phase2_estimate"] });
    expect(e.verdict).toBe("objects-present-unverifiable-rules");
    expect(e.unverifiable).toContain(COMMENT_UNGRADED);
    expect(e.missing).toEqual([]);
  });

  it("lands an unrecognised statement in `unclassified` — deliberately, not by omission", () => {
    const c = evidenceCeiling(["unrecognised statement: comment on table x"]);
    expect(c.ceiling).toBe("unclassified");
    expect(c.reason).toContain("do not assume either way");
    // And it stays out of parserEmittableLabels: that list is held to the three
    // ceiling sets by a test, so listing these would force a classification for
    // a shape nobody has read — the guess this whole module exists to kill.
    expect(parserEmittableLabels().some((l) => l.startsWith(UNRECOGNISED_LABEL))) .toBe(false);
  });
});

/**
 * inc.57 — `comment on` was handed over as catalog-only and therefore permanent.
 * Prod disagreed: PostgREST renders every comment into the same OpenAPI root this
 * module already fetches. These pin both the new evidence and the two ways it can
 * lie — a generated note read as documentation, and an ungradable comment read as
 * missing.
 */
describe("schemaEvidence — comment on (inc.57)", () => {
  const live = {
    tables: { people: ["id", "phase2_estimate"], dedup_review: ["pair_key", "status"] },
    rpcs: ["filter_page"],
    documented: ["column:people.phase2_estimate", "function:filter_page"],
  };

  it("grades a comment prod publishes as PRESENT", () => {
    const e = schemaEvidence(
      "0014.sql",
      "alter table people add column phase2_estimate numeric; comment on column people.phase2_estimate is 'x';",
      live,
    );
    expect(e.verdict).toBe("objects-present");
    expect(e.present).toContain("comment on column people.phase2_estimate");
  });

  it("grades a comment prod does NOT publish as MISSING — the 0034 case, live", () => {
    // The dedup_review TABLE exists on prod (created by hand — inc.50), so object
    // presence alone said nothing. Its comments are absent, which is independent
    // evidence for the PENDING marker rather than a restatement of it.
    const e = schemaEvidence(
      "0034.sql",
      "create table if not exists dedup_review (pair_key text primary key); comment on table dedup_review is 'q84';",
      live,
    );
    expect(e.verdict).toBe("objects-missing");
    expect(e.missing).toEqual(["comment on table dedup_review"]);
  });

  it("reads a function comment off its /rpc path, and qualified + argument forms of the name", () => {
    const e = schemaEvidence("0020.sql", "comment on function public.filter_page(text, jsonb) is 'q67';", live);
    expect(e.verdict).toBe("objects-present");
    expect(e.present).toEqual(["comment on function filter_page"]);
  });

  it("does NOT count PostgREST's own PK/FK note as a human comment", () => {
    // Otherwise every primary key in the database reports a comment that landed —
    // the false-positive twin of inc.52's invented column.
    expect(humanDescription("Note:\nThis is a Primary Key.<pk/>")).toBe("");
    expect(humanDescription("what a human wrote\n\nNote:\nThis is a Primary Key.<pk/>")).toBe("what a human wrote");
    const doc = {
      definitions: {
        people: {
          properties: {
            id: { description: "Note:\nThis is a Primary Key.<pk/>" },
            phase2_estimate: { description: "ROI inputs" },
          },
        },
      },
    };
    expect(liveShapeFromOpenApi(doc).documented).toEqual(["column:people.phase2_estimate"]);
  });

  it("withholds — never reports missing — when the comment cannot be graded", () => {
    // No descriptions supplied: absence of evidence is not evidence of absence,
    // exactly as with `rpcs`.
    const bare = schemaEvidence("x.sql", "comment on table people is 'x';", { people: ["id"] });
    expect(bare.missing).toEqual([]);
    expect(bare.unverifiable).toContain(COMMENT_UNGRADED);
    // And a comment on something prod does not expose: no description can exist
    // for an object the data API does not publish.
    const hidden = schemaEvidence("y.sql", "comment on table private_audit is 'x';", live);
    expect(hidden.missing).toEqual([]);
    expect(hidden.unverifiable).toContain(COMMENT_UNEXPOSED);
    expect(evidenceCeiling([COMMENT_UNEXPOSED]).ceiling).toBe("permanent");
    expect(evidenceCeiling([COMMENT_UNGRADED]).ceiling).toBe("probeable-read-only");
  });

  it("reads comments per statement, so a target cannot bridge from a neighbour", () => {
    // inc.52's invented column came from exactly this bridge.
    const { objects } = parseMigration("comment on table people is 'a'; comment on column orgs.equity is 'b';");
    expect(objects.filter((o) => o.kind === "comment")).toEqual([
      { kind: "comment", target: "table:people" },
      { kind: "comment", target: "column:orgs.equity" },
    ]);
  });
});

describe("shapes the parser half-knew (inc.58)", () => {
  it("labels an ALIASED update as a data change — the hole that survived inc.56", () => {
    // `update \w+ set` matched `update orgs set` and nothing else. Live, 0003 and
    // 0031 each ran `update orgs o set …`, and both escaped the label; the files
    // were still capped only because each ALSO ran an unaliased update elsewhere.
    // A migration that only ever aliases would have reported the strongest verdict.
    for (const sql of [
      "update orgs o set name = 'x';",
      "update orgs as o set name = 'x';",
      "update public.orgs set name = 'x';",
      "update only orgs o set name = 'x';",
    ]) {
      expect(parseMigration(sql).unverifiable).toContain("data change");
      expect(unrecognisedStatements(sql)).toEqual([]);
    }
  });

  it("still labels the unaliased form — the alias is optional, not the alias `set`", () => {
    // Without the lookahead, `update orgs set …` reads `set` as the alias and then
    // demands a second `set` that is not there, silently losing the common case.
    expect(parseMigration("update orgs set name = 'x';").unverifiable).toContain("data change");
  });

  it("claims the DROP mirrors its `create` twins had all along", () => {
    // Live: `drop trigger if exists` in 5 migrations and `drop policy if exists`
    // in 1 contributed NO capping label, because the parser listed only the
    // create side of each pair.
    expect(parseMigration("drop trigger if exists t on people;").unverifiable).toContain("drop trigger");
    expect(parseMigration("drop policy if exists p on orgs;").unverifiable).toContain("drop policy");
    expect(unrecognisedStatements("drop trigger if exists t on people; drop policy if exists p on orgs;")).toEqual([]);
  });

  it("caps each mirror exactly where its twin is capped", () => {
    // Removing an object is observed by the same access that would have observed
    // adding it — so the direction changes nothing about the ceiling.
    expect(evidenceCeiling(["drop trigger"]).ceiling).toBe(evidenceCeiling(["create trigger"]).ceiling);
    expect(evidenceCeiling(["drop policy"]).ceiling).toBe(evidenceCeiling(["create policy"]).ceiling);
    expect(evidenceCeiling(["drop trigger"]).permanent).toEqual(["drop trigger"]);
    expect(evidenceCeiling(["drop policy"]).probeable).toEqual(["drop policy"]);
  });

  it("does not invent a mirror nobody wrote", () => {
    // `drop index` and `drop function` are equally imaginable and appear in ZERO
    // migrations. A rule for a shape nobody wrote is the assertion this ladder
    // exists to kill — so they stay unclaimed, and the coverage check will name
    // them the day someone writes one.
    expect(parserEmittableLabels()).not.toContain("drop index");
    expect(unrecognisedStatements("drop index if exists ix_people_name;")).toEqual(["drop index if exists"]);
  });
});

describe("a `do $$ … $$` block is graded by its BODY (inc.60)", () => {
  // Live before this: `0011` and `0032` both reported
  // `unrecognised statement: do $$ begin if` — a fingerprint of the block's
  // punctuation, naming nothing anyone can act on, and the last thing holding
  // anything in `unclassified`.
  const ROLE_BLOCK =
    "do $$ begin if not exists (select 1 from pg_roles where rolname = 'mle_rep_read') then create role mle_rep_read nologin; end if; end $$;";

  it("reads the statements inside instead of fingerprinting the wrapper", () => {
    expect(statementsToGrade(ROLE_BLOCK).some((s) => /^create role/i.test(s))).toBe(true);
    expect(unrecognisedStatements(ROLE_BLOCK)).toEqual([]);
    expect(parseMigration(ROLE_BLOCK).unverifiable).toContain("create role");
  });

  it("caps a role where the grant beside it is capped — one key settles both", () => {
    expect(evidenceCeiling(["create role"]).ceiling).toBe(evidenceCeiling(["grant"]).ceiling);
    expect(evidenceCeiling(["grant", "revoke", "create role"]).ceiling).toBe("probeable-read-only");
  });

  it("strips PL/pgSQL block structure so an anchored rule can still see its statement", () => {
    // THE REGRESSION THIS PINS: `ALTER_TABLE` is anchored at the start of a
    // statement (un-anchored is what made inc.52 invent a column). Opening a
    // block without stripping `begin`/`if … then` would leave
    // `begin if … then alter table deals …` unrecognised — 0026 and 0024 would
    // have gone BACKWARDS while the increment claimed progress.
    const sql =
      "do $$ begin if to_regclass('deals') is not null then alter table deals add constraint deals_phase_range check (phase in (1,2,3)); end if; end $$;";
    expect(unrecognisedStatements(sql)).toEqual([]);
    expect(parseMigration(sql).unverifiable).toEqual(expect.arrayContaining(["add constraint", "check constraint"]));
  });

  it("does not report a DECLARE section as statements that ran", () => {
    // `declare r record; cols text; refcols text;` is three declarations, not
    // three statements. The first cut reported `cols text` and `refcols text` as
    // unrecognised — an alarm about something that does not exist.
    const sql = "do $$ declare r record; cols text; refcols text; begin perform 1; end $$;";
    expect(unrecognisedStatements(sql)).not.toContain("cols text");
    expect(unrecognisedStatements(sql)).not.toContain("refcols text");
  });

  it("keeps work inside the block LOUD — only structure is stripped, never statements", () => {
    // `execute`, `perform`, `raise` and `return` do work, so they are graded like
    // anything else. A block that quietly excused its own body would be worth
    // less than the fingerprint it replaced.
    const sql = "do $$ begin execute format('alter table %I drop constraint %I', 'people', 'ck'); end $$;";
    expect(unrecognisedStatements(sql)).toEqual(["execute format('alter table %i"]);
    expect(evidenceCeiling(parseMigration(sql).unverifiable).ceiling).toBe("unclassified");
  });

  it("recognises the block itself, and only the block", () => {
    expect(doBlockBody("do $$ begin end $$")).toBe(" begin end ");
    expect(doBlockBody("do language plpgsql $fn$ begin end $fn$")).toBe(" begin end ");
    expect(doBlockBody("create table people (id text)")).toBeNull();
    // A function body is NOT a DO block — it is already adjudicated per-function.
    expect(doBlockBody("create function f() returns int as $$ begin return 1; end $$ language plpgsql")).toBeNull();
  });

  it("does not invent a `drop role` nobody wrote", () => {
    // Zero migrations write it — same discipline as inc.58's `drop index`.
    expect(parserEmittableLabels()).not.toContain("drop role");
    expect(unrecognisedStatements("drop role mle_rep_read;")).toEqual(["drop role mle_rep_read"]);
  });
});
