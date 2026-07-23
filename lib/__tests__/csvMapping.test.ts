import { describe, it, expect } from "vitest";
import { mapRealCsv, planRealImport } from "../csvMapping";
import { peopleToCsv } from "../csv";
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

function csv(...lines: string[]): string {
  return lines.join("\r\n") + "\r\n";
}

describe("mapRealCsv — header mapping template", () => {
  it("maps real-world aliases and combines First/Last into name", () => {
    const mapped = mapRealCsv(
      csv(
        "First Name,Last Name,Company,Cell Phone,Email Address,Mailing Address",
        "Jane,Roofer,Acme Roofing,555-0100,jane@x.com,123 Main St",
      ),
    );
    expect(mapped.mapping).toEqual({
      "First Name": "name",
      "Last Name": "name",
      Company: "business",
      "Cell Phone": "phone",
      "Email Address": "email",
    });
    expect(mapped.ignored).toEqual(["Mailing Address"]);
    const lines = mapped.csv.trim().split("\r\n");
    expect(lines[0]).toBe("name,business,phone,email");
    expect(lines[1]).toBe("Jane Roofer,Acme Roofing,555-0100,jane@x.com");
  });

  it("explicit name column wins over First/Last (which are then ignored, reported)", () => {
    const mapped = mapRealCsv(
      csv("Name,First Name,Last Name", "Jane Q. Roofer,Jane,Roofer"),
    );
    expect(mapped.mapping).toEqual({ Name: "name" });
    expect(mapped.ignored).toEqual(["First Name", "Last Name"]);
    expect(mapped.csv.trim().split("\r\n")[1]).toBe("Jane Q. Roofer");
  });

  it("first column wins when two map to the same field; later one reported", () => {
    const mapped = mapRealCsv(csv("Name,Phone,Cell", "Jane,555-0100,555-0999"));
    expect(mapped.mapping).toEqual({ Name: "name", Phone: "phone" });
    expect(mapped.ignored).toEqual(["Cell"]);
    expect(mapped.csv.trim().split("\r\n")[1]).toBe("Jane,555-0100");
  });

  it("canonical Task-4.3 headers pass through identity-mapped, nothing ignored", () => {
    const mapped = mapRealCsv(csv("name,kind,email", "Jane Roofer,person,jane@x.com"));
    expect(mapped.mapping).toEqual({ name: "name", kind: "kind", email: "email" });
    expect(mapped.ignored).toEqual([]);
  });

  it("keeps blank lines so plan line numbers point at the original file", () => {
    const plan = planRealImport(
      csv("First Name,Last Name", "Jane,Roofer", ",", "Bob,Builder"),
      [],
    );
    expect(plan.inserts.map((p) => p.name)).toEqual(["Jane Roofer", "Bob Builder"]);
    expect(plan.errors).toEqual([{ line: 3, reason: "blank line" }]);
  });
});

describe("planRealImport — tagged insert", () => {
  it("stamps every clean insert with [import: tag], preserving existing notes", () => {
    const plan = planRealImport(
      csv("Name,Notes", "Jane Roofer,met at expo", "Bob Builder,"),
      [],
      { tag: "roofing-list-2026-07" },
    );
    expect(plan.inserts.map((p) => p.notes)).toEqual([
      "met at expo [import: roofing-list-2026-07]",
      "[import: roofing-list-2026-07]",
    ]);
  });

  it("does not stamp dupes or touch existing records (dupes are never inserted)", () => {
    const existing = [person({ id: "jane-roofer", name: "Jane Roofer", notes: "original" })];
    const plan = planRealImport(csv("Name", "Jane Roofer"), existing, { tag: "t" });
    expect(plan.inserts).toEqual([]);
    expect(plan.dupes).toHaveLength(1);
    expect(existing[0].notes).toBe("original");
  });
});

describe("Task 4.4 DoD — 50-row real list, 3 planted dupes", () => {
  it("47 clean + 3 to review, zero silent drops (rows AND columns accounted)", () => {
    const existing = [
      person({ id: "d1", name: "Dupe ByEmail", email: "dupe1@x.com" }),
      person({ id: "d2", name: "Dupe ByPhone", phone: "(555) 010-0002" }),
      person({ id: "d3", name: "Dupe ByName" }),
    ];
    const lines = ["First Name,Last Name,Company,Cell Phone,Email Address,Fax"];
    for (let i = 1; i <= 47; i++) {
      lines.push(`Clean${i},Person,Co ${i},555-02${String(i).padStart(2, "0")},c${i}@x.com,f${i}`);
    }
    // planted dupes: one by email, one by phone (format differs), one by name
    lines.push("New,Contact,Co A,555-9001,dupe1@x.com,fA");
    lines.push("Other,Contact,Co B,5550100002,other@x.com,fB");
    lines.push("Dupe,ByName,Co C,555-9003,byname@x.com,fC");
    const plan = planRealImport(csv(...lines), existing, { tag: "dod-sample" });

    expect(plan.inserts).toHaveLength(47);
    expect(plan.dupes).toHaveLength(3);
    expect(plan.errors).toEqual([]);
    // zero silent drops: every data row lands in exactly one bucket…
    expect(plan.inserts.length + plan.dupes.length + plan.errors.length).toBe(50);
    // …and every column is accounted for (mapped or reported)
    expect(Object.keys(plan.mapping).length + plan.ignoredColumns.length).toBe(6);
    expect(plan.ignoredColumns).toEqual(["Fax"]);
    expect(plan.dupes.map((d) => d.matchId).sort()).toEqual(["d1", "d2", "d3"]);
    // tagged insert: attributable rows
    expect(plan.inserts.every((p) => p.notes?.includes("[import: dod-sample]"))).toBe(true);
  });

  it("round-trip: a canonical export re-imported through the mapper is all dupes", () => {
    const existing = [
      person({ id: "a", name: "Alice Roofer", email: "a@x.com" }),
      person({ id: "b", name: "Bob Builder", phone: "555-1" }),
    ];
    const plan = planRealImport(peopleToCsv(existing), existing);
    expect(plan.inserts).toEqual([]);
    expect(plan.errors).toEqual([]);
    expect(plan.dupes).toHaveLength(2);
    expect(plan.ignoredColumns).toEqual([]);
  });
});
