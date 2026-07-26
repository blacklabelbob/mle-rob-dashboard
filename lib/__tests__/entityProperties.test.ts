import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PROPERTY_DATA_TYPES,
  PROPERTY_ENTITY_TYPES,
  containmentFilter,
  definitionAppliesTo,
  formatPropertyValue,
  parsePropertyValue,
  systemOptionId,
  systemPropertyId,
  validatePropertyValue,
  NETWORK_STATUS_OPTIONS,
  NETWORK_STATUS_PROPERTY_ID,
  type PropertyDefinition,
} from "../entityProperties";

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0015_entity_properties.sql"),
  "utf8",
);

/**
 * The migration and this module encode the SAME two closed sets. Following the
 * readModelSql.test.ts precedent, they are parsed and compared rather than eyeballed —
 * a type added to one side and not the other is a row the database silently refuses
 * (or, worse for the entity_type set, a string that reaches dynamic SQL unlisted).
 */
function checkList(anchor: string): string[] {
  const start = SQL.indexOf(anchor);
  if (start === -1) throw new Error(`anchor not found in 0015: ${anchor}`);
  const body = SQL.slice(start + anchor.length);
  const end = body.indexOf(")");
  return [...body.slice(0, end).matchAll(/'([a-z_A-Z]+)'/g)].map((m) => m[1]);
}

describe("0015 <-> lib parity", () => {
  it("data_type CHECK matches PROPERTY_DATA_TYPES", () => {
    expect(checkList("data_type            text not null check (data_type in (")).toEqual([
      ...PROPERTY_DATA_TYPES,
    ]);
  });

  it("entity_properties.entity_type CHECK matches PROPERTY_ENTITY_TYPES", () => {
    expect(
      checkList("entity_type            text not null check (entity_type in ("),
    ).toEqual([...PROPERTY_ENTITY_TYPES]);
  });

  it("the values CHECK covers every data type (no kind can slip past it)", () => {
    for (const t of PROPERTY_DATA_TYPES) {
      expect(SQL).toContain(`when '${t}'`);
    }
  });

  it("keeps the guarantees the design turns on", () => {
    // containment-only GIN, one value row per (definition, entity), and the ENTITY
    // link-target rule. Each of these is load-bearing per the migration header.
    expect(SQL).toContain("using gin (values jsonb_path_ops)");
    expect(SQL).toContain("entity_properties_one_per_entity");
    expect(SQL).toContain("property_definitions_entity_target");
  });
});

describe("systemPropertyId", () => {
  it("derives the documented deterministic UUID", () => {
    expect(systemPropertyId(0x10)).toBe("00000001-0000-0000-0000-000000000010");
    expect(systemPropertyId(1)).toBe("00000001-0000-0000-0000-000000000001");
    expect(systemPropertyId(255)).toBe("00000001-0000-0000-0000-0000000000ff");
  });

  it("refuses out-of-range suffixes rather than emitting a malformed uuid", () => {
    expect(() => systemPropertyId(0)).toThrow();
    expect(() => systemPropertyId(256)).toThrow();
    expect(() => systemPropertyId(1.5)).toThrow();
  });
});

describe("parsePropertyValue", () => {
  it("parses each well-formed kind", () => {
    expect(parsePropertyValue({ kind: "TEXT", items: ["a"] })).toEqual({
      kind: "TEXT",
      items: ["a"],
    });
    expect(parsePropertyValue({ kind: "NUMBER", items: [1, 2] })).toEqual({
      kind: "NUMBER",
      items: [1, 2],
    });
    expect(parsePropertyValue({ kind: "BOOLEAN", items: [false] })).toEqual({
      kind: "BOOLEAN",
      items: [false],
    });
    expect(parsePropertyValue({ kind: "DATE", items: ["2026-07-25"] })).toEqual({
      kind: "DATE",
      items: ["2026-07-25"],
    });
    expect(
      parsePropertyValue({
        kind: "ENTITY",
        items: [{ entity_type: "org", entity_id: "the-title-base" }],
      }),
    ).toEqual({ kind: "ENTITY", items: [{ entity_type: "org", entity_id: "the-title-base" }] });
  });

  it("returns null — never a guess — on malformed rows", () => {
    expect(parsePropertyValue(null)).toBeNull();
    expect(parsePropertyValue("nope")).toBeNull();
    expect(parsePropertyValue([])).toBeNull();
    expect(parsePropertyValue({ kind: "TEXT" })).toBeNull();
    expect(parsePropertyValue({ kind: "NOPE", items: [] })).toBeNull();
    expect(parsePropertyValue({ kind: "NUMBER", items: ["1"] })).toBeNull();
    expect(parsePropertyValue({ kind: "NUMBER", items: [Number.NaN] })).toBeNull();
    expect(parsePropertyValue({ kind: "TEXT", items: [1] })).toBeNull();
    expect(parsePropertyValue({ kind: "DATE", items: ["07/25/2026"] })).toBeNull();
    expect(parsePropertyValue({ kind: "ENTITY", items: [{ entity_id: "x" }] })).toBeNull();
    // an entity kind outside the closed set is exactly what B4 says must not pass
    expect(
      parsePropertyValue({ kind: "ENTITY", items: [{ entity_type: "robot", entity_id: "x" }] }),
    ).toBeNull();
  });

  it("accepts an empty item list as a cleared field", () => {
    expect(parsePropertyValue({ kind: "TAG", items: [] })).toEqual({ kind: "TAG", items: [] });
  });
});

const tagDef: PropertyDefinition = {
  id: systemPropertyId(0x20),
  display_name: "Lead Tags",
  data_type: "TAG",
  specific_entity_type: null,
  is_multi_select: true,
  is_system: false,
};

const stageDef: PropertyDefinition = {
  id: systemPropertyId(0x10),
  display_name: "Stage",
  data_type: "SELECT_STRING",
  specific_entity_type: "deal",
  is_multi_select: false,
  is_system: true,
};

describe("validatePropertyValue", () => {
  it("accepts a good value", () => {
    expect(
      validatePropertyValue(tagDef, { kind: "TAG", items: ["storm-damage", "commercial"] }, [
        "storm-damage",
        "commercial",
        "hoa",
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects a type mismatch against the definition", () => {
    const r = validatePropertyValue(stageDef, { kind: "TEXT", items: ["Lead"] });
    expect(r.ok).toBe(false);
  });

  it("rejects multiple values on a single-select", () => {
    const r = validatePropertyValue(stageDef, {
      kind: "SELECT_STRING",
      items: ["Lead", "Qualified"],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("single-select");
  });

  it("rejects a choice that is not on the option list", () => {
    const r = validatePropertyValue(tagDef, { kind: "TAG", items: ["storm-damage", "typo"] }, [
      "storm-damage",
    ]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("typo");
  });

  it("rejects an ENTITY link pointing at the wrong kind", () => {
    const linkDef: PropertyDefinition = {
      id: systemPropertyId(0x21),
      display_name: "Belongs To",
      data_type: "ENTITY",
      specific_entity_type: "org",
      is_multi_select: false,
      is_system: false,
    };
    expect(
      validatePropertyValue(linkDef, {
        kind: "ENTITY",
        items: [{ entity_type: "person", entity_id: "trent-brands" }],
      }).ok,
    ).toBe(false);
    expect(
      validatePropertyValue(linkDef, {
        kind: "ENTITY",
        items: [{ entity_type: "org", entity_id: "the-title-base" }],
      }),
    ).toEqual({ ok: true });
  });
});

describe("definitionAppliesTo", () => {
  it("null specific_entity_type applies everywhere", () => {
    expect(definitionAppliesTo(tagDef, "person")).toBe(true);
    expect(definitionAppliesTo(tagDef, "deal")).toBe(true);
  });

  it("a scoped definition applies only to its kind", () => {
    expect(definitionAppliesTo(stageDef, "deal")).toBe(true);
    expect(definitionAppliesTo(stageDef, "person")).toBe(false);
  });

  it("an ENTITY definition's target kind constrains the value, not the host record", () => {
    const linkDef: PropertyDefinition = {
      id: systemPropertyId(0x21),
      display_name: "Belongs To",
      data_type: "ENTITY",
      specific_entity_type: "org",
      is_multi_select: false,
      is_system: false,
    };
    expect(definitionAppliesTo(linkDef, "task")).toBe(true);
  });
});

describe("formatPropertyValue", () => {
  it("renders booleans as Yes/No and never prints null", () => {
    expect(formatPropertyValue({ kind: "BOOLEAN", items: [true, false] })).toBe("Yes, No");
    expect(formatPropertyValue({ kind: "TEXT", items: [] })).toBe("");
    expect(
      formatPropertyValue({
        kind: "ENTITY",
        items: [{ entity_type: "org", entity_id: "the-title-base" }],
      }),
    ).toBe("org:the-title-base");
  });
});

describe("containmentFilter", () => {
  it("emits the literal the GIN index can serve", () => {
    expect(containmentFilter({ kind: "TAG", items: ["storm-damage"] })).toEqual({
      kind: "TAG",
      items: ["storm-damage"],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 0016 — the first real field on the spine: people.status / orgs.status       */
/* -------------------------------------------------------------------------- */

const SQL_0016 = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0016_status_on_property_spine.sql"),
  "utf8",
);

describe("0016 status projection", () => {
  it("seeds the definition under the id lib/entityProperties.ts computes", () => {
    expect(NETWORK_STATUS_PROPERTY_ID).toBe("00000001-0000-0000-0000-000000000001");
    expect(SQL_0016).toContain(`values ('${NETWORK_STATUS_PROPERTY_ID}', 'Network Status'`);
  });

  it("seeds exactly the three options, under the deterministic option ids", () => {
    const seeded = [
      ...SQL_0016.matchAll(
        /\('(00000002-0000-0000-0000-[0-9a-f]{12})', '00000001-0000-0000-0000-000000000001', (\d+), '(\w+)'\)/g,
      ),
    ];
    expect(seeded.map((m) => m[3])).toEqual([...NETWORK_STATUS_OPTIONS]);
    expect(seeded.map((m) => m[1])).toEqual([1, 2, 3].map(systemOptionId));
  });

  /**
   * The option list IS the NodeStatus union. If someone adds a fourth status to the
   * column CHECK in a later migration and not here, the trigger writes a value no
   * option row allows — this test is what fails first.
   */
  it("options match the status CHECK on both people and orgs", () => {
    const network = readFileSync(
      path.join(process.cwd(), "supabase/migrations/0001_network.sql"),
      "utf8",
    );
    const orgsSplit = readFileSync(
      path.join(process.cwd(), "supabase/migrations/0003_orgs_split.sql"),
      "utf8",
    );
    const statuses = (sql: string) => {
      const m = sql.match(/check \(status in \(([^)]*)\)\)/);
      if (!m) throw new Error("status CHECK not found");
      return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
    };
    expect(statuses(network).sort()).toEqual([...NETWORK_STATUS_OPTIONS].sort());
    expect(statuses(orgsSplit).sort()).toEqual([...NETWORK_STATUS_OPTIONS].sort());
  });

  it("keeps the column authoritative: triggers on both tables, insert+update+delete", () => {
    for (const [table, kind] of [
      ["people", "person"],
      ["orgs", "org"],
    ]) {
      expect(SQL_0016).toMatch(
        new RegExp(
          `after insert or update of status or delete on ${table}[\\s\\S]{0,120}sync_status_to_property_spine\\('${kind}'\\)`,
        ),
      );
    }
  });

  it("writes a value the 0015 CHECK and the parser both accept", () => {
    const written = { kind: "SELECT_STRING", items: ["warm"] };
    const parsed = parsePropertyValue(written);
    expect(parsed).toEqual(written);
    const def: PropertyDefinition = {
      id: NETWORK_STATUS_PROPERTY_ID,
      display_name: "Network Status",
      data_type: "SELECT_STRING",
      specific_entity_type: null,
      is_multi_select: false,
      is_system: true,
    };
    expect(validatePropertyValue(def, parsed!, NETWORK_STATUS_OPTIONS)).toEqual({ ok: true });
    // null specific_entity_type => legal on both kinds, which is why 0016 seeds it null
    expect(definitionAppliesTo(def, "person")).toBe(true);
    expect(definitionAppliesTo(def, "org")).toBe(true);
    // a status outside the option list is refused at the validate layer
    expect(
      validatePropertyValue(def, { kind: "SELECT_STRING", items: ["hot"] }, NETWORK_STATUS_OPTIONS).ok,
    ).toBe(false);
  });
});
