import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_ALIAS, FILTER_TARGETS, compile, type Expr } from "../filters/ast";
import { MAX_JSON_BYTES } from "../filters/parse";

/**
 * Q67 inc.5 — 0020 `filter_page` vs the compiler that feeds it.
 *
 * The SQL half cannot run in CI (no Postgres), so this pins what static text can prove:
 * the target→table mapping matches the TS unions, the params really are bound rather than
 * interpolated, and — the load-bearing one — EXECUTE is revoked from the roles whose key
 * ships in the browser. A dynamic-SQL function callable by `anon` is a read primitive for
 * anyone with the URL, and that is a one-line mistake with no database error to catch it.
 */
const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0020_filter_page_rpc.sql"),
  "utf8",
);

const SIGNATURE = "filter_page(text, text, jsonb, int, timestamptz, text)";

describe("0020 <-> lib parity", () => {
  it("maps every FILTER_TARGET to its DEFAULT_ALIAS table, and nothing else", () => {
    const arms = [...SQL.matchAll(/when '([a-z]+)' then '([a-z_]+)'/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(arms).toEqual(FILTER_TARGETS.map((t) => [t, DEFAULT_ALIAS[t]]));
  });

  it("exposes the params array under the identifier compile() renders", () => {
    // compile()'s default paramsExpr is `p_params`; the cross join is what makes that
    // name resolvable inside EXECUTE'd SQL, which cannot see plpgsql variables.
    const { sql } = compile({ op: "lit", lit: { lit: "person.status", value: "lit" } }, "person", {
      bindStyle: "jsonb",
    });
    expect(sql).toContain("p_params->>0");
    expect(SQL).toContain("cross join (select $1::jsonb) as _params(p_params)");
  });

  it("casts the property definition id as uuid, never text (42883 on prod)", () => {
    // The regression this pins: `property_definition_id` is a uuid column (0015), and
    // `uuid = text` has no operator. Under `pg` rendering a bare `$n` is untyped so
    // Postgres infers the type and the bug is invisible; under `jsonb` rendering the cast
    // is written out, so a `::text` here breaks the property EXISTS — the exact query the
    // RPC was built to run — with a runtime error no unit test would have seen.
    const tree: Expr = {
      op: "lit",
      lit: {
        lit: "property",
        entityType: "person",
        propertyDefinitionId: "00000001-0000-0000-0000-000000000001",
        value: { kind: "SELECT_STRING", items: ["warm"] },
      },
    };
    const { sql } = compile(tree, "person", { bindStyle: "jsonb" });
    expect(sql).toContain("ep.property_definition_id = ((p_params->>1)::uuid)");
    expect(sql).not.toContain("property_definition_id = ((p_params->>1)::text)");
    // …and the `pg` rendering is unchanged by the fix: the cast only shows up in jsonb.
    expect(compile(tree, "person").sql).toContain("ep.property_definition_id = $2");
  });

  it("shares the 64 KiB ceiling with parse.ts and saved_views", () => {
    expect(SQL).toContain(`octet_length(p_where) > ${MAX_JSON_BYTES}`);
  });
});

describe("0020 security posture", () => {
  it("revokes EXECUTE from public, anon and authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke all on function ${SIGNATURE} from ${role};`);
    }
  });

  it("grants EXECUTE to service_role only", () => {
    const grants = [...SQL.matchAll(/grant execute on function [^;]+ to ([a-z_]+);/g)].map(
      (m) => m[1],
    );
    expect(grants).toEqual(["service_role"]);
  });

  it("is SECURITY INVOKER — a DEFINER here would bypass the 0018 policies", () => {
    expect(SQL).toContain("security invoker");
    expect(SQL.toLowerCase()).not.toContain("security definer");
  });

  it("pins search_path so a role's path cannot re-point the tables", () => {
    expect(SQL).toContain("set search_path = public");
  });

  it("interpolates only the table name and the compiled fragment", () => {
    // %1$I is the closed-CASE table; %2$s is the fragment. A third %s would be a value
    // reaching SQL as text — the one thing this whole subsystem exists to prevent.
    const specs = [...SQL.matchAll(/%\d?\$?[Isl]/g)].map((m) => m[0]);
    expect(new Set(specs)).toEqual(new Set(["%1$I", "%2$s"]));
  });

  it("refuses statement terminators and comment openers in the fragment", () => {
    for (const token of ["%;%", "%--%", "%/*%"]) {
      expect(SQL).toContain(`p_where like '${token}'`);
    }
    // And the compiler never emits any of them, so the guard cannot reject valid input.
    const tree: Expr = {
      op: "and",
      args: [
        { op: "lit", lit: { lit: "person.status", value: "lit" } },
        {
          op: "not",
          arg: { op: "lit", lit: { lit: "person.nameContains", value: "o'brien -- x; drop" } },
        },
      ],
    };
    const { sql } = compile(tree, "person", { bindStyle: "jsonb" });
    expect(sql).not.toMatch(/;|--|\/\*/);
  });
});

describe("0020 pagination", () => {
  it("orders by a unique key pair, not created_at alone", () => {
    expect(SQL).toContain("order by %1$I.created_at desc, %1$I.id desc");
    expect(SQL).toContain("(%1$I.created_at, %1$I.id) < ($2::timestamptz, $3::text)");
  });

  it("rejects half a cursor rather than returning an empty page", () => {
    expect(SQL).toContain("(p_after_created_at is null) <> (p_after_id is null)");
  });

  it("bounds the page size on both ends", () => {
    expect(SQL).toContain("p_limit < 1 or p_limit > 200");
  });

  it("has a keyset index on every target table", () => {
    for (const table of FILTER_TARGETS.map((t) => DEFAULT_ALIAS[t])) {
      expect(SQL).toContain(`on ${table} (created_at desc, id desc)`);
    }
  });
});
