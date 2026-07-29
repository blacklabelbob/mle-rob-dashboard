import { describe, it, expect } from "vitest";
import { resolveRecord, canonicalRedirectId } from "../records/resolveRecord";

const rows = [
  { id: "P-1001", legacySlug: "caleb-green" },
  { id: "P-1002", legacySlug: "dana-reyes" },
  { id: "P-1003", legacySlug: "dana-reyes-2" },
  { id: "C-2001", legacySlug: "the-title-base" },
];

describe("resolveRecord", () => {
  it("matches a current record number as canonical", () => {
    expect(resolveRecord(rows, "P-1001")).toEqual({ row: rows[0], canonical: true });
  });

  it("matches an old slug and reports it as NOT canonical", () => {
    expect(resolveRecord(rows, "caleb-green")).toEqual({ row: rows[0], canonical: false });
  });

  it("keeps the two Dana Reyes rows distinct through their old slugs", () => {
    expect(resolveRecord(rows, "dana-reyes")?.row.id).toBe("P-1002");
    expect(resolveRecord(rows, "dana-reyes-2")?.row.id).toBe("P-1003");
  });

  // The whole reason the exact pass runs over the FULL set before the legacy
  // pass: a row's old slug colliding with another row's live id must never open
  // the wrong record.
  it("an exact id wins over another row's identical legacy slug", () => {
    const shadowed = [
      { id: "P-9999", legacySlug: "P-1001" },
      { id: "P-1001", legacySlug: "caleb-green" },
    ];
    expect(resolveRecord(shadowed, "P-1001")).toEqual({ row: shadowed[1], canonical: true });
  });

  it("returns nothing when two rows share a legacy slug (ambiguous, never a guess)", () => {
    const dupes = [
      { id: "P-1", legacySlug: "mike-smith" },
      { id: "P-2", legacySlug: "mike-smith" },
    ];
    expect(resolveRecord(dupes, "mike-smith")).toBeNull();
  });

  it("returns nothing for an unknown id", () => {
    expect(resolveRecord(rows, "nobody")).toBeNull();
  });

  // An absent legacy_slug is not an identity: a blank/undefined request must not
  // land on the first row that never had a slug.
  it("blank, whitespace, null and undefined match nothing", () => {
    const withNulls = [{ id: "P-1" }, { id: "P-2", legacySlug: "" }];
    for (const req of ["", "   ", null, undefined]) {
      expect(resolveRecord(withNulls, req)).toBeNull();
      expect(resolveRecord(rows, req)).toBeNull();
    }
  });

  it("trims a padded request rather than 404ing on whitespace", () => {
    expect(resolveRecord(rows, " P-1001 ")?.row.id).toBe("P-1001");
    expect(resolveRecord(rows, " caleb-green ")?.row.id).toBe("P-1001");
  });

  it("works on pre-migration rows that carry no legacySlug at all", () => {
    const pre = [{ id: "caleb-green" }, { id: "dana-reyes" }];
    expect(resolveRecord(pre, "caleb-green")).toEqual({ row: pre[0], canonical: true });
    expect(resolveRecord(pre, "caleb-greene")).toBeNull();
  });
});

describe("canonicalRedirectId", () => {
  it("names the record number for an old slug", () => {
    expect(canonicalRedirectId(rows, "caleb-green")).toBe("P-1001");
  });

  it("is null when the URL is already canonical (no redirect loop)", () => {
    expect(canonicalRedirectId(rows, "P-1001")).toBeNull();
  });

  it("is null when nothing matches, so the caller still 404s", () => {
    expect(canonicalRedirectId(rows, "nobody")).toBeNull();
  });
});
