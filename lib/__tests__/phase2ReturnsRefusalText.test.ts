import { describe, expect, it } from "vitest";
import { phase2RefusalText, phase2RefusalsByField } from "@/lib/phases/phase2ReturnsRefusalText";
import { planPhase2ReturnsWrite } from "@/lib/phases/phase2ReturnsWrite";

// Q63 leg (5) inc.12. The point of these tests is not that a map returns strings —
// it is that EVERY refusal the door can actually produce has a sentence, proven by
// driving the real door rather than by reading the union type. A refusal added to
// `planPhase2ReturnsWrite` with no sentence here reaches a measurer as a raw code.

describe("phase2RefusalText", () => {
  it("gives every refusal the real door emits a sentence, not its code", () => {
    // One submission that trips as many rules as a single body can.
    const plan = planPhase2ReturnsWrite({
      customerId: "",
      measuredBy: "",
      measuredAt: "",
      revenueBasis: "" as never,
      laborHoursSaved: Number.NaN,
      laborCostPerHour: Number.NaN,
      revenueSincePhase2Start: Number.NaN,
    });

    expect(plan.row).toBeUndefined();
    expect(plan.refusals.length).toBeGreaterThan(0);
    for (const r of plan.refusals) {
      const text = phase2RefusalText(r.reason);
      expect(text, `refusal ${r.reason} has no sentence`).not.toBe(r.reason);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it("covers the malformed-shape refusals too, which a blank body never reaches", () => {
    const plan = planPhase2ReturnsWrite({
      customerId: "c1",
      measuredBy: "rob",
      measuredAt: "not a date",
      revenueBasis: "guessed" as never,
      laborHoursSaved: 1,
      laborCostPerHour: 1,
      revenueSincePhase2Start: 1,
    });

    const byField = phase2RefusalsByField(plan.refusals);
    expect(byField.measuredAt).toBe("That date could not be read. Use the picker, or an ISO instant.");
    expect(byField.revenueBasis).toContain("top line or attributed");
  });

  it("says a blank number is not a measurement of zero, because inc.8 made that true", () => {
    expect(phase2RefusalText("bad_labor_hours_saved")).toContain("enter 0");
    expect(phase2RefusalText("bad_labor_hours_saved")).toContain("not the same claim");
  });

  it("hands an unknown code back verbatim rather than hiding it behind an apology", () => {
    expect(phase2RefusalText("some_future_refusal")).toBe("some_future_refusal");
  });

  it("keeps the first reason per field so 'you left it blank' is not buried", () => {
    const byField = phase2RefusalsByField([
      { field: "measuredAt", reason: "no_measured_at" },
      { field: "measuredAt", reason: "bad_measured_at" },
    ]);
    expect(byField.measuredAt).toBe("Enter the date and time this measurement describes.");
  });
});
