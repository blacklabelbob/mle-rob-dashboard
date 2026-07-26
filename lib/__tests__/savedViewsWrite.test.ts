import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_SUBJECT_ID_LENGTH,
  parseViewListScope,
  parseViewOwner,
} from "@/lib/filters/page";
import { parseSavedViewInsert } from "@/lib/filters/savedViews";

/**
 * Q67b inc.1 — the request contract of the WRITE door (`POST/GET/DELETE /api/views`).
 * Pure, so ownership and id rules are pinned without a database.
 *
 * The read path already has its own parity suite (savedViews.test.ts); this one covers
 * only what the write door added, plus the two places it must agree with 0019.
 */

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0019_saved_views.sql"),
  "utf8",
);

const TREE = { op: "lit" as const, lit: { lit: "person.status", value: "lit" } };
const base = { target: "person", name: "Unlit people", filter: TREE };
const qs = (s: string) => new URLSearchParams(s);

describe("parseSubjectId — ids are closed, not escaped", () => {
  it("accepts the id shapes a real owner/team key takes", () => {
    for (const id of ["rob", "rob@aivoicetech.io", "user_12.3", "team-a:west", "a+b"]) {
      expect(parseViewOwner(id)).toBe(id);
    }
  });

  it("trims, because 0019 checks length(btrim(owner_id))", () => {
    expect(parseViewOwner("  rob  ")).toBe("rob");
  });

  it("refuses the PostgREST metacharacters that would restructure an or(...) filter", () => {
    // A comma closes the condition, a paren closes the group, a dot picks the operator.
    // An id that could do any of those is a caller choosing which rows come back.
    for (const evil of [
      "rob,scope.eq.team",
      "rob)",
      "and(scope.eq.team",
      'rob"',
      "rob'",
      "rob\\",
      "rob*",
    ]) {
      expect(() => parseViewOwner(evil), evil).toThrow(/not allowed in an id/);
    }
  });

  it("refuses absent, non-string, blank and oversized", () => {
    expect(() => parseViewOwner(null)).toThrow(/required/);
    expect(() => parseViewOwner(7)).toThrow(/required/);
    expect(() => parseViewOwner("   ")).toThrow(/empty/);
    expect(() => parseViewOwner("a".repeat(MAX_SUBJECT_ID_LENGTH + 1))).toThrow(
      /longer than/,
    );
    expect(parseViewOwner("a".repeat(MAX_SUBJECT_ID_LENGTH))).toHaveLength(
      MAX_SUBJECT_ID_LENGTH,
    );
  });
});

describe("parseViewListScope", () => {
  it("owner alone means personal-only — absent team is a real answer", () => {
    expect(parseViewListScope(qs("owner=rob"))).toEqual({ owner: "rob", team: null });
  });

  it("owner + team is the two-bucket list", () => {
    expect(parseViewListScope(qs("owner=rob&team=west"))).toEqual({
      owner: "rob",
      team: "west",
    });
  });

  it("present-but-blank team is a client bug, refused rather than read as absent", () => {
    expect(() => parseViewListScope(qs("owner=rob&team="))).toThrow(/\?team= is empty/);
  });

  it("there is no everyone's-views door — owner is required", () => {
    expect(() => parseViewListScope(qs("team=west"))).toThrow(/\?owner= is required/);
  });

  it("a team id cannot smuggle a filter clause either", () => {
    expect(() => parseViewListScope(qs("owner=rob&team=x,scope.eq.personal"))).toThrow(
      /not allowed in an id/,
    );
  });
});

describe("parseSavedViewInsert — what an INSERT is allowed to carry", () => {
  it("returns exactly the 0019 columns, ids trimmed", () => {
    expect(
      parseSavedViewInsert({ ...base, scope: "personal", owner_id: " rob " }),
    ).toEqual({ target: "person", name: "Unlit people", filter: TREE, scope: "personal", owner_id: "rob", team_id: null });
  });

  it("never defaults owner_id — no user records exist yet, so inventing one is inventing authorship", () => {
    expect(() => parseSavedViewInsert({ ...base, scope: "personal" })).toThrow(
      /has no owner_id/,
    );
    expect(() =>
      parseSavedViewInsert({ ...base, scope: "personal", owner_id: "  " }),
    ).toThrow(/has no owner_id/);
  });

  it("enforces 0019's saved_views_scope_ids pairing on the WRITE side too", () => {
    // A rule checked on read but not on write is a row the app can store and then
    // refuse to open.
    expect(SQL).toContain("saved_views_scope_ids");
    expect(() =>
      parseSavedViewInsert({ ...base, scope: "team", owner_id: "rob" }),
    ).toThrow(/team view has no team_id/);
    expect(() =>
      parseSavedViewInsert({ ...base, scope: "personal", owner_id: "rob", team_id: "west" }),
    ).toThrow(/personal view carries a team_id/);
  });

  it("refuses an unknown scope rather than widening to one", () => {
    expect(() =>
      parseSavedViewInsert({ ...base, scope: "org", owner_id: "rob" }),
    ).toThrow(/unknown scope/);
  });

  it("ignores id and the timestamps — those are the database's to assign", () => {
    const row = parseSavedViewInsert({
      ...base,
      scope: "personal",
      owner_id: "rob",
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("updated_at");
  });

  it("runs the filter through the SAME payload validator as the read path", () => {
    expect(() =>
      parseSavedViewInsert({
        ...base,
        filter: { op: "exec", args: [] },
        scope: "personal",
        owner_id: "rob",
      }),
    ).toThrow(/unknown operator/);
    expect(() =>
      parseSavedViewInsert({ ...base, name: "   ", scope: "personal", owner_id: "rob" }),
    ).toThrow();
  });

  it("refuses a non-object body", () => {
    expect(() => parseSavedViewInsert("nope")).toThrow(/must be an object/);
    expect(() => parseSavedViewInsert(null)).toThrow(/must be an object/);
  });
});
