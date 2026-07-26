import { describe, expect, it } from "vitest";
import { compile, FILTER_TARGETS, lit, type FilterTarget } from "@/lib/filters/ast";
import {
  andFragments,
  compileDemoExclusion,
  DEMO_ID_PATTERN,
  DEMO_NAME_PATTERN,
} from "@/lib/filters/demo";
import { isDemo } from "@/lib/stats";
import type { Person } from "@/lib/types";

// Q67b — the demo predicate the saved-view route ANDs onto every compiled filter.
// The bug these pin is not a crash: it is two lists disagreeing about the same filter,
// which shows up as a rep seeing a fabricated "(DEMO)" row in a saved view and nowhere
// else. Every assertion below is about that disagreement, or about the ways a predicate
// meant to remove 6 rows can quietly remove real ones.

const person = (name: string): Person => ({ id: "x", name }) as Person;

describe("compileDemoExclusion", () => {
  it("matches lib/stats.isDemo — the pattern is the same rule, not a second one", () => {
    // If someone changes isDemo's tag, this fails rather than letting the SQL drift.
    expect(isDemo(person("Rita Alvarez (DEMO)"))).toBe(true);
    expect(isDemo(person("Trent Brands"))).toBe(false);
    expect(DEMO_NAME_PATTERN).toBe("%(DEMO)%");
    expect(DEMO_ID_PATTERN).toBe("demo-%");
  });

  it("covers every filter target", () => {
    for (const t of FILTER_TARGETS) {
      const { sql, params } = compileDemoExclusion(t as FilterTarget);
      expect(sql.length).toBeGreaterThan(0);
      expect(params.length).toBeGreaterThan(0);
    }
  });

  it("judges deals and activities by the ids they hang off (todayRules' rule)", () => {
    // A deal has no name; an activity logged against a demo person is demo data even
    // though its own id is not. Same definition as lib/tasks/todayRules.
    const deal = compileDemoExclusion("deal");
    expect(deal.sql).toContain("deals.person_id");
    expect(deal.sql).toContain("deals.org_id");
    const act = compileDemoExclusion("activity");
    expect(act.sql).toContain("activities.deal_id");
    expect(act.params.every((p) => p === DEMO_ID_PATTERN)).toBe(true);
  });

  it("coalesces to false so a NULL column cannot delete a real row", () => {
    // NULL LIKE 'demo-%' is NULL and NOT NULL is NULL, so without coalesce a deal with no
    // org_id disappears from the list — real records vanishing, no error anywhere.
    const { sql } = compileDemoExclusion("deal");
    const clauses = sql.split(" AND ");
    expect(clauses.length).toBeGreaterThan(1);
    for (const c of clauses) expect(c).toContain("coalesce(");
  });

  it("binds every pattern — no string literal reaches the SQL", () => {
    const { sql, params } = compileDemoExclusion("person");
    expect(sql).not.toContain("DEMO)");
    expect(sql).not.toContain("'");
    expect(params).toEqual([DEMO_NAME_PATTERN, DEMO_ID_PATTERN]);
  });

  it("starts its placeholders after the filter's, in both renderings", () => {
    const filter = compile(lit({ lit: "person.status", value: "warm" }), "person", {
      bindStyle: "jsonb",
    });
    expect(filter.params).toHaveLength(1);
    const notDemo = compileDemoExclusion("person", {
      bindStyle: "jsonb",
      paramOffset: filter.params.length,
    });
    // jsonb arrays are 0-based, so the filter owns element 0 and this owns 1 and 2. An
    // off-by-one here reads the status value as a LIKE pattern: no error, wrong rows.
    expect(notDemo.sql).toContain("(p_params->>1)");
    expect(notDemo.sql).toContain("(p_params->>2)");
    expect(notDemo.sql).not.toContain("->>0");

    const pg = compileDemoExclusion("person", { paramOffset: 1 });
    expect(pg.sql).toContain("$2");
    expect(pg.sql).toContain("$3");
    expect(pg.sql).not.toContain("$1");
  });

  it("andFragments keeps the params in placeholder order", () => {
    const filter = compile(lit({ lit: "person.status", value: "warm" }), "person", {
      bindStyle: "jsonb",
    });
    const notDemo = compileDemoExclusion("person", {
      bindStyle: "jsonb",
      paramOffset: filter.params.length,
    });
    const both = andFragments(filter, notDemo);
    expect(both.params).toEqual(["warm", DEMO_NAME_PATTERN, DEMO_ID_PATTERN]);
    expect(both.sql).toContain(" AND ");
  });

  it("refuses an illegal alias, params identifier, bind style or offset", () => {
    expect(() => compileDemoExclusion("person", { alias: "people; drop table people" })).toThrow();
    expect(() => compileDemoExclusion("person", { paramsExpr: "p_params)" })).toThrow();
    // @ts-expect-error deliberately wrong
    expect(() => compileDemoExclusion("person", { bindStyle: "sqli" })).toThrow();
    expect(() => compileDemoExclusion("person", { paramOffset: -1 })).toThrow();
    expect(() => compileDemoExclusion("person", { paramOffset: 1.5 })).toThrow();
    // @ts-expect-error deliberately wrong
    expect(() => compileDemoExclusion("nope")).toThrow();
  });
});
