import { describe, expect, it } from "vitest";
import networkFallback from "@/data/network.json";
import {
  buildCompanyRows,
  companyTotals,
  isCompany,
  type CompanyRowInput,
} from "@/lib/companies";
import type { Activity, Deal, Person, Vertical } from "@/lib/types";

const VERTICALS: Vertical[] = [
  { id: "title", name: "Title & Real Estate", color: "#38bdf8" },
];

function company(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    name: id.replace(/-/g, " "),
    entityKind: "company",
    verticalId: "title",
    status: "lit",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...over,
  } as Person;
}

function person(id: string, orgId?: string): Person {
  return {
    id,
    name: id,
    entityKind: "person",
    verticalId: "title",
    status: "warm",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...(orgId ? { orgId } : {}),
  } as Person;
}

function deal(id: string, orgId: string, over: Partial<Deal> = {}): Deal {
  return {
    id,
    orgId,
    name: id,
    stage: "signed",
    referralSourced: false,
    keyDates: {},
    bookProtected: false,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  } as Deal;
}

function activity(id: string, occurredAt: string, over: Partial<Activity> = {}): Activity {
  return {
    id,
    type: "note",
    source: "manual",
    sourceContext: {},
    bookProtected: false,
    occurredAt,
    createdAt: occurredAt,
    ...over,
  } as Activity;
}

function input(over: Partial<CompanyRowInput> = {}): CompanyRowInput {
  return { people: [], verticals: VERTICALS, deals: [], ...over };
}

describe("buildCompanyRows", () => {
  it("returns companies only — zero person rows (increment 4a DoD)", () => {
    const rows = buildCompanyRows(
      input({ people: [company("acme"), person("jane", "acme"), person("solo")] }),
    );
    expect(rows.map((r) => r.id)).toEqual(["acme"]);
  });

  it("counts the people linked to each company", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme"), person("jane", "acme"), person("bob", "acme"), person("solo")],
      }),
    );
    expect(rows[0].peopleHere).toBe(2);
  });

  it("splits paid from owed and ignores quote-stage and lost deals", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme")],
        deals: [
          deal("d1", "acme", { stage: "paid", value: 2000 }),
          deal("d2", "acme", { stage: "invoiced", value: 5000 }),
          deal("d3", "acme", { stage: "quote_sent", value: 99000 }),
          deal("d4", "acme", { stage: "lost", value: 77000 }),
        ],
      }),
    );
    expect(rows[0].paidTotal).toBe(2000);
    expect(rows[0].owedTotal).toBe(5000);
    expect(rows[0].dealCount).toBe(4);
  });

  it("treats a paid DATE as paid even when the stage lags behind", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme")],
        deals: [deal("d1", "acme", { stage: "delivering", value: 2000, keyDates: { paid: "2026-07-23" } })],
      }),
    );
    expect(rows[0].paidTotal).toBe(2000);
    expect(rows[0].owedTotal).toBe(0);
  });

  it("excludes unreadable values from the totals and counts them — never zeroes", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme")],
        deals: [
          deal("d1", "acme", { stage: "invoiced", value: undefined }),
          deal("d2", "acme", { stage: "paid", value: Number.NaN }),
          deal("d3", "acme", { stage: "invoiced", value: 1000 }),
        ],
      }),
    );
    expect(rows[0].valueUnknownCount).toBe(2);
    expect(rows[0].owedTotal).toBe(1000);
    expect(rows[0].paidTotal).toBe(0);
  });

  it("never counts another company's deals", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme"), company("other")],
        deals: [deal("d1", "other", { stage: "invoiced", value: 5000 })],
      }),
    );
    expect(rows.find((r) => r.id === "acme")!.owedTotal).toBe(0);
    expect(rows.find((r) => r.id === "other")!.owedTotal).toBe(5000);
  });

  it("takes last touch from the newest activity on the company or its deals", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme")],
        deals: [deal("d1", "acme")],
        activities: [
          activity("a1", "2026-07-01T00:00:00Z", { orgId: "acme" }),
          activity("a2", "2026-07-20T00:00:00Z", { dealId: "d1" }),
          activity("a3", "2026-07-25T00:00:00Z", { orgId: "someone-else" }),
        ],
      }),
    );
    expect(rows[0].lastTouch).toBe("2026-07-20T00:00:00Z");
  });

  it("leaves last touch undefined when nothing has touched the company", () => {
    const rows = buildCompanyRows(input({ people: [company("acme")] }));
    expect(rows[0].lastTouch).toBeUndefined();
  });

  it("sorts by owed, then paid, then name", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("a-co"), company("b-co"), company("c-co")],
        deals: [
          deal("d1", "b-co", { stage: "invoiced", value: 9000 }),
          deal("d2", "c-co", { stage: "paid", value: 4000 }),
        ],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["b-co", "c-co", "a-co"]);
  });

  it("falls back to a placeholder vertical rather than throwing on a dangling id", () => {
    const rows = buildCompanyRows(
      input({ people: [company("acme", { verticalId: "gone" })] }),
    );
    expect(rows[0].verticalName).toBe("—");
  });

  it("runs over the real network fallback and yields only company rows", () => {
    const people = networkFallback.people as unknown as Person[];
    const rows = buildCompanyRows({
      people,
      verticals: networkFallback.verticals as unknown as Vertical[],
      deals: [],
    });
    expect(rows.length).toBe(people.filter(isCompany).length);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(people.find((p) => p.id === r.id)!.entityKind).toBe("company");
    }
  });
});

describe("companyTotals", () => {
  it("rolls the ledger up without inventing money", () => {
    const rows = buildCompanyRows(
      input({
        people: [company("acme"), company("beta")],
        deals: [
          deal("d1", "acme", { stage: "paid", value: 2000 }),
          deal("d2", "beta", { stage: "invoiced", value: 5000 }),
          deal("d3", "beta", { stage: "invoiced" }),
        ],
      }),
    );
    expect(companyTotals(rows)).toEqual({
      companies: 2,
      paidTotal: 2000,
      owedTotal: 5000,
      valueUnknownCount: 1,
    });
  });
});
