import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs module, no type declarations
import { isEligible, deriveStage, canMerge, planBackfill, filterExisting } from "../../scripts/backfill-crm.mjs";

const base = { id: "x", name: "X", key_dates: {}, signed: false, quoted_amount: null };

describe("isEligible (D-002 step 7: quoted/signed data present)", () => {
  it("rejects an empty row", () => {
    expect(isEligible(base)).toBe(false);
  });
  it("accepts quoted_amount 0 (verbatim copy, not invented)", () => {
    expect(isEligible({ ...base, quoted_amount: 0 })).toBe(true);
  });
  it("accepts signed flag and non-empty key_dates", () => {
    expect(isEligible({ ...base, signed: true })).toBe(true);
    expect(isEligible({ ...base, key_dates: { met: "2026-06-20" } })).toBe(true);
  });
});

describe("deriveStage ladder (furthest milestone wins)", () => {
  it("paid > invoiced > signed > quoted > met > new_lead", () => {
    expect(deriveStage({ ...base, key_dates: { paid: "1", signed: "1", quoted: "1" } })).toBe("paid");
    expect(deriveStage({ ...base, key_dates: { invoiced: "1", signed: "1" } })).toBe("invoiced");
    expect(deriveStage({ ...base, key_dates: { signed: "1", quoted: "1" } })).toBe("signed");
    expect(deriveStage({ ...base, signed: true })).toBe("signed");
    expect(deriveStage({ ...base, quoted_amount: 7000, key_dates: { quoted: "1", met: "1" } })).toBe("quote_sent");
    expect(deriveStage({ ...base, key_dates: { met: "1" } })).toBe("meeting_held");
    expect(deriveStage(base)).toBe("new_lead");
  });
});

describe("person↔org merge (the caleb-green / cg-roofing double-count guard)", () => {
  const org = { ...base, id: "cg", quoted_amount: 10000, signed: true, key_dates: { signed: "2026-06-22", invoiced: "2026-06-26" } };
  const person = { ...base, id: "caleb", org_id: "cg", signed: true, key_dates: { signed: "2026-06-22", invoiced: "2026-06-26" } };

  it("merges the mirrored engagement into ONE deal anchored to both", () => {
    const { deals } = planBackfill({ people: [person], orgs: [org] });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ id: "deal-cg", person_id: "caleb", org_id: "cg", value: 10000, stage: "invoiced" });
  });

  it("keeps separate deals when quoted amounts diverge (no silent money merge)", () => {
    const p2 = { ...person, quoted_amount: 5000 };
    const { deals, conflicts } = planBackfill({ people: [p2], orgs: [org] });
    expect(deals).toHaveLength(2);
    expect(conflicts).toHaveLength(1);
  });

  it("refuses to merge when the person holds key_dates the org lacks", () => {
    expect(canMerge({ ...person, key_dates: { paid: "2026-07-01" } }, org)).toBe(false);
  });
});

describe("planBackfill demo + activity handling", () => {
  it("skips demo-* rows but reports them (fiction stays out of money tables)", () => {
    const demo = { ...base, id: "demo-rita", quoted_amount: 12000, signed: true };
    const { deals, demoSkipped } = planBackfill({ people: [demo], orgs: [] });
    expect(deals).toHaveLength(0);
    expect(demoSkipped.map((r: { id: string }) => r.id)).toEqual(["demo-rita"]);
  });

  it("emits one meeting activity per row with a video/transcript URL, linked to its deal", () => {
    const p = { ...base, id: "p1", signed: true, meeting_video_url: "https://v", key_dates: { met: "2026-06-20", signed: "2026-06-22" } };
    const { activities } = planBackfill({ people: [p], orgs: [] });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ id: "act-meeting-p1", person_id: "p1", org_id: null, deal_id: "deal-p1", type: "meeting", recording_url: "https://v" });
    expect(activities[0].occurred_at).toBe("2026-06-20T12:00:00.000Z");
  });
});

describe("filterExisting (idempotency mechanism)", () => {
  it("re-run inserts nothing once ids exist", () => {
    const planned = [{ id: "deal-a" }, { id: "deal-b" }];
    expect(filterExisting(planned, ["deal-a"])).toEqual([{ id: "deal-b" }]);
    expect(filterExisting(planned, ["deal-a", "deal-b"])).toEqual([]);
  });
});
