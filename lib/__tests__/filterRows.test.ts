import { describe, expect, it } from "vitest";
import { mapPageRows, isRowMapError } from "@/lib/filters/rows";
import { nextPageCursor } from "@/lib/filters/page";
import type { Person } from "@/lib/types";

// Q67b — the row seam. These tests exist to pin three things the route depends on:
// the mapping is the SAME one the rest of the dashboard reads rows through, `org` rows
// arrive as companies, and mapping happens AFTER the cursor is built.

const personRow = {
  id: "trent-brands",
  name: "Trent Brands",
  business: "The Title Base",
  node_type: "client",
  vertical_id: "title",
  phone: "+15551234567",
  email: null,
  referred_by_id: null,
  status: "lit",
  quoted_amount: 2000,
  signed: true,
  key_dates: { met: "2026-07-01" },
  phase_one: true,
  org_id: "the-title-base",
  created_at: "2026-07-23T08:53:55.096282+00:00",
};

const orgRow = {
  id: "the-title-base",
  name: "The Title Base",
  node_type: "client",
  vertical_id: "title",
  referred_by_id: null,
  referred_by_org_id: "proplogix",
  status: "lit",
  signed: true,
  key_dates: {},
  phase_one: true,
  created_at: "2026-07-23T08:53:55.096282+00:00",
};

describe("mapPageRows", () => {
  it("maps a person row through the store's own mapper — camelCase, nulls dropped", () => {
    const [p] = mapPageRows("person", [personRow]) as Person[];
    expect(p.id).toBe("trent-brands");
    expect(p.nodeType).toBe("client");
    expect(p.verticalId).toBe("title");
    expect(p.quotedAmount).toBe(2000);
    // DB null becomes undefined, not the string "null" and not an empty string.
    expect(p.email).toBeUndefined();
    // The 2026-07-25 orgId pairing is inherited rather than re-implemented — the bug that
    // left every Supabase-read person with orgId: undefined cannot recur through a second
    // field map here, because there is no second field map.
    expect(p.orgId).toBe("the-title-base");
  });

  it("maps an org row as a COMPANY — the one field `orgs` has no column for", () => {
    const [o] = mapPageRows("org", [orgRow]) as Person[];
    expect(o.entityKind).toBe("company");
    // orgs route referred-by through the paired org column (0003); mapping an org with the
    // person mapper would render a company as a person and drop this pointer.
    expect(o.referredById).toBe("proplogix");
  });

  it("maps deals and activities to their own domain shapes", () => {
    const [d] = mapPageRows("deal", [
      { id: "deal-x", org_id: "o", stage: "quoted", amount: 5000, created_at: "2026-07-01T00:00:00+00" },
    ]) as any[];
    expect(d.id).toBe("deal-x");
    expect(d.stage).toBe("quoted");

    const [a] = mapPageRows("activity", [
      { id: "act-x", type: "call", source: "dialer", person_id: "p", occurred_at: "2026-07-01T00:00:00+00" },
    ]) as any[];
    expect(a.id).toBe("act-x");
    expect(a.type).toBe("call");
    expect(a.personId).toBe("p");
    expect(a.occurredAt).toBe("2026-07-01T00:00:00+00");
  });

  it("empty page maps to an empty array, never a thrown error", () => {
    expect(mapPageRows("person", [])).toEqual([]);
  });

  it("refuses a row that is not a plain object rather than minting a ghost row", () => {
    for (const bad of [null, "row", 42, ["id"]]) {
      expect(() => mapPageRows("person", [bad])).toThrow(/not an object/);
    }
    try {
      mapPageRows("person", [null]);
    } catch (e) {
      expect(isRowMapError(e)).toBe(true);
      // The index is in the message: "row 0" is findable in a log, "a row" is not.
      expect((e as Error).message).toContain("row 0");
    }
  });

  it("refuses an unknown target instead of silently returning raw rows", () => {
    expect(() => mapPageRows("people" as any, [personRow])).toThrow(/unknown filter target/);
  });

  it("ORDER: the cursor must be built from RAW rows — mapped rows have no created_at", () => {
    const raw = [personRow];
    // The route's order: cursor first…
    expect(nextPageCursor(raw, 1)).toContain("2026-07-23T08:53:55.096282+00:00");
    // …because doing it the other way round throws on page 1 of a perfectly good view.
    const mapped = mapPageRows("person", raw);
    expect(() => nextPageCursor(mapped, 1)).toThrow(/created_at/);
  });
});
