import { describe, it, expect } from "vitest";
import {
  canonicalDedupeKey,
  sameFinding,
  findKeyDrift,
} from "../dedupeKeyIdentity";

// The row pair this module exists for — both live on prod, both filed on C-2010.
const F144 = { id: 144, dedupeKey: "org-hosts/duplicate-slot-C-2010" };
const F145 = { id: 145, dedupeKey: "org-host/C-2010-duplicate-slot" };

describe("canonicalDedupeKey", () => {
  it("takes out the drift that split #144 from #145", () => {
    expect(canonicalDedupeKey(F144.dedupeKey)).toBe(canonicalDedupeKey(F145.dedupeKey));
  });

  it("keeps producer-owned constants distinct from each other", () => {
    expect(canonicalDedupeKey("meeting-archive/crm-gap")).not.toBe(
      canonicalDedupeKey("meeting-archive/needs-human-account"),
    );
    expect(canonicalDedupeKey("meeting-archive/domain-near-miss")).not.toBe(
      canonicalDedupeKey("meeting-archive/crm-gap"),
    );
  });

  it("is stable for a key that never drifts", () => {
    expect(canonicalDedupeKey("unapplied-migrations")).toBe(
      canonicalDedupeKey("Unapplied Migration"),
    );
    expect(canonicalDedupeKey("meeting-archive/crm-gap")).toBe("archive-crm-gap-meeting");
  });

  it("refuses to invent an identity for nothing", () => {
    expect(canonicalDedupeKey(null)).toBeNull();
    expect(canonicalDedupeKey(undefined)).toBeNull();
    expect(canonicalDedupeKey("")).toBeNull();
    expect(canonicalDedupeKey("   ///  ")).toBeNull();
    expect(canonicalDedupeKey(42 as unknown as string)).toBeNull();
  });

  it("does not strip a plural that would leave a stub, nor an -ss word", () => {
    expect(canonicalDedupeKey("crm")).toBe("crm");
    expect(canonicalDedupeKey("gaps")).toBe("gap");
    expect(canonicalDedupeKey("address")).toBe("address");
  });
});

describe("sameFinding", () => {
  it("pairs the two spellings and nothing else", () => {
    expect(sameFinding(F144.dedupeKey, F145.dedupeKey)).toBe(true);
    expect(sameFinding("meeting-archive/crm-gap", "meeting-archive/crm-gap")).toBe(true);
    expect(sameFinding("meeting-archive/crm-gap", "meeting-archive/domain-near-miss")).toBe(false);
  });

  it("never calls two absent keys the same finding", () => {
    expect(sameFinding(null, null)).toBe(false);
    expect(sameFinding("", "")).toBe(false);
    expect(sameFinding(null, "meeting-archive/crm-gap")).toBe(false);
  });
});

describe("findKeyDrift", () => {
  it("reports the C-2010 pair as one identity spelled twice", () => {
    const groups = findKeyDrift([
      { id: 133, dedupeKey: "meeting-archive/crm-gap" },
      { id: 140, dedupeKey: "unapplied-migrations" },
      F144,
      F145,
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual([144, 145]);
    expect(groups[0].spellings).toEqual([F144.dedupeKey, F145.dedupeKey]);
  });

  it("leaves a key that is doing its job alone", () => {
    // Two rows on ONE spelling is the mechanism working, not drift.
    expect(
      findKeyDrift([
        { id: 1, dedupeKey: "meeting-archive/crm-gap" },
        { id: 2, dedupeKey: "meeting-archive/crm-gap" },
      ]),
    ).toEqual([]);
  });

  it("does not fold keyless rows in — that is the other, louder problem", () => {
    expect(
      findKeyDrift([
        { id: 1, dedupeKey: null },
        { id: 2, dedupeKey: null },
        { id: 3, dedupeKey: "  " },
      ]),
    ).toEqual([]);
  });

  it("finds nothing in an empty ledger", () => {
    expect(findKeyDrift([])).toEqual([]);
  });
});
