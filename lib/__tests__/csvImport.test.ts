import { describe, it, expect } from "vitest";
import { planImport } from "../csvImport";
import { peopleToCsv, PEOPLE_CSV_COLUMNS } from "../csv";
import { Person } from "../types";

function person(overrides: Partial<Person>): Person {
  return {
    id: "p1",
    name: "Test Person",
    verticalId: "v1",
    status: "unlit",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...overrides,
  };
}

const HEADER = PEOPLE_CSV_COLUMNS.join(",");
// name-only rows via the full header would need 12 commas; use a small header.
function csv(...lines: string[]): string {
  return lines.join("\r\n") + "\r\n";
}

describe("planImport — clean rows", () => {
  it("plans inserts for new rows with slug ids and defaults", () => {
    const plan = planImport(csv("name,kind,email", "Jane Roofer,person,jane@x.com"), []);
    expect(plan.errors).toEqual([]);
    expect(plan.dupes).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    const p = plan.inserts[0];
    expect(p.id).toBe("jane-roofer");
    expect(p.entityKind).toBe("person");
    expect(p.status).toBe("unlit");
    expect(p.signed).toBe(false);
    expect(p.email).toBe("jane@x.com");
  });

  it("handles shuffled column order and company kind", () => {
    const plan = planImport(csv("kind,name", "company,Acme Roofing LLC"), []);
    expect(plan.inserts[0].entityKind).toBe("company");
    expect(plan.inserts[0].id).toBe("acme-roofing-llc");
  });

  it("de-collides generated slug ids against ledger and file", () => {
    const existing = [person({ id: "jane-roofer", name: "Different Jane" })];
    const plan = planImport(csv("name", "Jane Roofer"), existing);
    // name doesn't matcher-collide ("jane roofer" vs "different jane"), but
    // the slug does — suffix keeps it unique.
    expect(plan.inserts[0].id).toBe("jane-roofer-2");
  });

  it("accepts a referredById that exists on the ledger or earlier in the file", () => {
    const existing = [person({ id: "rob", name: "Rob A" })];
    const plan = planImport(
      csv("name,referredById", "New Guy,rob", "Second Guy,new-guy"),
      existing,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.inserts.map((p) => p.id)).toEqual(["new-guy", "second-guy"]);
  });
});

describe("planImport — dupes are flagged, never inserted", () => {
  it("flags an id collision with the ledger (import never overwrites)", () => {
    const existing = [person({ id: "jonathan-polk", name: "Jonathan Polk" })];
    const plan = planImport(csv("id,name", "jonathan-polk,Someone Else"), existing);
    expect(plan.inserts).toEqual([]);
    expect(plan.dupes).toHaveLength(1);
    expect(plan.dupes[0]).toMatchObject({
      line: 2,
      matchId: "jonathan-polk",
      matchWhere: "ledger",
      signals: ["id-exact"],
    });
  });

  it("flags matcher hits against the ledger (email/name exact-after-normalization)", () => {
    const existing = [
      person({ id: "jonathan-polk", name: "Jonathan Polk", email: "jp@proplogix.com" }),
    ];
    const plan = planImport(
      csv("name,email", "J. Different,JP@PropLogix.com", "jonathan polk,"),
      existing,
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.dupes).toHaveLength(2);
    expect(plan.dupes[0].signals).toContain("email-exact");
    expect(plan.dupes[1].signals).toContain("name-exact");
    expect(plan.dupes.every((d) => d.matchWhere === "ledger")).toBe(true);
  });

  it("flags intra-file dupes, keeping the earlier line", () => {
    const plan = planImport(csv("name,phone", "A One,555-123-4567", "B Two,(555) 123-4567"), []);
    expect(plan.inserts.map((p) => p.name)).toEqual(["A One"]);
    expect(plan.dupes).toHaveLength(1);
    expect(plan.dupes[0]).toMatchObject({ line: 3, matchWhere: "file", matchId: "a-one" });
  });

  it("does not flag collisions with demo rows", () => {
    const existing = [person({ id: "demo-1", name: "Demo Dan (DEMO)" })];
    const plan = planImport(csv("name", "Demo Dan (DEMO)"), existing);
    // name matches a demo row — not a real dupe; but slug still de-collides.
    expect(plan.dupes).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });
});

describe("planImport — errors by line", () => {
  it("rejects unknown columns and missing name column at the header", () => {
    expect(planImport(csv("name,quotedAmount", "X,5"), []).errors[0].reason).toContain(
      "unknown column",
    );
    expect(planImport(csv("id,email", "x,y@z.com"), []).errors[0].reason).toContain(
      '"name" column',
    );
  });

  it("reports blank interior lines, bad column counts, and missing names by line number", () => {
    const plan = planImport(csv("name,email", "Good Row,g@x.com", "", "Bad,Row,Extra", ",n@x.com"), []);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.errors).toEqual([
      { line: 3, reason: "blank line" },
      { line: 4, reason: expect.stringContaining("expected 2 column(s)") },
      { line: 5, reason: expect.stringContaining('missing required "name"') },
    ]);
  });

  it("rejects invalid status and unknown referredById", () => {
    const plan = planImport(
      csv("name,status,referredById", "S Guy,banana,", "R Guy,,ghost-id"),
      [],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.errors[0].reason).toContain('invalid status "banana"');
    expect(plan.errors[1].reason).toContain('unknown referredById "ghost-id"');
  });
});

describe("planImport — DoD scale + round-trip", () => {
  it("100-row CSV imports clean: 100 inserts, 0 dupes, 0 errors", () => {
    const rows = Array.from({ length: 100 }, (_, i) => `Unique Person ${i + 1},u${i + 1}@x.com`);
    const plan = planImport(csv("name,email", ...rows), [person({ id: "rob", name: "Rob A" })]);
    expect(plan.errors).toEqual([]);
    expect(plan.dupes).toEqual([]);
    expect(plan.inserts).toHaveLength(100);
    // deterministic ids
    expect(plan.inserts[0].id).toBe("unique-person-1");
    expect(plan.inserts[99].id).toBe("unique-person-100");
  });

  it("re-importing our own export flags every row as a dupe (id-exact), inserts nothing", () => {
    const existing = [
      person({ id: "a-one", name: "A One", email: "a@x.com" }),
      person({ id: "b-two", name: "B Two", entityKind: "company" }),
    ];
    const exported = peopleToCsv(existing);
    expect(exported.split("\r\n")[0]).toBe(HEADER);
    const plan = planImport(exported, existing);
    expect(plan.inserts).toEqual([]);
    expect(plan.errors).toEqual([]);
    expect(plan.dupes).toHaveLength(2);
    expect(plan.dupes.every((d) => d.signals.includes("id-exact"))).toBe(true);
  });
});
