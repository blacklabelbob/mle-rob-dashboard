import { describe, expect, it } from "vitest";
import { buildCompanyDeals } from "@/lib/companyDeals";
import type { Deal, DealStage, Person } from "@/lib/types";

function person(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    name: id.replace(/-/g, " "),
    verticalId: "title",
    status: "warm",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    entityKind: "person",
    ...over,
  };
}

function deal(id: string, stage: DealStage, over: Partial<Deal> = {}): Deal {
  return {
    id,
    name: id,
    stage,
    referralSourced: false,
    keyDates: {},
    bookProtected: false,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

const PEOPLE = [
  person("trent-brands", { orgId: "the-title-base" }),
  person("someone-else", { orgId: "other-co" }),
];

describe("buildCompanyDeals", () => {
  it("picks up deals anchored on the org and on people who work there", () => {
    const out = buildCompanyDeals({
      companyId: "the-title-base",
      people: PEOPLE,
      deals: [
        deal("org-deal", "paid", { orgId: "the-title-base", value: 2000 }),
        deal("person-deal", "quote_sent", { personId: "trent-brands", value: 500 }),
        deal("stranger", "paid", { personId: "someone-else", value: 9999 }),
      ],
    });
    expect(out.rows.map((r) => r.id)).toEqual(["org-deal", "person-deal"]);
  });

  it("names the person a deal came in through, and never for org-anchored paper", () => {
    const out = buildCompanyDeals({
      companyId: "the-title-base",
      people: PEOPLE,
      deals: [
        deal("org-deal", "paid", { orgId: "the-title-base", value: 2000 }),
        deal("person-deal", "signed", {
          personId: "trent-brands",
          value: 500,
          keyDates: { signed: "2026-07-01" },
        }),
      ],
    });
    expect(out.rows.find((r) => r.id === "org-deal")?.anchoredVia).toBeUndefined();
    expect(out.rows.find((r) => r.id === "person-deal")?.anchoredVia).toBe("trent brands");
  });

  it("flags a stage that asserts paperwork the key dates do not have", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [deal("d", "paid", { orgId: "c", value: 100 })],
    });
    expect(out.rows[0].flags.map((f) => f.code)).toEqual(["stage_without_evidence"]);
    expect(out.rows[0].flags[0].text).toContain("paid date");
  });

  it("does not flag a stage whose evidence date is present", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [deal("d", "paid", { orgId: "c", value: 100, keyDates: { paid: "2026-07-23" } })],
    });
    expect(out.rows[0].flags).toEqual([]);
  });

  it("a paid date with no value is reported as unknown, never as $0", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [deal("d", "paid", { orgId: "c", keyDates: { paid: "2026-07-23" } })],
    });
    expect(out.paidTotal).toBe(0);
    expect(out.valueMissing).toBe(1);
    expect(out.rows[0].flags.map((f) => f.code)).toEqual(["paid_date_without_value"]);
  });

  it("totals split paid from open and exclude lost and pre-quote stages", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [
        deal("paid", "paid", { orgId: "c", value: 2000, keyDates: { paid: "2026-07-23" } }),
        deal("invoiced", "invoiced", { orgId: "c", value: 1000, keyDates: { invoiced: "2026-07-20" } }),
        deal("lost", "lost", { orgId: "c", value: 5000 }),
        deal("early", "contacted", { orgId: "c", value: 400 }),
      ],
    });
    expect(out.paidTotal).toBe(2000);
    expect(out.openTotal).toBe(1000);
    expect(out.valueMissing).toBe(0);
  });

  it("sorts by ladder progress, then by value", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [
        deal("new", "new_lead", { orgId: "c" }),
        deal("small-paid", "paid", { orgId: "c", value: 10, keyDates: { paid: "2026-07-01" } }),
        deal("big-paid", "paid", { orgId: "c", value: 90, keyDates: { paid: "2026-07-01" } }),
        deal("mid", "negotiating", { orgId: "c", value: 50 }),
      ],
    });
    expect(out.rows.map((r) => r.id)).toEqual(["big-paid", "small-paid", "mid", "new"]);
  });

  it("reports the missing phase store ONCE, not once per deal", () => {
    const out = buildCompanyDeals({
      companyId: "c",
      people: [],
      deals: [deal("a", "paid", { orgId: "c" }), deal("b", "signed", { orgId: "c" })],
    });
    expect(out.phaseStoreAvailable).toBe(false);
    for (const row of out.rows) {
      expect(row.flags.every((f) => f.code !== "stage_without_evidence" || true)).toBe(true);
      expect(JSON.stringify(row.flags)).not.toContain("phase");
    }
  });

  it("a company with no deals returns empty totals, not fabricated ones", () => {
    const out = buildCompanyDeals({ companyId: "c", people: PEOPLE, deals: [] });
    expect(out.rows).toEqual([]);
    expect(out.paidTotal).toBe(0);
    expect(out.openTotal).toBe(0);
    expect(out.valueMissing).toBe(0);
  });
});
