import { describe, it, expect } from "vitest";
import { driftMark, driftBadge } from "../statusBadge";
import { statusDrift, driftReport } from "../networkStatus";
import type { StatusDrift } from "../networkStatus";
import type { Person } from "../types";

// Q91(a), ledger-table form. The risk this file exists for is not that the mark is
// ugly — it is that a shorter surface quietly makes a STRONGER claim than the record
// page does, because "worth a look" reads weak in a table and "wrong" reads decisive.

function drift(
  record: Parameters<typeof statusDrift>[0],
  members: Parameters<typeof statusDrift>[1] = [],
): StatusDrift {
  const d = statusDrift(record, members);
  if (!d) throw new Error("fixture does not drift — the test needs one that does");
  return d;
}

describe("driftMark — the row says the same thing the record page says", () => {
  it("names the justified status when the record proves it", () => {
    // On Time Moving: stored unlit, holds a $7,000 quote (Rob, dev_chat #60).
    const m = driftMark(drift({ status: "unlit", quotedAmount: 7000 }));
    expect(m.tone).toBe("correctable");
    expect(m.label).toBe("should be warm");
  });

  it("never accuses an overstated row, however little room the label has", () => {
    // Gulf Coast: stored lit, signed and paid — and `lit` also covers referring work.
    const m = driftMark(drift({ status: "lit" }));
    expect(m.tone).toBe("review");
    expect(m.label).toBe("worth a look");
    expect(m.label.toLowerCase()).not.toContain("should");
    expect(m.label.toLowerCase()).not.toContain("wrong");
    expect(m.label.toLowerCase()).not.toContain("error");
  });

  it("hovers the record page's own sentence, not a re-written short one", () => {
    for (const d of [drift({ status: "unlit", quotedAmount: 7000 }), drift({ status: "lit" })]) {
      // Whole-string, not toContain: a re-worded claim that happens to share a prefix
      // is exactly the divergence this asserts against (inc.31's bug was a toContain).
      expect(driftMark(d).title).toBe(driftBadge(d).detail);
      expect(driftMark(d).tone).toBe(driftBadge(d).tone);
    }
  });
});

describe("understated-but-unprovable reads forwards, not backwards", () => {
  // C-2019 Omega Title on prod: stored `unlit`, five attribution edges point out of it,
  // so the referral rung justifies `lit` — understated, and NOT provable (an edge means
  // "who introduced them", which overlaps with "actively referring" without being it).
  // Before this branch existed the overstated sentence printed about it, backwards:
  // "the fields here only justify lit … unlit also covers a relationship the columns
  // do not hold" — about a record stored BELOW what its own fields show.
  const d = drift({ status: "unlit", doorsOpened: 5 });

  it("is understated, unassertable, and says so without accusing", () => {
    expect(d.kind).toBe("understated");
    expect(d.assertable).toBe(false);
    const b = driftBadge(d);
    expect(b.tone).toBe("review");
    expect(b.detail).toBe(
      "Stored as unlit; the record also shows opened 5 doors in the network, which can justify lit. Not proof on its own, so nothing here is called wrong.",
    );
    expect(b.detail.toLowerCase()).not.toContain("should be");
    expect(b.detail.toLowerCase()).not.toContain("only justify");
    expect(driftMark(d).label).toBe("worth a look");
  });

  it("leaves the overstated sentence alone — the two are not interchangeable", () => {
    const over = driftBadge(drift({ status: "lit" }));
    expect(over.detail).toContain("only justify");
    expect(over.detail).toContain("Not necessarily wrong");
  });
});

describe("the tables key off driftReport, so the guard cannot be bypassed", () => {
  // A book with no `orgId` anywhere — the committed data/network.json's actual state.
  // The company ledger must print NOTHING for an overstated org here, because the
  // ladder's `unlit` is unanswerable rather than true (Q91(c)).
  const book = [
    { id: "C-1", name: "Org", entityKind: "company", status: "warm", keyDates: {} },
    { id: "P-1", name: "Human", entityKind: "person", status: "lit", keyDates: {} },
  ] as unknown as Person[];

  it("withholds the overstated org row and still surfaces the person", () => {
    const report = driftReport(book);
    const byId: Record<string, StatusDrift> = {};
    for (const i of report.items) byId[i.id] = i.drift;

    expect(report.membershipKnown).toBe(false);
    expect(report.withheldForMissingMembership).toEqual(["C-1"]);
    // The table renders `drift?.[id]` — absent means no mark at all.
    expect(byId["C-1"]).toBeUndefined();
    expect(driftMark(byId["P-1"]).label).toBe("worth a look");
  });
});
