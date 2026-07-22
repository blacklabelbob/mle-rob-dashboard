import { describe, expect, it } from "vitest";
import {
  findDuplicatePairs,
  normalizeEmail,
  normalizeName,
  type DedupRecord,
} from "@/lib/dedup/match";

const rec = (id: string, name: string, extra: Partial<DedupRecord> = {}): DedupRecord => ({
  id,
  name,
  ...extra,
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jon.Polk@ProLogix.COM ")).toBe("jon.polk@prologix.com");
  });
});

describe("normalizeName", () => {
  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeName("PropLogix,  LLC.")).toBe("proplogix llc");
    expect(normalizeName("  Jonathan   Polk ")).toBe("jonathan polk");
  });
});

describe("findDuplicatePairs", () => {
  // Task 3.5 DoD, first half: same-email-different-casing pair surfaces.
  it("surfaces same email with different casing as a high-confidence pair", () => {
    const pairs = findDuplicatePairs([
      rec("a", "Jon Polk", { email: "Jon@Acme.com" }),
      rec("b", "Jonathan Polk", { email: "jon@acme.com" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      aId: "a",
      bId: "b",
      signals: ["email-exact"],
      confidence: "high",
    });
    expect(pairs[0].evidence[0]).toContain("jon@acme.com");
  });

  // Task 3.5 DoD, second half: similar-but-distinct names do NOT surface.
  it("does not pair similar-but-distinct names (no fuzzy matching)", () => {
    expect(
      findDuplicatePairs([
        rec("a", "Jon Smith"),
        rec("b", "John Smith"),
        rec("c", "On Time Moving"),
        rec("d", "On Time Movers"),
      ])
    ).toEqual([]);
  });

  it("pairs identical names after case/punctuation normalization, at review confidence", () => {
    const pairs = findDuplicatePairs([
      rec("a", "PropLogix, LLC."),
      rec("b", "proplogix llc"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].signals).toEqual(["name-exact"]);
    expect(pairs[0].confidence).toBe("review");
  });

  it("pairs phones that differ only in formatting/country code (last 10 digits)", () => {
    const pairs = findDuplicatePairs([
      rec("a", "Alpha", { phone: "+1 (941) 555-0101" }),
      rec("b", "Beta", { phone: "9415550101" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].signals).toEqual(["phone-exact"]);
    expect(pairs[0].confidence).toBe("high");
  });

  it("ignores partial phone numbers (<10 digits) even when equal", () => {
    expect(
      findDuplicatePairs([
        rec("a", "Alpha", { phone: "555-0101" }),
        rec("b", "Beta", { phone: "555-0101" }),
      ])
    ).toEqual([]);
  });

  it("ignores empty/missing emails and names that normalize to nothing", () => {
    expect(
      findDuplicatePairs([
        rec("a", "—", { email: "  " }),
        rec("b", "***", { email: "" }),
      ])
    ).toEqual([]);
  });

  it("merges multiple signals into one pair, high confidence, stable signal order", () => {
    const pairs = findDuplicatePairs([
      rec("a", "Miga Food", { email: "Info@miga.com", phone: "(941) 555-0199" }),
      rec("b", "MIGA FOOD", { email: "info@miga.com", phone: "+19415550199" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].signals).toEqual(["email-exact", "phone-exact", "name-exact"]);
    expect(pairs[0].confidence).toBe("high");
    expect(pairs[0].evidence).toHaveLength(3);
  });

  it("is deterministic: pair ids are sorted and output order is input-order-independent", () => {
    const a = rec("z-later", "Same Co", { email: "x@y.com" });
    const b = rec("a-early", "Same Co", { email: "x@y.com" });
    const forward = findDuplicatePairs([a, b]);
    const reversed = findDuplicatePairs([b, a]);
    expect(forward).toEqual(reversed);
    expect(forward[0].aId).toBe("a-early");
    expect(forward[0].bId).toBe("z-later");
  });

  it("handles 3+ records sharing a key as all pairwise combinations", () => {
    const pairs = findDuplicatePairs([
      rec("a", "One", { email: "dup@x.com" }),
      rec("b", "Two", { email: "DUP@x.com" }),
      rec("c", "Three", { email: "dup@X.COM" }),
    ]);
    expect(pairs.map((p) => `${p.aId}+${p.bId}`)).toEqual(["a+b", "a+c", "b+c"]);
  });

  it("never pairs a record with itself and returns nothing for unique records", () => {
    expect(
      findDuplicatePairs([
        rec("a", "Solo", { email: "solo@x.com", phone: "9415550000" }),
        rec("b", "Other", { email: "other@x.com" }),
      ])
    ).toEqual([]);
  });
});
