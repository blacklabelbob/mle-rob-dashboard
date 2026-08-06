import { describe, expect, it } from "vitest";
import { driftReport, justifiedStatus, statusDrift, type StatusFacts } from "../networkStatus";
import type { Person } from "../types";

// Q89 inc.28 — the three records Rob asked about in dev_chat on 2026-08-06 are the
// three fixtures below, copied from data/network.local.json rather than invented, so
// a change to the ladder is measured against the rows that prompted it.

const onTimeMoving: StatusFacts = {
  // C-2016 — "Why is On Time Moving & Storage Unlit" (#60)
  status: "unlit",
  signed: false,
  quotedAmount: 7000,
  keyDates: { quoted: "2026-07-17" },
};

const omegaTitle: StatusFacts = {
  // C-2019 — "Omega Tutle FL still unlit" (#58). The org row carries nothing at all;
  // everything that happened on 2026-07-28 was written onto its people.
  status: "unlit",
  signed: false,
  keyDates: {},
};
const omegaPeople: StatusFacts[] = [
  { status: "warm", signed: false, keyDates: { met: "2026-07-28" } }, // P-1023 Scott Dascani
  { status: "warm", signed: false, keyDates: { met: "2026-07-28" } }, // P-1024 Mike Stiber
  { status: "unlit", signed: false, keyDates: {} }, // P-1025 David Cochran
];

const gulfCoast: StatusFacts = {
  // C-2018 — "Why is Gulf Coast Realty just lit. even though theyre a customer" (#62)
  status: "lit",
  signed: true,
  quotedAmount: 19000,
  keyDates: { quoted: "2026-06-19", signed: "2026-07-18", paid: "2026-07-18" },
};

describe("justifiedStatus — the ladder", () => {
  it("a quote makes a record warm, not unlit", () => {
    const j = justifiedStatus(onTimeMoving);
    expect(j.status).toBe("warm");
    expect(j.reason).toBe("quoted $7,000");
    expect(j.evidence).toContain("quotedAmount=7000");
    expect(j.evidence).toContain("keyDates.quoted=2026-07-17");
  });

  it("payment outranks the quote that preceded it", () => {
    const j = justifiedStatus(gulfCoast);
    expect(j.status).toBe("lit");
    expect(j.reason).toBe("paid 2026-07-18");
  });

  it("signed=true lights a record even with no signed date", () => {
    expect(justifiedStatus({ status: "unlit", signed: true }).reason).toBe("signed=true");
  });

  it("an empty org is warmed by a person who was met, and says which one", () => {
    const j = justifiedStatus(omegaTitle, omegaPeople);
    expect(j.status).toBe("warm");
    expect(j.reason).toBe("a person here was met 2026-07-28");
    expect(j.evidence).toContain("member.keyDates.met=2026-07-28");
  });

  it("an empty org with no warm people stays unlit — the ladder invents nothing", () => {
    const j = justifiedStatus(omegaTitle, [{ status: "unlit", keyDates: {} }]);
    expect(j.status).toBe("unlit");
    expect(j.reason).toBe("no meeting, quote, signature or payment on the record");
    expect(j.evidence).toEqual([]);
  });

  it("a met date warms the record on its own", () => {
    expect(justifiedStatus({ status: "unlit", keyDates: { met: "2026-07-28" } }).status).toBe("warm");
  });

  it("a zero quote is not a quote", () => {
    expect(justifiedStatus({ status: "unlit", quotedAmount: 0 }).status).toBe("unlit");
  });
});

describe("statusDrift — direction decides whether it can be asserted", () => {
  it("On Time Moving is understated, and that IS assertable", () => {
    const d = statusDrift(onTimeMoving)!;
    expect(d).not.toBeNull();
    expect(d.kind).toBe("understated");
    expect(d.assertable).toBe(true);
    expect(d.stored).toBe("unlit");
    expect(d.justified).toBe("warm");
  });

  it("Omega Title is understated through its people", () => {
    const d = statusDrift(omegaTitle, omegaPeople)!;
    expect(d.kind).toBe("understated");
    expect(d.assertable).toBe(true);
  });

  it("Gulf Coast agrees with itself — a paid customer reading lit is not drift", () => {
    expect(statusDrift(gulfCoast)).toBeNull();
  });

  it("a lit record with no money facts is overstated but NOT assertable", () => {
    // lit also means "actively referring", which no column records. The module must
    // report this and must refuse to call it an error.
    const d = statusDrift({ status: "lit", signed: false, keyDates: {} })!;
    expect(d.kind).toBe("overstated");
    expect(d.assertable).toBe(false);
  });

  it("never writes — the record handed in is unchanged", () => {
    const before = JSON.stringify(onTimeMoving);
    statusDrift(onTimeMoving);
    justifiedStatus(onTimeMoving);
    expect(JSON.stringify(onTimeMoving)).toBe(before);
  });
});

describe("driftReport", () => {
  const p = (over: Partial<Person>): Person =>
    ({
      id: "X",
      name: "X",
      verticalId: "v",
      status: "unlit",
      signed: false,
      keyDates: {},
      phaseOne: "not-started",
      ...over,
    }) as Person;

  it("attaches an org's people to the org by orgId and reports only real drift", () => {
    const rows = [
      p({ id: "C-2019", name: "Omega Title (FL)", status: "unlit" }),
      p({ id: "P-1023", name: "Scott Dascani", status: "warm", orgId: "C-2019", keyDates: { met: "2026-07-28" } }),
      p({ id: "C-2018", name: "Gulf Coast RE Group", status: "lit", signed: true, keyDates: { paid: "2026-07-18" } }),
    ];
    const report = driftReport(rows);
    expect(report.map((r) => r.id)).toEqual(["C-2019"]);
    expect(report[0].drift.justified).toBe("warm");
    expect(report[0].drift.assertable).toBe(true);
  });

  it("a book where every status matches its facts reports nothing", () => {
    expect(driftReport([p({ id: "C-1", status: "unlit" })])).toEqual([]);
  });
});
