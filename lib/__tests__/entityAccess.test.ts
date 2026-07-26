import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACCESS_ENTITY_TYPES,
  ACCESS_LEVELS,
  SUBJECT_TYPES,
  accessLevelAtLeast,
  accessLevelRank,
  canAccess,
  effectiveAccessLevel,
  expandSubjects,
  grantsRevokedByDeleting,
  isInheritedGrant,
  isWellFormedGrant,
  type EntityAccessGrant,
} from "../entityAccess";

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0017_entity_access.sql"),
  "utf8",
);

/**
 * Parsed, not eyeballed — the readModelSql.test.ts / entityProperties.test.ts
 * precedent. A level added to the CHECK but not to ACCESS_LEVELS fails closed at
 * runtime (accessLevelRank returns 0), which is safe but silent; this makes it loud.
 */
function checkList(anchor: string): string[] {
  const start = SQL.indexOf(anchor);
  if (start === -1) throw new Error(`anchor not found in 0017: ${anchor}`);
  const body = SQL.slice(start + anchor.length);
  return [...body.slice(0, body.indexOf(")")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("0017 <-> lib parity", () => {
  it("access_level CHECK matches ACCESS_LEVELS", () => {
    expect(checkList("check (access_level in (")).toEqual([...ACCESS_LEVELS]);
  });

  it("subject_type CHECK matches SUBJECT_TYPES", () => {
    expect(checkList("check (subject_type in (")).toEqual([...SUBJECT_TYPES]);
  });

  it("entity_type CHECK matches ACCESS_ENTITY_TYPES", () => {
    expect(checkList("check (entity_type in (")).toEqual([...ACCESS_ENTITY_TYPES]);
  });

  it("granted_from_entity_type CHECK matches the same entity set", () => {
    expect(checkList("check (granted_from_entity_type in (")).toEqual([
      ...ACCESS_ENTITY_TYPES,
    ]);
  });

  it("access_level_rank() in SQL agrees with accessLevelRank() rank for rank", () => {
    // Parse the `when 'x' then N` arms out of the SQL function body.
    const fn = SQL.slice(SQL.indexOf("create or replace function access_level_rank"));
    const arms = [...fn.slice(0, fn.indexOf("$$;")).matchAll(/when '(\w+)'\s+then (\d+)/g)];
    expect(arms.length).toBe(ACCESS_LEVELS.length);
    for (const [, level, rank] of arms) {
      expect(accessLevelRank(level)).toBe(Number(rank));
    }
  });

  it("keeps BOTH partial unique indexes — the NULL-duplication hole stays closed", () => {
    expect(SQL).toContain("where granted_from_entity_id is not null");
    expect(SQL).toContain("where granted_from_entity_id is null");
  });

  it("enables RLS on the grant table (anon-writable ACL = self-granted owner)", () => {
    expect(SQL).toContain("alter table entity_access enable row level security");
  });

  it("keeps a revocation trigger on every entity kind it claims to cascade", () => {
    for (const table of ["people", "orgs", "deals"]) {
      expect(SQL).toContain(`after delete on ${table}`);
    }
  });

  it("stays INERT — no policy is created on the grant table in this migration", () => {
    expect(SQL).not.toMatch(/create policy/i);
  });
});

describe("the ladder", () => {
  it("does not sort alphabetically (view would outrank owner)", () => {
    // The whole reason accessLevelAtLeast exists. Raw string >= gets both of these wrong.
    expect(accessLevelAtLeast("view", "owner")).toBe(false);
    expect(accessLevelAtLeast("owner", "view")).toBe(true);
    expect("view" >= "owner").toBe(true); // the trap, pinned so nobody re-introduces it
  });

  it("is reflexive and monotonic", () => {
    for (const level of ACCESS_LEVELS) expect(accessLevelAtLeast(level, level)).toBe(true);
    expect(accessLevelAtLeast("edit", "comment")).toBe(true);
    expect(accessLevelAtLeast("comment", "edit")).toBe(false);
  });

  it("fails closed on a level it does not recognise", () => {
    expect(accessLevelRank("superuser")).toBe(0);
    expect(accessLevelAtLeast("superuser", "view")).toBe(false);
  });
});

const direct: EntityAccessGrant = {
  entity_type: "org",
  entity_id: "the-title-base",
  subject_type: "user",
  subject_id: "rob",
  access_level: "owner",
};

const inherited: EntityAccessGrant = {
  entity_type: "person",
  entity_id: "trent-brands",
  subject_type: "team",
  subject_id: "sales",
  access_level: "view",
  granted_from_entity_type: "org",
  granted_from_entity_id: "the-title-base",
};

describe("grant well-formedness", () => {
  it("accepts a direct grant and an inherited grant", () => {
    expect(isWellFormedGrant(direct)).toBe(true);
    expect(isWellFormedGrant(inherited)).toBe(true);
    expect(isInheritedGrant(direct)).toBe(false);
    expect(isInheritedGrant(inherited)).toBe(true);
  });

  it("rejects half a provenance pair — an unrevocable reason leaks access forever", () => {
    expect(
      isWellFormedGrant({ ...inherited, granted_from_entity_id: null }),
    ).toBe(false);
    expect(
      isWellFormedGrant({ ...inherited, granted_from_entity_type: null }),
    ).toBe(false);
    expect(isWellFormedGrant({ ...inherited, granted_from_entity_id: "  " })).toBe(false);
  });

  it("rejects unknown vocabulary rather than passing it through", () => {
    expect(isWellFormedGrant({ ...direct, access_level: "admin" as never })).toBe(false);
    expect(isWellFormedGrant({ ...direct, subject_type: "channel" as never })).toBe(false);
    expect(isWellFormedGrant({ ...direct, entity_type: "project" as never })).toBe(false);
    expect(isWellFormedGrant({ ...direct, entity_id: "" })).toBe(false);
  });
});

describe("subject expansion", () => {
  it("expands a caller into user + team + role subjects", () => {
    expect(
      expandSubjects({ userId: "rob", teamIds: ["sales"], roles: ["super_admin"] }),
    ).toEqual([
      { subject_type: "user", subject_id: "rob" },
      { subject_type: "team", subject_id: "sales" },
      { subject_type: "role", subject_id: "super_admin" },
    ]);
  });

  it("collapses duplicates and drops blanks", () => {
    expect(
      expandSubjects({ userId: "rob", teamIds: ["sales", "sales", " "] }),
    ).toEqual([
      { subject_type: "user", subject_id: "rob" },
      { subject_type: "team", subject_id: "sales" },
    ]);
  });
});

describe("effective level", () => {
  const subjects = expandSubjects({ userId: "will", teamIds: ["sales"] });
  const entity = { entity_type: "person", entity_id: "trent-brands" } as const;

  it("returns null when nothing is granted — the default is NO access", () => {
    expect(effectiveAccessLevel([], subjects, entity)).toBe(null);
    expect(canAccess([], subjects, entity, "view")).toBe(false);
  });

  it("ignores grants addressed to somebody else", () => {
    const other = { ...inherited, subject_type: "user" as const, subject_id: "rob" };
    expect(effectiveAccessLevel([other], subjects, entity)).toBe(null);
  });

  it("ignores grants on a different entity of the same id", () => {
    const sameIdOtherKind = { ...inherited, entity_type: "org" as const };
    expect(effectiveAccessLevel([sameIdOtherKind], subjects, entity)).toBe(null);
  });

  it("takes the HIGHEST of several grants, not the first or last", () => {
    const edit: EntityAccessGrant = {
      ...inherited,
      subject_type: "user",
      subject_id: "will",
      access_level: "edit",
      granted_from_entity_type: null,
      granted_from_entity_id: null,
    };
    // 'view' via the team, 'edit' directly — deliberately ordered high-then-low too.
    expect(effectiveAccessLevel([inherited, edit], subjects, entity)).toBe("edit");
    expect(effectiveAccessLevel([edit, inherited], subjects, entity)).toBe("edit");
    expect(canAccess([inherited, edit], subjects, entity, "edit")).toBe(true);
    expect(canAccess([inherited, edit], subjects, entity, "owner")).toBe(false);
  });

  it("ignores a malformed grant instead of honouring it", () => {
    const broken = { ...inherited, granted_from_entity_id: null };
    expect(effectiveAccessLevel([broken], subjects, entity)).toBe(null);
  });
});

describe("cascade preview mirrors the 0017 trigger", () => {
  const container = { entity_type: "org", entity_id: "the-title-base" } as const;
  const unrelatedDirect: EntityAccessGrant = {
    entity_type: "person",
    entity_id: "alex-greenwood",
    subject_type: "user",
    subject_id: "rob",
    access_level: "edit",
  };

  it("revokes the container's own grants AND the grants it granted", () => {
    const revoked = grantsRevokedByDeleting(
      [direct, inherited, unrelatedDirect],
      container,
    );
    expect(revoked).toEqual([direct, inherited]);
  });

  it("leaves unrelated direct grants alone — the point of recording provenance", () => {
    expect(grantsRevokedByDeleting([unrelatedDirect], container)).toEqual([]);
  });

  it("does not confuse a person id with an org id of the same value", () => {
    const personSameId: EntityAccessGrant = { ...direct, entity_type: "person" };
    expect(grantsRevokedByDeleting([personSameId], container)).toEqual([]);
  });
});
