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

  // Q91(a) inc.32 — the referral rung. lib/types.ts:4-7 has always defined `lit` as
  // "signed / paying / actively referring"; only the first two were implemented.
  describe("the referral rung", () => {
    it("lights a record that opened doors, and names the count in English", () => {
      const j = justifiedStatus({ status: "unlit", doorsOpened: 10 });
      expect(j.status).toBe("lit");
      expect(j.reason).toBe("opened 10 doors in the network");
      expect(j.evidence).toContain("doorsOpened=10");
    });

    it("says door, not doors, for one", () => {
      expect(justifiedStatus({ status: "unlit", doorsOpened: 1 }).reason).toBe(
        "opened 1 door in the network",
      );
    });

    it("ranks below money — a paid referrer is lit for the reason Rob cares about", () => {
      const j = justifiedStatus({ status: "lit", doorsOpened: 3, keyDates: { paid: "2026-07-18" } });
      expect(j.reason).toBe("paid 2026-07-18");
    });

    it("ranks above quoted — doors opened is further along than merely quoted", () => {
      const j = justifiedStatus({ status: "unlit", doorsOpened: 2, quotedAmount: 7000 });
      expect(j.status).toBe("lit");
      expect(j.reason).toBe("opened 2 doors in the network");
    });

    it("treats counted-zero exactly like an uncounted field, and prints neither", () => {
      // 0 must fall through to the money rungs, and must never appear as evidence:
      // "doorsOpened=0" beside a lit status reads as the finding when it is the
      // absence of one.
      const counted = justifiedStatus({ status: "lit", doorsOpened: 0 });
      const uncounted = justifiedStatus({ status: "lit" });
      expect(counted).toEqual(uncounted);
      expect(counted.evidence.join()).not.toContain("doorsOpened");
    });

    it("may defend a stored status but may never accuse one", () => {
      // The rung is the only non-provable one: an edge is the attribution chain, which
      // OVERLAPS with "actively referring" without being it. Stored warm + 1 door must
      // therefore surface as a look, never as "should be lit".
      expect(justifiedStatus({ status: "warm", doorsOpened: 1 }).provable).toBe(false);
      const d = statusDrift({ status: "warm", doorsOpened: 1 })!;
      expect(d.kind).toBe("understated");
      expect(d.assertable).toBe(false);
      // ...while a money rung in the same direction stays assertable.
      expect(statusDrift({ status: "unlit", quotedAmount: 7000 })!.assertable).toBe(true);
    });

    it("every other rung stays provable — the flag is not a general amnesty", () => {
      for (const r of [
        { status: "unlit" as const, keyDates: { paid: "2026-07-18" } },
        { status: "unlit" as const, keyDates: { invoiced: "2026-07-16" } },
        { status: "unlit" as const, signed: true },
        { status: "unlit" as const, quotedAmount: 7000 },
        { status: "unlit" as const, keyDates: { met: "2026-07-28" } },
        { status: "lit" as const },
      ]) {
        expect(justifiedStatus(r).provable).toBe(true);
      }
      expect(justifiedStatus({ status: "unlit" }, [{ status: "warm" }]).provable).toBe(true);
    });

    it("stops accusing P-1001 Rob Acheson — the record that IS the origin", () => {
      // The case that forced this rung. Measured on prod 2026-08-06 before the fix:
      // Rob stored `lit`, no money field on his own row, 10 referredById edges
      // pointing at him — so the ladder called it overstated and the badge would have
      // read "worth a look" on the record he opens most.
      const rob = { status: "lit" as const, doorsOpened: 10 };
      expect(statusDrift(rob)).toBeNull();
      // ...and it was genuinely drifting before the rung existed.
      expect(statusDrift({ status: "lit" })).not.toBeNull();
    });
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
    expect(report.items.map((r) => r.id)).toEqual(["C-2019"]);
    expect(report.items[0].drift.justified).toBe("warm");
    expect(report.items[0].drift.assertable).toBe(true);
    expect(report.membershipKnown).toBe(true);
    expect(report.withheldForMissingMembership).toEqual([]);
  });

  // Q91(a) inc.32 — driftReport is the ONLY caller allowed to supply doorsOpened,
  // because it is the only one holding every row.
  it("counts referral edges across the whole book, so a connector is not accused", () => {
    const rows = [
      p({ id: "P-1001", name: "Rob Acheson", status: "lit" }),
      p({ id: "P-2", referredById: "P-1001" }),
      p({ id: "P-3", referredById: "P-1001" }),
    ];
    // Rob holds no money field of his own; without the edge count he drifts.
    expect(statusDrift({ status: "lit" })).not.toBeNull();
    expect(driftReport(rows).items.map((r) => r.id)).not.toContain("P-1001");
  });

  it("a person who opened no doors is still judged on the rest of the ladder", () => {
    // The mirror of the above: the rung must not amnesty every row it touches.
    const rows = [p({ id: "P-9", name: "No Doors", status: "lit" })];
    const report = driftReport(rows);
    expect(report.items.map((r) => r.id)).toEqual(["P-9"]);
    expect(report.items[0].drift.kind).toBe("overstated");
    expect(report.items[0].drift.assertable).toBe(false);
  });

  it("a book where every status matches its facts reports nothing", () => {
    expect(driftReport([p({ id: "C-1", status: "unlit" })]).items).toEqual([]);
  });

  // Q91(c). The badge's precondition: a book that records no membership cannot be
  // asked the org rung, and must say so rather than answer it.
  describe("a book with no membership links at all", () => {
    const membershipBlind = [
      p({ id: "C-9", name: "Met Last Month Ltd", entityKind: "company", status: "warm" }),
      p({ id: "C-8", name: "Quoted Ltd", entityKind: "company", status: "unlit", quotedAmount: 7000 }),
      p({ id: "P-9", name: "A Person", entityKind: "person", status: "lit" }),
    ];

    it("declares that it cannot answer the org rung", () => {
      expect(driftReport(membershipBlind).membershipKnown).toBe(false);
    });

    it("withholds overstated ORG drift, and names every row it withheld", () => {
      const report = driftReport(membershipBlind);
      // C-9 stores `warm` with no fact of its own; with members unknowable the ladder
      // falls to `unlit`, which would print "no meeting, quote, signature or payment"
      // about a company that may well have been met. Withheld, not asserted.
      expect(report.withheldForMissingMembership).toEqual(["C-9"]);
      expect(report.items.map((r) => r.id)).not.toContain("C-9");
    });

    it("still reports UNDERSTATED org drift — members have no bearing on it", () => {
      const report = driftReport(membershipBlind);
      const c8 = report.items.find((r) => r.id === "C-8")!;
      expect(c8.drift.kind).toBe("understated");
      expect(c8.drift.assertable).toBe(true);
    });

    it("does not withhold PERSON drift — the org rung was never theirs", () => {
      const report = driftReport(membershipBlind);
      expect(report.items.map((r) => r.id)).toContain("P-9");
      expect(report.withheldForMissingMembership).not.toContain("P-9");
    });
  });
});

// Q91(c) — the split book, pinned against the real files rather than described.
//
// Rob asked why Omega Title reads unlit. Part of that answer is that the CRM has two
// books that do not hold the same company under `C-2019`, and the badge would be built
// on whichever one is loaded. This is NOT a bug to fix by copying real rows into the
// committed file — Q71 makes that file deliberately synthetic so the bundle carries no
// customer PII. It is a limit to state in a test so no surface treats it as truth.
describe("the committed file book is synthetic and membership-blind", () => {
  const committed = require("../../data/network.json") as {
    __synthetic?: boolean;
    people: Person[];
  };

  it("is flagged synthetic", () => {
    expect(committed.__synthetic).toBe(true);
  });

  it("holds a DIFFERENT company under C-2019 than the live book does", () => {
    // Live Supabase C-2019 is Omega Title (FL). The committed book's C-2019 is an
    // invented roofing company. Same id, different subject — so a badge computed from
    // the committed book is not a weaker statement about Omega, it is a statement
    // about someone else entirely.
    const c2019 = committed.people.find((r) => r.id === "C-2019")!;
    expect(c2019.name).toBe("Marlowe Roofing");
    expect(c2019.name).not.toContain("Omega");
  });

  it("carries zero orgId links, so driftReport must refuse the org rung on it", () => {
    expect(committed.people.filter((r) => r.orgId).length).toBe(0);
    expect(driftReport(committed.people).membershipKnown).toBe(false);
  });
});
