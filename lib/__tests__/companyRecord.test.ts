import { describe, expect, it } from "vitest";
import networkFallback from "@/data/network.json";
import {
  buildCompanyRecord,
  hasOwnerRoleSignal,
  companyRecordFromNetwork,
} from "@/lib/companyRecord";
import type { NetworkData, Person, Vertical } from "@/lib/types";

const VERTICALS: Vertical[] = [
  { id: "title", name: "Title & Real Estate", color: "#38bdf8" },
];

function base(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    name: id.replace(/-/g, " "),
    verticalId: "title",
    status: "warm",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...over,
  };
}

const company = (id: string, over: Partial<Person> = {}) =>
  base(id, { entityKind: "company", ...over });
const human = (id: string, over: Partial<Person> = {}) =>
  base(id, { entityKind: "person", ...over });

describe("hasOwnerRoleSignal", () => {
  it("fires only on role text that names the top of a company", () => {
    expect(hasOwnerRoleSignal("Owner")).toBe(true);
    expect(hasOwnerRoleSignal("co-founder & CEO")).toBe(true);
    expect(hasOwnerRoleSignal("Managing Partner")).toBe(true);
    expect(hasOwnerRoleSignal("Sales rep")).toBe(false);
    // No role text is NOT an owner — absence is never promoted.
    expect(hasOwnerRoleSignal(undefined)).toBe(false);
    expect(hasOwnerRoleSignal("")).toBe(false);
  });
});

describe("buildCompanyRecord", () => {
  const people = [
    company("acme", { name: "Acme Title", assignedRep: "will" }),
    human("zoe", { name: "Zoe Zephyr", orgId: "acme", role: "Office manager" }),
    human("amy", { name: "Amy Adams", orgId: "acme", role: "Owner" }),
    human("bob", { name: "Bob Best", orgId: "acme" }),
    human("elsewhere", { name: "Elsewhere Person", orgId: "other-co" }),
    human("unlinked", { name: "Unlinked Person" }),
    company("other-co", { name: "Other Co" }),
  ];

  it("renders header facts off the company row, never invented", () => {
    const rec = buildCompanyRecord({ companyId: "acme", people, verticals: VERTICALS })!;
    expect(rec.company.name).toBe("Acme Title");
    expect(rec.verticalName).toBe("Title & Real Estate");
    expect(rec.verticalColor).toBe("#38bdf8");
    expect(rec.rep).toBe("will");
  });

  it("puts an owner-signal person first, then name order", () => {
    const rec = buildCompanyRecord({ companyId: "acme", people, verticals: VERTICALS })!;
    expect(rec.peopleHere.map((p) => p.id)).toEqual(["amy", "bob", "zoe"]);
    expect(rec.ownerIdentified).toBe(true);
    // Role text is passed through verbatim; a person without one stays blank.
    expect(rec.peopleHere.find((p) => p.id === "bob")!.role).toBeUndefined();
    expect(rec.peopleHere.find((p) => p.id === "bob")!.ownerSignal).toBe(false);
  });

  it("says nobody is the owner rather than guessing one", () => {
    const noOwner = [
      company("acme"),
      human("zoe", { orgId: "acme", role: "Office manager" }),
    ];
    const rec = buildCompanyRecord({ companyId: "acme", people: noOwner, verticals: VERTICALS })!;
    expect(rec.ownerIdentified).toBe(false);
    expect(rec.peopleHere.every((p) => !p.ownerSignal)).toBe(true);
  });

  it("never borrows people from another company or the loose roster", () => {
    const rec = buildCompanyRecord({ companyId: "other-co", people, verticals: VERTICALS })!;
    expect(rec.peopleHere.map((p) => p.id)).toEqual(["elsewhere"]);
    const empty = buildCompanyRecord({
      companyId: "acme",
      people: [company("acme"), human("unlinked"), human("elsewhere", { orgId: "other-co" })],
      verticals: VERTICALS,
    })!;
    expect(empty.peopleHere).toEqual([]);
  });

  it("returns null for an unknown id AND for a person id — a human never renders the company shell", () => {
    expect(buildCompanyRecord({ companyId: "nope", people, verticals: VERTICALS })).toBeNull();
    expect(buildCompanyRecord({ companyId: "amy", people, verticals: VERTICALS })).toBeNull();
  });

  it("survives a company whose vertical is missing without faking one", () => {
    const rec = buildCompanyRecord({
      companyId: "acme",
      people: [company("acme", { verticalId: "gone" })],
      verticals: VERTICALS,
    })!;
    expect(rec.verticalName).toBeUndefined();
    expect(rec.verticalColor).toBeUndefined();
  });
});

describe("against the real network", () => {
  const data = networkFallback as unknown as NetworkData;

  it("every company in the ledger resolves to a record, and no person id does", () => {
    const companies = data.people.filter((p) => p.entityKind === "company");
    expect(companies.length).toBeGreaterThan(0);
    for (const c of companies) {
      expect(companyRecordFromNetwork(data, c.id)).not.toBeNull();
    }
    for (const p of data.people.filter((x) => x.entityKind !== "company")) {
      expect(companyRecordFromNetwork(data, p.id)).toBeNull();
    }
  });

  it("no rail row is itself a company", () => {
    const companyIds = new Set(
      data.people.filter((p) => p.entityKind === "company").map((p) => p.id),
    );
    for (const id of companyIds) {
      const rec = companyRecordFromNetwork(data, id)!;
      for (const row of rec.peopleHere) expect(companyIds.has(row.id)).toBe(false);
    }
  });
});
