// MC.2 gate tests: the 4 marketing KPIs — worked examples pinned to the
// canonical compute fns (formula/example drift fails here), DoD shape
// enforced (formula + named-source inputs + worked example per KPI),
// zero-denominator honesty (null, never 0/Infinity).

import { describe, expect, it } from "vitest";
import {
  MARKETING_KPIS,
  MARKETING_KPI_WORKED_EXAMPLES,
  bookingVolumeByChannel,
  costPerBookedCall,
  leadMagnetConversion,
  sourceCloseRate,
} from "../kpis/marketingKpis";

describe("MC.2 marketing KPI table (DoD shape)", () => {
  it("defines exactly the 4 base-PRD KPIs, each with formula + named-source inputs + coverage note", () => {
    expect(MARKETING_KPIS.map((k) => k.id)).toEqual([
      "cost_per_booked_call",
      "lead_magnet_conversion",
      "source_close_rate",
      "booking_volume_by_channel",
    ]);
    for (const kpi of MARKETING_KPIS) {
      expect(kpi.formula.length).toBeGreaterThan(10);
      expect(kpi.inputs.length).toBeGreaterThan(0);
      for (const input of kpi.inputs) {
        expect(input.sourceSystem.length).toBeGreaterThan(3); // named system, not blank
      }
      expect(kpi.coverageNote.length).toBeGreaterThan(10);
    }
  });

  it("every KPI has a worked example (base DoD), keyed 1:1 with the table", () => {
    expect(Object.keys(MARKETING_KPI_WORKED_EXAMPLES).sort()).toEqual(
      MARKETING_KPIS.map((k) => k.id).sort(),
    );
  });

  it("nothing claims computable_today while its inputs are unwired (honest coverage)", () => {
    // No bookings table, no deals.source column, no ads integration exist in
    // this repo today — if someone flips a KPI to computable_today they must
    // consciously break this pin and prove the wiring.
    for (const kpi of MARKETING_KPIS) {
      expect(kpi.coverage).not.toBe("computable_today");
    }
  });
});

describe("worked examples pin the canonical compute fns", () => {
  it("cost_per_booked_call: $600 / 4 calls = $150", () => {
    const ex = MARKETING_KPI_WORKED_EXAMPLES.cost_per_booked_call;
    expect(costPerBookedCall(ex.inputs.spend, ex.inputs.bookedCalls)).toBe(ex.expected);
  });

  it("lead_magnet_conversion: 12 / 200 = 6%", () => {
    const ex = MARKETING_KPI_WORKED_EXAMPLES.lead_magnet_conversion;
    expect(leadMagnetConversion(ex.inputs.submissions, ex.inputs.visitors)).toBe(ex.expected);
  });

  it("source_close_rate: referral 2/4, cold_email 1/5", () => {
    const ex = MARKETING_KPI_WORKED_EXAMPLES.source_close_rate;
    expect(sourceCloseRate(ex.inputs)).toEqual(ex.expected);
  });

  it("booking_volume_by_channel: groups + missing UTM → direct_unknown", () => {
    const ex = MARKETING_KPI_WORKED_EXAMPLES.booking_volume_by_channel;
    expect(bookingVolumeByChannel(ex.inputs)).toEqual(ex.expected);
  });
});

describe("zero-denominator honesty", () => {
  it("ratios return null (no data) — never 0, NaN, or Infinity", () => {
    expect(costPerBookedCall(600, 0)).toBeNull();
    expect(leadMagnetConversion(5, 0)).toBeNull();
  });

  it("sourceCloseRate/bookingVolume on empty input → empty object (absent, not zeroed)", () => {
    expect(sourceCloseRate([])).toEqual({});
    expect(bookingVolumeByChannel([])).toEqual({});
  });
});
