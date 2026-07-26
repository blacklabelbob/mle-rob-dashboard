import { describe, expect, it } from "vitest";
import {
  and,
  compile,
  isFilterError,
  lit,
  not,
  or,
  type Expr,
} from "../filters/ast";

describe("filter AST — compilation", () => {
  it("binds every value as a placeholder, never inlines it", () => {
    const { sql, params } = compile(lit({ lit: "deal.stage", value: "quote_sent" }), "deal");
    expect(sql).toBe("deals.stage = $1");
    expect(params).toEqual(["quote_sent"]);
    expect(sql).not.toContain("quote_sent");
  });

  it("numbers placeholders across a nested tree in walk order", () => {
    const expr = and(
      lit({ lit: "deal.stage", value: "quote_sent" }),
      or(
        lit({ lit: "deal.valueGte", value: 5000 }),
        not(lit({ lit: "deal.referralSourced", value: false })),
      ),
    );
    const { sql, params } = compile(expr, "deal");
    expect(sql).toBe("(deals.stage = $1 AND (deals.value >= $2 OR NOT (deals.referral_sourced = $3)))");
    expect(params).toEqual(["quote_sent", 5000, false]);
  });

  it("uses each operator's identity for an empty arg list", () => {
    expect(compile(and(), "deal").sql).toBe("TRUE");
    expect(compile(or(), "deal").sql).toBe("FALSE");
  });

  it("compiles a property filter to a bound EXISTS containment", () => {
    const { sql, params } = compile(
      lit({
        lit: "property",
        entityType: "person",
        propertyDefinitionId: "00000001-0000-0000-0000-000000000001",
        value: { kind: "SELECT_STRING", items: ["lit"] },
      }),
      "person",
    );
    expect(sql).toContain("EXISTS (SELECT 1 FROM entity_properties ep");
    expect(sql).toContain("ep.entity_id = people.id");
    expect(sql).toContain("ep.values @> $3::jsonb");
    expect(params).toEqual([
      "person",
      "00000001-0000-0000-0000-000000000001",
      JSON.stringify({ kind: "SELECT_STRING", items: ["lit"] }),
    ]);
  });

  it("escapes LIKE wildcards in a contains search", () => {
    const { params } = compile(lit({ lit: "org.nameContains", value: "100%_roof" }), "org");
    expect(params).toEqual(["%100\\%\\_roof%"]);
  });

  it("honours a caller-supplied alias", () => {
    expect(compile(lit({ lit: "person.status", value: "lit" }), "person", "p").sql).toBe(
      "p.status = $1",
    );
  });
});

describe("filter AST — injection and validity defenses (§9.2 B4)", () => {
  const reject = (expr: Expr, target: Parameters<typeof compile>[1]) => {
    let err: unknown;
    try {
      compile(expr, target);
    } catch (e) {
      err = e;
    }
    expect(isFilterError(err), `expected ${JSON.stringify(expr)} to be rejected`).toBe(true);
  };

  it("rejects a stage outside the closed enum", () => {
    reject(lit({ lit: "deal.stage", value: "paid'; DROP TABLE deals--" as never }), "deal");
  });

  it("rejects an id containing quote/backslash/NUL", () => {
    reject(lit({ lit: "deal.owner", value: "rob' OR '1'='1" }), "deal");
    reject(lit({ lit: "deal.owner", value: "rob\\x" }), "deal");
    reject(lit({ lit: "deal.owner", value: "rob\0" }), "deal");
  });

  it("rejects an unknown property entity type", () => {
    reject(
      lit({
        lit: "property",
        entityType: "secrets" as never,
        propertyDefinitionId: "abc",
        value: { kind: "TEXT", items: ["x"] },
      }),
      "person",
    );
  });

  it("rejects literals from another target instead of silently widening", () => {
    reject(lit({ lit: "deal.stage", value: "paid" }) as Expr, "person");
  });

  it("rejects a malformed node, a bad alias and an over-deep tree", () => {
    reject({ op: "nope" } as unknown as Expr, "deal");
    expect(() => compile(and(), "deal", "d; DROP TABLE deals")).toThrow();
    let deep: Expr = lit({ lit: "deal.stage", value: "paid" });
    for (let i = 0; i < 40; i++) deep = not(deep);
    reject(deep, "deal");
  });

  it("rejects wrong-typed scalars", () => {
    reject(lit({ lit: "deal.valueGte", value: "5000" as never }), "deal");
    reject(lit({ lit: "deal.referralSourced", value: "true" as never }), "deal");
    reject(lit({ lit: "activity.occurredAfter", value: "yesterday" }), "activity");
    reject(lit({ lit: "org.nameContains", value: "   " }), "org");
  });
});
