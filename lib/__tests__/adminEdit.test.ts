import { describe, it, expect } from "vitest";
import { buildPatchRow, shapeRowForTable, FIELD_MAP } from "../adminEdit";

describe("buildPatchRow", () => {
  it("maps whitelisted camelCase fields to columns and drops unknown keys", () => {
    const row = buildPatchRow({ name: "PropLogix", quotedAmount: 7000, hax: "nope" });
    expect(row).toEqual({ name: "PropLogix", quoted_amount: 7000 });
  });

  it("turns empty string into null", () => {
    expect(buildPatchRow({ phone: "" })).toEqual({ phone: null });
  });

  it("paid key-date auto-upgrades node_type to client (Rob 2026-07-17 ruling)", () => {
    const row = buildPatchRow({ keyDates: { paid: "2026-07-01" } });
    expect(row.node_type).toBe("client");
  });

  // Q43: notes may ONLY be written through the virtual `notesHuman` field, which
  // the PATCH route recomposes against the stored row. A `notes` entry in
  // FIELD_MAP would let a caller overwrite the whole column and drop enrichment.
  it("refuses a raw notes write — the provenance guarantee has one door", () => {
    expect(FIELD_MAP.notes).toBeUndefined();
    expect(buildPatchRow({ notes: "wipes enrichment" })).toEqual({});
  });
});

describe("shapeRowForTable", () => {
  it("passes people rows through untouched (no referrer change)", () => {
    const row = { name: "X", node_type: "rep-candidate" };
    expect(shapeRowForTable(row, "people", false)).toEqual(row);
  });

  it("narrows people-only node_type values to null for orgs", () => {
    expect(shapeRowForTable({ node_type: "rep-candidate" }, "orgs", false).node_type).toBeNull();
    expect(shapeRowForTable({ node_type: "client" }, "orgs", false).node_type).toBe("client");
  });

  it("routes an org referrer to referred_by_org_id on either table", () => {
    for (const target of ["people", "orgs"] as const) {
      const out = shapeRowForTable({ referred_by_id: "proplogic" }, target, true);
      expect(out.referred_by_id).toBeNull();
      expect(out.referred_by_org_id).toBe("proplogic");
    }
  });

  it("routes a person referrer to referred_by_id and clears the org twin", () => {
    const out = shapeRowForTable({ referred_by_id: "polk" }, "orgs", false);
    expect(out.referred_by_id).toBe("polk");
    expect(out.referred_by_org_id).toBeNull();
  });

  it("clearing a referrer nulls both paired columns", () => {
    const out = shapeRowForTable({ referred_by_id: null }, "people", false);
    expect(out.referred_by_id).toBeNull();
    expect(out.referred_by_org_id).toBeNull();
  });

  it("every FIELD_MAP column exists on orgs (0003 mirrors people verbatim)", () => {
    // orgs column list from supabase/migrations/0003_orgs_split.sql
    const orgsCols = new Set([
      "id", "name", "business", "role", "vertical_id", "domain", "phone", "email",
      "website", "node_type", "status", "referred_by_id", "referred_by_org_id",
      "relationship", "quoted_amount", "signed", "meeting_video_url", "transcript_url",
      "key_dates", "phase_one", "est_time_to_payment_days", "description", "estimate",
      "notes", "assigned_rep", "created_at", "updated_at",
    ]);
    for (const col of Object.values(FIELD_MAP)) {
      expect(orgsCols.has(col), `orgs missing column ${col}`).toBe(true);
    }
  });
});
