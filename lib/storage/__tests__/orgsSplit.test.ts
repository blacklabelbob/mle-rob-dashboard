import { describe, expect, it } from "vitest";
import { fromOrgRow, fromPerson, routeReferrer, toEdge, toOrgPerson, toPerson } from "../supabaseStore";
import type { Person } from "@/lib/types";

// Task 2.0 dual-schema mapping (0003_orgs_split): orgs rows must round-trip as
// entityKind "company" Persons, edges must coalesce paired person/org FKs, and
// writes must route referred-by to the correct paired column. These mappers are
// what keeps the UI shape stable across the split.

const orgRow = {
  id: "cg-roofing",
  name: "CG Roofing",
  business: "CG Roofing LLC",
  vertical_id: "roofing",
  status: "lit",
  signed: true,
  key_dates: { signed: "2026-06-20" },
  phase_one: "in-progress",
  referred_by_id: null,
  referred_by_org_id: "gulf-coast",
};

describe("orgs split mappers", () => {
  it("maps an orgs row to a Person with entityKind company", () => {
    const p = toOrgPerson(orgRow);
    expect(p.entityKind).toBe("company");
    expect(p.id).toBe("cg-roofing");
    expect(p.signed).toBe(true);
  });

  it("coalesces referred_by_org_id into referredById on read", () => {
    expect(toOrgPerson(orgRow).referredById).toBe("gulf-coast");
    expect(toPerson({ ...orgRow, referred_by_id: "caleb", referred_by_org_id: null }).referredById).toBe("caleb");
  });

  it("coalesces paired edge FKs into fromId/toId", () => {
    const personEdge = toEdge({ id: "e1", from_id: "caleb", to_id: "will", from_org_id: null, to_org_id: null });
    expect(personEdge).toMatchObject({ fromId: "caleb", toId: "will" });
    const orgEdge = toEdge({ id: "e2", from_id: "caleb", to_id: null, from_org_id: null, to_org_id: "cg-roofing" });
    expect(orgEdge).toMatchObject({ fromId: "caleb", toId: "cg-roofing" });
  });

  it("pre-split edge rows (no org columns) still map", () => {
    expect(toEdge({ id: "e3", from_id: "a", to_id: "b" })).toMatchObject({ fromId: "a", toId: "b" });
  });

  const company: Person = {
    id: "cg-roofing",
    name: "CG Roofing",
    entityKind: "company",
    nodeType: "client",
    verticalId: "roofing",
    status: "lit",
    signed: true,
    keyDates: {},
    phaseOne: "in-progress",
    referredById: "caleb",
  };

  it("fromOrgRow drops entity_kind and keeps a valid node_type", () => {
    const row = fromOrgRow(company, false);
    expect("entity_kind" in row).toBe(false);
    expect(row.node_type).toBe("client");
    expect(row.referred_by_id).toBe("caleb");
    expect(row.referred_by_org_id).toBeNull();
  });

  it("fromOrgRow nulls node_types outside the orgs check constraint", () => {
    expect(fromOrgRow({ ...company, nodeType: "rep-candidate" }, false).node_type).toBeNull();
  });

  it("routeReferrer moves an org referrer to referred_by_org_id", () => {
    const row = routeReferrer({ referred_by_id: "gulf-coast" }, true);
    expect(row.referred_by_id).toBeNull();
    expect(row.referred_by_org_id).toBe("gulf-coast");
  });
});

// 2026-07-25 (MV2.0 §8 inc.5a): the org LINK was missing from both mappers, so
// prod people all read back orgId: undefined — the company headcount and the
// People-here rail could never populate, and any person save wrote NULL over
// the link. Read and write are pinned together here.
describe("person→org link round-trips", () => {
  const personRow = {
    id: "daniella-roach",
    name: "Daniella Roach",
    vertical_id: "roofing",
    status: "lit",
    signed: false,
    key_dates: {},
    phase_one: "not-started",
    org_id: "miga-food-manufacturing",
  };

  it("reads org_id into orgId", () => {
    expect(toPerson(personRow).orgId).toBe("miga-food-manufacturing");
  });

  it("treats a null org_id as unlinked, never as a company id", () => {
    expect(toPerson({ ...personRow, org_id: null }).orgId).toBeUndefined();
  });

  it("writes the link back so an upsert cannot silently unlink a person", () => {
    const p = toPerson(personRow);
    const write = fromPerson(p);
    expect(write.org_id).toBe("miga-food-manufacturing");
    // An unlinked person writes an explicit null, not a missing column.
    expect(fromPerson(toPerson({ ...personRow, org_id: null })).org_id).toBeNull();
  });

  it("strips the column for orgs, which have no org_id", () => {
    const orgWrite = fromOrgRow(toOrgPerson(orgRow), false);
    expect("org_id" in orgWrite).toBe(false);
  });
});

// Q70 inc.8 — the write-path split. Ids became record numbers in 0031; the handle that
// makes a row findable by name moved to `legacy_slug`. Everything upstream computes it
// (personHandleFor, orgHandleFor, newOrgToPerson), and the store was the one link in that
// chain that never wrote it — so every record created after the renumber was reachable by
// number and by nothing else. These tests pin BOTH halves of the asymmetry, because a fix
// that wrote `legacy_slug: null` when absent would trade a new-record bug for a worse one:
// erasing the handles on the 41 rows the migration backfilled.
describe("legacy_slug write path", () => {
  // A post-0031 row as it actually comes back from Supabase: numeric id, name kept in
  // `legacy_slug`.
  const storedRow = {
    id: "P-1004",
    legacy_slug: "caleb-green",
    name: "Caleb Green",
    vertical_id: "roofing",
    status: "lit",
    signed: false,
    key_dates: {},
    phase_one: "not-started",
  };

  const newPerson: Person = {
    id: "P-1042",
    legacySlug: "dana-reyes-2",
    name: "Dana Reyes",
    verticalId: "roofing",
    status: "cold",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
  };

  it("persists the handle on a newly minted record", () => {
    // Without this the ingest agent creates rows no human can look up by name.
    expect(fromPerson(newPerson).legacy_slug).toBe("dana-reyes-2");
  });

  it("omits the column — never nulls it — when the row carries no handle", () => {
    const write = fromPerson({ ...newPerson, legacySlug: undefined });
    expect("legacy_slug" in write).toBe(false);
  });

  it("round-trips an existing row unchanged, so an edit cannot break its old URLs", () => {
    const write = fromPerson(toPerson(storedRow));
    expect(write.legacy_slug).toBe("caleb-green");
  });

  it("carries the handle onto org rows too", () => {
    const write = fromOrgRow(toOrgPerson({ ...orgRow, legacy_slug: "cg-roofing" }), false);
    expect(write.legacy_slug).toBe("cg-roofing");
  });

  it("does not resurrect a handle a legacy-free row never had", () => {
    // `legacy_slug` absent from the DB row must stay absent from the write, not
    // reappear as the id — the id is a number now and would be a nonsense handle.
    const write = fromPerson(toPerson({ ...storedRow, legacy_slug: null }));
    expect("legacy_slug" in write).toBe(false);
  });
});
