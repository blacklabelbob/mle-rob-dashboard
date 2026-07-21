import { describe, expect, it } from "vitest";
import { fromOrgRow, routeReferrer, toEdge, toOrgPerson, toPerson } from "../supabaseStore";
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
