import { describe, expect, it } from "vitest";
import networkFallback from "@/data/network.json";
import { reconcileLedger, splitLedger } from "@/lib/peopleLedger";
import type { Person } from "@/lib/types";

function node(id: string, entityKind?: Person["entityKind"]): Person {
  return {
    id,
    name: id,
    verticalId: "title",
    status: "warm",
    signed: false,
    keyDates: {},
    phaseOne: "not-started",
    ...(entityKind ? { entityKind } : {}),
  } as Person;
}

describe("splitLedger", () => {
  it("keeps companies out of the people ledger", () => {
    const { humans, companies } = splitLedger([
      node("trent-brands", "person"),
      node("the-title-base", "company"),
      node("gary", "person"),
    ]);
    expect(humans.map((h) => h.id)).toEqual(["trent-brands", "gary"]);
    expect(companies.map((c) => c.id)).toEqual(["the-title-base"]);
  });

  it("treats an unset entityKind as a human, never as a company", () => {
    // A row with no entityKind is an un-migrated person record. Guessing
    // "company" would vanish a human from the only ledger that lists them.
    const { humans, companies } = splitLedger([node("legacy-row")]);
    expect(humans.map((h) => h.id)).toEqual(["legacy-row"]);
    expect(companies).toHaveLength(0);
  });

  it("is exhaustive — no row lands on both sides or neither", () => {
    const rows = [
      node("a", "person"),
      node("b", "company"),
      node("c"),
      node("d", "company"),
    ];
    const { humans, companies } = splitLedger(rows);
    const ids = [...humans, ...companies].map((r) => r.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves order within each side", () => {
    const { humans } = splitLedger([node("z", "person"), node("a", "person")]);
    expect(humans.map((h) => h.id)).toEqual(["z", "a"]);
  });

  it("handles an empty ledger", () => {
    expect(splitLedger([])).toEqual({ humans: [], companies: [] });
  });
});

describe("reconcileLedger", () => {
  it("reconciles the two ledgers back to the combined total", () => {
    const r = reconcileLedger([
      node("a", "person"),
      node("b", "company"),
      node("c", "person"),
    ]);
    expect(r).toEqual({ total: 3, humans: 2, companies: 1, reconciles: true });
  });

  it("reconciles against the REAL network, and companies are a real share of it", () => {
    const people = networkFallback.people as unknown as Person[];
    const r = reconcileLedger(people);
    expect(r.total).toBe(people.length);
    expect(r.humans + r.companies).toBe(r.total);
    expect(r.reconciles).toBe(true);
    // Guards the DoD from a no-op filter: if the split ever stopped moving
    // companies out, this would read companies: 0 and still "reconcile".
    expect(r.companies).toBeGreaterThan(0);
    expect(r.humans).toBeGreaterThan(0);
  });
});
