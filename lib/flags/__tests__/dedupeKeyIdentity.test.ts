import { describe, it, expect } from "vitest";
import {
  canonicalDedupeKey,
  sameFinding,
  findKeyDrift,
  titleIdentity,
  findKeylessStacks,
  findTitleNearMisses,
} from "../dedupeKeyIdentity";

// The row pair this module exists for — both live on prod, both filed on C-2010.
const F144 = { id: 144, dedupeKey: "org-hosts/duplicate-slot-C-2010" };
const F145 = { id: 145, dedupeKey: "org-host/C-2010-duplicate-slot" };

describe("canonicalDedupeKey", () => {
  it("takes out the drift that split #144 from #145", () => {
    expect(canonicalDedupeKey(F144.dedupeKey)).toBe(canonicalDedupeKey(F145.dedupeKey));
  });

  it("keeps producer-owned constants distinct from each other", () => {
    expect(canonicalDedupeKey("meeting-archive/crm-gap")).not.toBe(
      canonicalDedupeKey("meeting-archive/needs-human-account"),
    );
    expect(canonicalDedupeKey("meeting-archive/domain-near-miss")).not.toBe(
      canonicalDedupeKey("meeting-archive/crm-gap"),
    );
  });

  it("is stable for a key that never drifts", () => {
    expect(canonicalDedupeKey("unapplied-migrations")).toBe(
      canonicalDedupeKey("Unapplied Migration"),
    );
    expect(canonicalDedupeKey("meeting-archive/crm-gap")).toBe("archive-crm-gap-meeting");
  });

  it("refuses to invent an identity for nothing", () => {
    expect(canonicalDedupeKey(null)).toBeNull();
    expect(canonicalDedupeKey(undefined)).toBeNull();
    expect(canonicalDedupeKey("")).toBeNull();
    expect(canonicalDedupeKey("   ///  ")).toBeNull();
    expect(canonicalDedupeKey(42 as unknown as string)).toBeNull();
  });

  it("does not strip a plural that would leave a stub, nor an -ss word", () => {
    expect(canonicalDedupeKey("crm")).toBe("crm");
    expect(canonicalDedupeKey("gaps")).toBe("gap");
    expect(canonicalDedupeKey("address")).toBe("address");
  });
});

describe("sameFinding", () => {
  it("pairs the two spellings and nothing else", () => {
    expect(sameFinding(F144.dedupeKey, F145.dedupeKey)).toBe(true);
    expect(sameFinding("meeting-archive/crm-gap", "meeting-archive/crm-gap")).toBe(true);
    expect(sameFinding("meeting-archive/crm-gap", "meeting-archive/domain-near-miss")).toBe(false);
  });

  it("never calls two absent keys the same finding", () => {
    expect(sameFinding(null, null)).toBe(false);
    expect(sameFinding("", "")).toBe(false);
    expect(sameFinding(null, "meeting-archive/crm-gap")).toBe(false);
  });
});

describe("findKeyDrift", () => {
  it("reports the C-2010 pair as one identity spelled twice", () => {
    const groups = findKeyDrift([
      { id: 133, dedupeKey: "meeting-archive/crm-gap" },
      { id: 140, dedupeKey: "unapplied-migrations" },
      F144,
      F145,
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual([144, 145]);
    expect(groups[0].spellings).toEqual([F144.dedupeKey, F145.dedupeKey]);
  });

  it("leaves a key that is doing its job alone", () => {
    // Two rows on ONE spelling is the mechanism working, not drift.
    expect(
      findKeyDrift([
        { id: 1, dedupeKey: "meeting-archive/crm-gap" },
        { id: 2, dedupeKey: "meeting-archive/crm-gap" },
      ]),
    ).toEqual([]);
  });

  it("does not fold keyless rows in — that is the other, louder problem", () => {
    expect(
      findKeyDrift([
        { id: 1, dedupeKey: null },
        { id: 2, dedupeKey: null },
        { id: 3, dedupeKey: "  " },
      ]),
    ).toEqual([]);
  });

  it("finds nothing in an empty ledger", () => {
    expect(findKeyDrift([])).toEqual([]);
  });
});

// Q84 inc.104 — the keyless 94. Both live prod rows verbatim; they are the whole reason
// the pairing rule below is exact rather than a similarity score.
const F142 = {
  id: 142,
  dedupeKey: null,
  entityName: "CRM follow-ups",
  title: "Overdue follow-up: task task-homeclonevault-equity-signoff (due 2026-07-31)",
};
const F120 = {
  id: 120,
  dedupeKey: null,
  entityName: "CRM follow-ups",
  title: "Overdue follow-up: task task-gulf-coast-equity-signoff (due 2026-07-29)",
};

describe("titleIdentity", () => {
  it("stands in for a key only where there is no key", () => {
    expect(titleIdentity(F142)).not.toBeNull();
    expect(titleIdentity({ ...F142, dedupeKey: "crm/overdue-followup" })).toBeNull();
  });

  it("refuses to invent one from half a row", () => {
    expect(titleIdentity({ id: 1, dedupeKey: null, entityName: "Flag ledger", title: null })).toBeNull();
    expect(titleIdentity({ id: 2, dedupeKey: null, entityName: null, title: "Something" })).toBeNull();
    expect(titleIdentity({ id: 3, dedupeKey: null, entityName: "  ", title: "  " })).toBeNull();
  });

  it("reads the same finding through a retyped title", () => {
    expect(titleIdentity({ id: 1, dedupeKey: null, entityName: "Flag ledger", title: "Duplicate host slots" })).toBe(
      titleIdentity({ id: 2, dedupeKey: null, entityName: "flag ledger", title: "duplicate  host-slot" }),
    );
  });
});

describe("findKeylessStacks", () => {
  it("does NOT pair the two live overdue-task rows", () => {
    // The point of the whole increment: these differ by a deal slug, so they are two findings.
    expect(findKeylessStacks([F142, F120])).toEqual([]);
  });

  it("pairs a keyless row filed twice on one record", () => {
    const a = { id: 1, dedupeKey: null, entityName: "Flag ledger", title: "Duplicate host slot" };
    const b = { id: 2, dedupeKey: null, entityName: "Flag Ledger", title: "duplicate host slots" };
    const stacks = findKeylessStacks([a, b, F142]);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("keeps one title on two different records apart", () => {
    expect(
      findKeylessStacks([
        { id: 1, dedupeKey: null, entityName: "Gulf Coast", title: "Missing invoice" },
        { id: 2, dedupeKey: null, entityName: "The Title Base", title: "Missing invoice" },
      ]),
    ).toEqual([]);
  });

  it("never outvotes a key that exists", () => {
    expect(
      findKeylessStacks([
        { id: 1, dedupeKey: "crm/x", entityName: "Flag ledger", title: "Same title" },
        { id: 2, dedupeKey: "crm/y", entityName: "Flag ledger", title: "Same title" },
      ]),
    ).toEqual([]);
  });
});

describe("findTitleNearMisses", () => {
  it("reports the #142/#120 pair and names the tokens that separate them", () => {
    const misses = findTitleNearMisses([F142, F120]);
    expect(misses).toHaveLength(1);
    expect(misses[0].rows.map((r) => r.id).sort()).toEqual([120, 142]);
    expect(misses[0].overlap).toBeGreaterThan(0.5);
    expect(misses[0].overlap).toBeLessThan(1);
    expect(misses[0].differing).toContain("homeclonevault");
    expect(misses[0].differing.some((t) => t.includes("gulf"))).toBe(true);
  });

  it("does not report a pair that findKeylessStacks already grouped", () => {
    const a = { id: 1, dedupeKey: null, entityName: "Flag ledger", title: "Duplicate host slot" };
    const b = { id: 2, dedupeKey: null, entityName: "Flag ledger", title: "duplicate host slots" };
    expect(findKeylessStacks([a, b])).toHaveLength(1);
    expect(findTitleNearMisses([a, b])).toEqual([]);
  });

  it("leaves two unrelated findings on one record alone", () => {
    expect(
      findTitleNearMisses([
        { id: 1, dedupeKey: null, entityName: "Flag ledger", title: "Duplicate host slot on C-2010" },
        { id: 2, dedupeKey: null, entityName: "Flag ledger", title: "Invoice never sent for phase two" },
      ]),
    ).toEqual([]);
  });

  it("says nothing about rows that carry keys", () => {
    expect(findTitleNearMisses([{ ...F142, dedupeKey: "a" }, { ...F120, dedupeKey: "b" }])).toEqual([]);
  });
});
