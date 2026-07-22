import { describe, it, expect } from "vitest";
import { csvEscape, peopleToCsv, parseCsv, PEOPLE_CSV_COLUMNS } from "../csv";
import { Person } from "../types";

function person(overrides: Partial<Person>): Person {
  return {
    id: "p1",
    name: "Test Person",
    verticalId: "v1",
    status: "active" as Person["status"],
    signed: false,
    keyDates: {},
    phaseOne: {} as Person["phaseOne"],
    ...overrides,
  };
}

describe("csvEscape", () => {
  it("passes plain values through unquoted", () => {
    expect(csvEscape("Jonathan Polk")).toBe("Jonathan Polk");
  });
  it("returns empty for undefined/null/empty", () => {
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape("")).toBe("");
  });
  it("quotes commas, quotes, and newlines; doubles interior quotes", () => {
    expect(csvEscape("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(csvEscape('the "big" deal')).toBe('"the ""big"" deal"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("peopleToCsv", () => {
  it("emits header + rows, CRLF-terminated", () => {
    const csv = peopleToCsv([person({ id: "a", name: "Alice" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(PEOPLE_CSV_COLUMNS.join(","));
    expect(lines[1]).toContain("Alice");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("drops (DEMO) rows — demo records never leave the app", () => {
    const csv = peopleToCsv([
      person({ id: "a", name: "Real Person" }),
      person({ id: "b", name: "Jake Trainer (DEMO)" }),
    ]);
    expect(csv).toContain("Real Person");
    expect(csv).not.toContain("DEMO");
  });

  it("orders name A→Z with id tiebreak — deterministic export", () => {
    const shuffled = [
      person({ id: "z", name: "Bob" }),
      person({ id: "a", name: "Bob" }),
      person({ id: "m", name: "Alice" }),
    ];
    const a = peopleToCsv(shuffled);
    const b = peopleToCsv([...shuffled].reverse());
    expect(a).toBe(b);
    const names = parseCsv(a)
      .slice(1)
      .map((r) => [r[0], r[2]].join(":"));
    expect(names).toEqual(["m:Alice", "a:Bob", "z:Bob"]);
  });

  it("tags companies via entityKind in the kind column", () => {
    const csv = peopleToCsv([
      person({ id: "c1", name: "PropLogix", entityKind: "company" }),
      person({ id: "p1", name: "Ann" }),
    ]);
    const rows = parseCsv(csv).slice(1);
    const kindOf = Object.fromEntries(rows.map((r) => [r[2], r[1]]));
    expect(kindOf["PropLogix"]).toBe("company");
    expect(kindOf["Ann"]).toBe("person");
  });
});

describe("parseCsv", () => {
  it("parses quoted fields with commas, doubled quotes, and newlines", () => {
    const rows = parseCsv('a,"b,c","say ""hi""","l1\nl2"\r\n');
    expect(rows).toEqual([["a", "b,c", 'say "hi"', "l1\nl2"]]);
  });

  it("handles LF and CRLF endings identically", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual(parseCsv("a,b\r\nc,d\r\n"));
  });

  it("keeps interior blank lines (import reports them), drops the trailing one", () => {
    const rows = parseCsv("a,b\n\nc,d\n");
    expect(rows).toEqual([["a", "b"], [""], ["c", "d"]]);
  });

  it("round-trips peopleToCsv exactly", () => {
    const people = [
      person({ id: "a", name: "Acme, Inc.", entityKind: "company", notes: 'multi\nline "note"' }),
      person({ id: "b", name: "Bob", email: "bob@x.com", phone: "555-1212" }),
    ];
    const rows = parseCsv(peopleToCsv(people));
    expect(rows[0]).toEqual([...PEOPLE_CSV_COLUMNS]);
    expect(rows).toHaveLength(3);
    const acme = rows.find((r) => r[2] === "Acme, Inc.")!;
    expect(acme[1]).toBe("company");
    expect(acme[PEOPLE_CSV_COLUMNS.indexOf("notes")]).toBe('multi\nline "note"');
  });
});
