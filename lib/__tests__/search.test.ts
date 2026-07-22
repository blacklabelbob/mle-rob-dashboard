import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEARCH_COLUMNS, normalizeQuery, toHits, mergeHits, SearchHit } from "@/lib/search";

// Task 4.1 (Q33) — pure search helpers + the migration-sync gate.

const MIGRATION = readFileSync(
  join(__dirname, "../../supabase/migrations/0007_people_search.sql"),
  "utf8",
);

describe("0007 migration gate — SEARCH_COLUMNS stays in sync with the DDL", () => {
  // Two generated columns (people, orgs); each must coalesce exactly SEARCH_COLUMNS.
  const exprs = MIGRATION.match(/to_tsvector\('simple',[\s\S]*?\)\) stored/g) ?? [];

  it("migration defines a generated tsvector for both tables", () => {
    expect(exprs).toHaveLength(2);
    expect(MIGRATION).toContain("alter table people add column if not exists search_tsv");
    expect(MIGRATION).toContain("alter table orgs add column if not exists search_tsv");
    expect(MIGRATION).toContain("using gin (search_tsv)");
  });

  for (const [i, table] of ["people", "orgs"].entries()) {
    it(`${table} expression coalesces exactly SEARCH_COLUMNS, in order`, () => {
      const cols = [...(exprs[i] ?? "").matchAll(/coalesce\((\w+), ''\)/g)].map((m) => m[1]);
      expect(cols).toEqual([...SEARCH_COLUMNS]);
    });
  }
});

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  jonathan   polk ")).toBe("jonathan polk");
  });
  it("rejects empty / whitespace-only / non-string", () => {
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery(null)).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
  });
  it("caps length at 200", () => {
    expect(normalizeQuery("x".repeat(500))!.length).toBe(200);
  });
});

describe("toHits", () => {
  const row = { id: "p1", name: "Jonathan Polk", business: "Polk Title", role: null, vertical_id: "title" };
  it("maps rows and tags kind", () => {
    expect(toHits([row], "person")).toEqual([
      { id: "p1", name: "Jonathan Polk", business: "Polk Title", role: null, verticalId: "title", kind: "person" },
    ]);
  });
  it("drops (DEMO) records — search never surfaces demo data", () => {
    const demo = { ...row, id: "demo-1", name: "Jake Demo (DEMO)" };
    expect(toHits([demo, row], "person")).toHaveLength(1);
  });
});

describe("mergeHits", () => {
  const h = (id: string, name: string, kind: "person" | "org"): SearchHit => ({
    id, name, business: null, role: null, verticalId: null, kind,
  });
  it("orders by name, person before org on ties, id tiebreak — deterministic", () => {
    const out = mergeHits(
      [h("p2", "Beta", "person"), h("p1", "Alpha", "person")],
      [h("o1", "Beta", "org")],
    );
    expect(out.map((x) => x.id)).toEqual(["p1", "p2", "o1"]);
    // same input again → byte-identical order
    expect(
      mergeHits([h("p2", "Beta", "person"), h("p1", "Alpha", "person")], [h("o1", "Beta", "org")]),
    ).toEqual(out);
  });
  it("caps at limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => h(`p${i}`, `Name${String(i).padStart(2, "0")}`, "person"));
    expect(mergeHits(many, [], 25)).toHaveLength(25);
  });
});
