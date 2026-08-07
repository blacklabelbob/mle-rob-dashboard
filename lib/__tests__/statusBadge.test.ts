import { describe, it, expect } from "vitest";
import { driftBadge, driftSummary } from "../statusBadge";
import { driftReport, statusDrift } from "../networkStatus";
import type { StatusDrift } from "../networkStatus";
import type { Person } from "../types";

function drift(record: Parameters<typeof statusDrift>[0], members: Parameters<typeof statusDrift>[1] = []): StatusDrift {
  const d = statusDrift(record, members);
  if (!d) throw new Error("fixture does not drift — the test needs one that does");
  return d;
}

describe("driftBadge — understated speaks, overstated only invites", () => {
  it("names the justified status in the indicative when the record proves it", () => {
    // On Time Moving: stored unlit, carries a $7,000 quote (Rob, dev_chat #60).
    const b = driftBadge(drift({ status: "unlit", quotedAmount: 7000 }));
    expect(b.tone).toBe("correctable");
    expect(b.headline).toBe("Should be warm");
    expect(b.detail).toBe("Stored as unlit — quoted $7,000.");
  });

  it("never calls an overstated record wrong, and says why it might not be", () => {
    // Gulf Coast: stored lit, no column records the referral that justifies it (#62).
    const b = driftBadge(drift({ status: "lit" }));
    expect(b.tone).toBe("review");
    expect(b.headline).toBe("Worth a look");
    expect(b.detail).toContain("Not necessarily wrong");
    expect(b.detail.toLowerCase()).not.toContain("should be");
    expect(b.detail.toLowerCase()).not.toContain("error");
  });

  it("counts the evidence rather than summarising it, singular included", () => {
    expect(driftBadge(drift({ status: "unlit", quotedAmount: 7000 })).evidenceLabel).toBe(
      "1 fact on the record",
    );
    expect(
      driftBadge(drift({ status: "unlit", signed: true, keyDates: { met: "2026-07-28" } }))
        .evidenceLabel,
    ).toBe("2 facts on the record");
    // An overstated record can carry nothing at all — the count must survive that.
    expect(driftBadge(drift({ status: "lit" })).evidenceLabel).toBe("0 facts on the record");
  });

  it("reports the org rung with the member's own date, not a summary", () => {
    // Omega Title: org row unlit, a person there was met (#58).
    const b = driftBadge(
      drift({ status: "unlit" }, [{ status: "warm", keyDates: { met: "2026-07-28" } }]),
    );
    expect(b.headline).toBe("Should be warm");
    // Both `reason` shapes have to read as English. A bare fact ("quoted $7,000") and
    // a clause ("a person here was met …") went through one template, and the first
    // wording only worked for the bare fact — it shipped to prod reading "this record
    // is a person here was met 2026-07-28". Asserted whole, not with toContain.
    expect(b.detail).toBe("Stored as unlit — a person here was met 2026-07-28.");
  });
});

// Q91(a), last line of the DoD — the Overview's drift count.
//
// The count is the one place the whole book is reduced to a sentence, so the failure
// mode is not a wrong badge, it is a NUMBER that reads as reassurance. Every test here
// exists for a way this line could quietly under-report.
describe("driftSummary — the Overview count", () => {
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

  it("says nothing at all when the book agrees with itself", () => {
    // Not "0 drifting" — a line that prints every day stops being read.
    const s = driftSummary(driftReport([p({ id: "C-1", status: "unlit" })]));
    expect(s).toEqual({ correctable: 0, review: 0, withheld: 0, line: null });
  });

  it("splits provable from merely-disagreeing, and never calls the second wrong", () => {
    const rows = [
      // Understated + provable: On Time Moving's $7,000 quote (Rob, dev_chat #60).
      p({ id: "C-8", name: "Quoted Ltd", entityKind: "company", status: "unlit", quotedAmount: 7000 }),
      // Overstated: stored `lit` with nothing on the row and no doors opened.
      p({ id: "P-9", name: "A Person", entityKind: "person", status: "lit", orgId: "C-8" }),
    ];
    const s = driftSummary(driftReport(rows));
    expect(s.correctable).toBe(1);
    expect(s.review).toBe(1);
    expect(s.line).toBe("1 record contradicts its own fields · 1 worth a look");
    // The asymmetry has to survive the reduction to a count: the overstated half may
    // never be totalled into an accusation.
    expect(s.line!.toLowerCase()).not.toContain("wrong");
    expect(s.line!.toLowerCase()).not.toContain("error");
  });

  it("pluralises both halves rather than printing '1 records'", () => {
    const rows = [
      p({ id: "C-8", entityKind: "company", status: "unlit", quotedAmount: 7000 }),
      p({ id: "C-7", entityKind: "company", status: "unlit", signed: true, orgId: "C-8" }),
      p({ id: "P-9", entityKind: "person", status: "lit", orgId: "C-8" }),
      p({ id: "P-8", entityKind: "person", status: "lit", orgId: "C-8" }),
    ];
    const s = driftSummary(driftReport(rows));
    expect(s.line).toBe("2 records contradict their own fields · 2 worth a look");
  });

  it("COUNTS the rows the book refused to judge — folding them in would read as agreement", () => {
    // The Q91(c) book: no row carries orgId, so overstated ORG drift is withheld.
    // `items.length` alone would report C-9 as a record that agrees with itself, which
    // is the opposite of what driftReport recorded about it.
    const membershipBlind = [
      p({ id: "C-9", name: "Met Last Month Ltd", entityKind: "company", status: "warm" }),
      p({ id: "C-8", name: "Quoted Ltd", entityKind: "company", status: "unlit", quotedAmount: 7000 }),
    ];
    const report = driftReport(membershipBlind);
    expect(report.withheldForMissingMembership).toEqual(["C-9"]);

    const s = driftSummary(report);
    expect(s.withheld).toBe(1);
    expect(s.line).toBe("1 record contradicts its own fields · 1 org this book cannot judge");
  });

  it("takes its verdict from driftBadge, so the count can never disagree with the tables", () => {
    // Understated-but-NOT-provable (the referral rung): driftReport marks it
    // `assertable: false`, driftBadge renders it "worth a look", and the count must
    // follow driftBadge — not `kind`, which would file this under contradicted.
    const rows = [
      p({ id: "P-1001", name: "Connector", entityKind: "person", status: "unlit" }),
      p({ id: "P-2", entityKind: "person", status: "unlit", referredById: "P-1001" }),
      p({ id: "P-3", entityKind: "person", status: "unlit", referredById: "P-1001" }),
    ];
    const report = driftReport(rows);
    const connector = report.items.find((r) => r.id === "P-1001")!;
    expect(connector.drift.kind).toBe("understated");
    expect(connector.drift.assertable).toBe(false);
    expect(driftBadge(connector.drift).tone).toBe("review");

    const s = driftSummary(report);
    expect(s.correctable).toBe(0);
    expect(s.review).toBe(1);
    expect(s.line).toBe("1 worth a look");
  });
});
