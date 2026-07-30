import { describe, it, expect } from "vitest";
import { selectPhase2Returns, provenanceOf } from "@/lib/phases/phase2ReturnsSelect";
import type { Phase2ReturnsRow } from "@/lib/phases/phase2ReturnsDb";
import { planPhase2ReturnsWrite } from "@/lib/phases/phase2ReturnsWrite";

/** A readable stored row; every test overrides only the field it is about. */
function row(over: Partial<Phase2ReturnsRow> = {}): Phase2ReturnsRow {
  return {
    customer_id: "cust-1",
    labor_hours_saved: 10,
    labor_cost_per_hour: 50,
    revenue_since_phase2_start: 1000,
    revenue_basis: "top_line",
    measured_at: "2026-07-01T00:00:00.000Z",
    measured_by: "rob",
    source: "admin",
    note: null,
    superseded_at: null,
    ...over,
  };
}

describe("selectPhase2Returns — freshest wins", () => {
  it("picks the measurement with the newest measured_at, not the newest in the array", () => {
    const s = selectPhase2Returns([
      row({ measured_at: "2026-05-01T00:00:00.000Z", labor_hours_saved: 1 }),
      row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: 99 }),
      row({ measured_at: "2026-06-01T00:00:00.000Z", labor_hours_saved: 50 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(99);
    expect(s.measuredAt).toBe("2026-07-01T00:00:00.000Z");
    expect(s.considered).toBe(3);
    expect(s.newerUnusable).toBe(false);
  });

  it("compares parsed instants, so equivalent ISO spellings do not sort as text", () => {
    // "2026-07-01T00:00:00+00:00" > "2026-07-01T00:00:00.000Z" as strings, and is
    // the SAME instant — a text sort would call it newer than a genuinely later row.
    const s = selectPhase2Returns([
      row({ measured_at: "2026-07-01T00:00:00+00:00", labor_hours_saved: 1 }),
      row({ measured_at: "2026-07-02T00:00:00.000Z", labor_hours_saved: 2 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(2);
  });

  it("carries provenance for display but never folds it into the numbers", () => {
    const s = selectPhase2Returns([
      row({ measured_by: "will", revenue_basis: "attributed", source: "import", note: "Q3" }),
    ]);
    expect(s.measuredBy).toBe("will");
    expect(s.revenueBasis).toBe("attributed");
    expect(s.source).toBe("import");
    expect(s.note).toBe("Q3");
    expect(s.returns).toEqual({
      laborHoursSaved: 10,
      laborCostPerHour: 50,
      revenueSincePhase2Start: 1000,
    });
  });

  it("no rows selects nothing — AWAITING_DATA, with nothing invented", () => {
    for (const input of [[], null, undefined]) {
      const s = selectPhase2Returns(input);
      expect(s.returns).toBeUndefined();
      expect(s.excluded).toEqual([]);
      expect(s.considered).toBe(0);
    }
  });
});

describe("selectPhase2Returns — retraction stays visible", () => {
  it("never selects a retracted row, and reports it rather than dropping it", () => {
    const s = selectPhase2Returns([
      row({ measured_at: "2026-07-01T00:00:00.000Z", superseded_at: "2026-07-05T00:00:00.000Z" }),
    ]);
    expect(s.returns).toBeUndefined();
    // measured-then-retracted must not read identically to never-measured.
    expect(s.excluded).toEqual([
      { measuredAt: "2026-07-01T00:00:00.000Z", reason: "retracted" },
    ]);
    expect(s.considered).toBe(1);
  });

  it("falls back to the newest surviving measurement when the freshest was retracted", () => {
    const s = selectPhase2Returns([
      row({
        measured_at: "2026-07-01T00:00:00.000Z",
        labor_hours_saved: 99,
        superseded_at: "2026-07-05T00:00:00.000Z",
      }),
      row({ measured_at: "2026-06-01T00:00:00.000Z", labor_hours_saved: 50 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(50);
    // A retraction is a decision, not a data defect: it does not make the older
    // figure "quietly stale" the way an unreadable newer row does.
    expect(s.newerUnusable).toBe(false);
  });

  it("reports retracted before unreadable, so a deliberate act is not read as a defect", () => {
    const s = selectPhase2Returns([
      row({ labor_hours_saved: null, superseded_at: "2026-07-05T00:00:00.000Z" }),
    ]);
    expect(s.excluded[0].reason).toBe("retracted");
  });
});

describe("selectPhase2Returns — unreadable is refused, never coerced", () => {
  const unreadable: [string, Partial<Phase2ReturnsRow>][] = [
    ["null hours (never 0 — 0 is a real measurement)", { labor_hours_saved: null }],
    ["null rate", { labor_cost_per_hour: null }],
    ["null revenue", { revenue_since_phase2_start: null }],
    ["negative hours", { labor_hours_saved: -1 }],
    ["negative rate", { labor_cost_per_hour: -1 }],
    ["missing basis", { revenue_basis: null }],
    ["basis outside the CHECK", { revenue_basis: "gross" }],
    ["missing measured_at", { measured_at: null }],
    ["unparseable measured_at", { measured_at: "last tuesday" }],
    ["missing attribution", { measured_by: null }],
  ];

  for (const [name, over] of unreadable) {
    it(`refuses: ${name}`, () => {
      const s = selectPhase2Returns([row(over)]);
      expect(s.returns).toBeUndefined();
      expect(s.excluded[0].reason).toBe("unreadable");
    });
  }

  it("allows negative revenue — a refund month is real money", () => {
    const s = selectPhase2Returns([row({ revenue_since_phase2_start: -250 })]);
    expect(s.returns?.revenueSincePhase2Start).toBe(-250);
  });

  it("zero is a measurement, not a blank", () => {
    const s = selectPhase2Returns([
      row({ labor_hours_saved: 0, labor_cost_per_hour: 0, revenue_since_phase2_start: 0 }),
    ]);
    expect(s.returns).toEqual({
      laborHoursSaved: 0,
      laborCostPerHour: 0,
      revenueSincePhase2Start: 0,
    });
  });

  it("announces staleness when the row it skipped was NEWER than the one it picked", () => {
    const s = selectPhase2Returns([
      row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: null }),
      row({ measured_at: "2026-06-01T00:00:00.000Z", labor_hours_saved: 50 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(50);
    expect(s.newerUnusable).toBe(true);
  });

  it("does not cry stale over an OLDER unreadable row", () => {
    const s = selectPhase2Returns([
      row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: 50 }),
      row({ measured_at: "2026-05-01T00:00:00.000Z", labor_hours_saved: null }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(50);
    expect(s.newerUnusable).toBe(false);
  });

  it("an undateable excluded row is not evidence of a newer measurement", () => {
    const s = selectPhase2Returns([
      row({ measured_at: null, labor_hours_saved: null }),
      row({ measured_at: "2026-06-01T00:00:00.000Z", labor_hours_saved: 50 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(50);
    expect(s.newerUnusable).toBe(false);
  });
});

describe("selectPhase2Returns — contradiction on one instant", () => {
  it("selects nothing from two different readings stamped the same instant", () => {
    const s = selectPhase2Returns([
      row({ labor_hours_saved: 10 }),
      row({ labor_hours_saved: 40 }),
    ]);
    expect(s.returns).toBeUndefined();
    expect(s.excluded.map((e) => e.reason)).toEqual(["ambiguous_instant", "ambiguous_instant"]);
  });

  it("identical duplicates are not ambiguous — same numbers, same answer", () => {
    const s = selectPhase2Returns([row(), row({ source: "import" })]);
    expect(s.returns?.laborHoursSaved).toBe(10);
    expect(s.excluded).toEqual([]);
  });

  it("falls back past the contradicted instant and flags the result as stale", () => {
    const s = selectPhase2Returns([
      row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: 10 }),
      row({ measured_at: "2026-07-01T00:00:00.000Z", labor_hours_saved: 40 }),
      row({ measured_at: "2026-06-01T00:00:00.000Z", labor_hours_saved: 7 }),
    ]);
    expect(s.returns?.laborHoursSaved).toBe(7);
    expect(s.newerUnusable).toBe(true);
    expect(s.excluded.filter((e) => e.reason === "ambiguous_instant")).toHaveLength(2);
  });
});

describe("selectPhase2Returns — whose page this is", () => {
  it("refuses another customer's measurement when the customer is known", () => {
    const s = selectPhase2Returns(
      [row({ customer_id: "cust-2", labor_hours_saved: 99 }), row({ labor_hours_saved: 10 })],
      { customerId: "cust-1" },
    );
    expect(s.returns?.laborHoursSaved).toBe(10);
    expect(s.excluded).toEqual([
      { measuredAt: "2026-07-01T00:00:00.000Z", reason: "wrong_customer" },
    ]);
  });

  it("without a customerId it trusts the carrier's own eq filter", () => {
    const s = selectPhase2Returns([row({ customer_id: "cust-2" })]);
    expect(s.returns).toBeDefined();
  });
});

describe("selectPhase2Returns — the two doors agree", () => {
  it("selects every row the write door would have accepted", () => {
    const submissions = [
      { hours: 0, rate: 0, revenue: 0 },
      { hours: 12.5, rate: 42.75, revenue: -250 },
      { hours: 200, rate: 30, revenue: 90_000 },
    ];
    for (const s of submissions) {
      const plan = planPhase2ReturnsWrite({
        customerId: "cust-1",
        laborHoursSaved: s.hours,
        laborCostPerHour: s.rate,
        revenueSincePhase2Start: s.revenue,
        revenueBasis: "top_line",
        measuredAt: "2026-07-01T00:00:00.000Z",
        measuredBy: "rob",
      });
      expect(plan.row).toBeDefined();
      // The stored row, read straight back: a row one door accepted must not be a
      // row the other calls unreadable — that renders a real measurement as never
      // taken, under a money guarantee.
      const selected = selectPhase2Returns([{ ...plan.row!, superseded_at: null }]);
      expect(selected.returns).toEqual({
        laborHoursSaved: s.hours,
        laborCostPerHour: s.rate,
        revenueSincePhase2Start: s.revenue,
      });
    }
  });
});

describe("provenanceOf — the selection's provenance, without its audit detail", () => {
  it("carries basis, instant, measurer and the newer-unusable flag", () => {
    const sel = selectPhase2Returns([
      row({ measured_at: "2026-07-20T12:00:00Z", measured_by: "rob", revenue_basis: "attributed" }),
    ]);
    const p = provenanceOf(sel)!;
    expect(p.revenueBasis).toBe("attributed");
    expect(p.measuredAt).toBe("2026-07-20T12:00:00Z");
    expect(p.measuredBy).toBe("rob");
    expect(p.newerUnusable).toBe(false);
  });

  it("does NOT leak the audit fields into the guarantee's status object", () => {
    const p = provenanceOf(selectPhase2Returns([row({})]))!;
    expect(Object.keys(p).sort()).toEqual(
      ["measuredAt", "measuredBy", "newerUnusable", "revenueBasis"].sort(),
    );
  });

  it("no selected figure = no provenance, never an object of nulls", () => {
    expect(provenanceOf(selectPhase2Returns([]))).toBeUndefined();
  });
});
