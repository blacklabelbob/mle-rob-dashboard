import { describe, it, expect } from "vitest";
import { intakePhase2Returns } from "../phases/phase2ReturnsIntake";
import { planPhase2ReturnsWrite } from "../phases/phase2ReturnsWrite";

const FORM_BODY = {
  customerId: "acme-roofing",
  laborHoursSaved: "12.5",
  laborCostPerHour: "48",
  revenueSincePhase2Start: "9000",
  revenueBasis: "attributed",
  measuredAt: "2026-07-28T12:00:00.000Z",
  measuredBy: "rob",
};

describe("intakePhase2Returns", () => {
  it("turns a browser form's strings into numbers the write door accepts", () => {
    const { submission, refusal } = intakePhase2Returns(FORM_BODY);
    expect(refusal).toBeUndefined();
    expect(submission!.laborHoursSaved).toBe(12.5);
    expect(submission!.laborCostPerHour).toBe(48);
    expect(submission!.revenueSincePhase2Start).toBe(9000);

    // The point of the seam: this exact body was unstorable before it existed.
    const plan = planPhase2ReturnsWrite(submission!);
    expect(plan.refusals).toEqual([]);
    expect(plan.row?.labor_hours_saved).toBe(12.5);
  });

  it("proves the gap it closes — the same form body is refused without the seam", () => {
    const plan = planPhase2ReturnsWrite(FORM_BODY as never);
    const reasons = plan.refusals.map((r) => r.reason);
    expect(reasons).toContain("bad_labor_hours_saved");
    expect(plan.row).toBeUndefined();
  });

  it("NEVER turns a blank field into a measurement of zero", () => {
    const { submission } = intakePhase2Returns({
      ...FORM_BODY,
      laborHoursSaved: "",
      revenueSincePhase2Start: "   ",
    });
    expect(submission!.laborHoursSaved).not.toBe(0);
    expect(submission!.revenueSincePhase2Start).not.toBe(0);

    // Blank must reach the door as missing, so it is refused rather than stored.
    const plan = planPhase2ReturnsWrite(submission!);
    const reasons = plan.refusals.map((r) => r.reason);
    expect(reasons).toContain("bad_labor_hours_saved");
    expect(reasons).toContain("bad_revenue");
    expect(plan.row).toBeUndefined();
  });

  it("keeps zero itself storable — zero is a measurement", () => {
    const { submission } = intakePhase2Returns({ ...FORM_BODY, laborHoursSaved: "0" });
    expect(submission!.laborHoursSaved).toBe(0);
    expect(planPhase2ReturnsWrite(submission!).refusals).toEqual([]);
  });

  it("does not coerce booleans — true is not one dollar", () => {
    const { submission } = intakePhase2Returns({
      ...FORM_BODY,
      revenueSincePhase2Start: true,
    });
    expect(submission!.revenueSincePhase2Start).not.toBe(1);
    expect(
      planPhase2ReturnsWrite(submission!).refusals.map((r) => r.reason),
    ).toContain("bad_revenue");
  });

  it("passes a non-numeric string through so the door names the refusal, not this seam", () => {
    const { submission, refusal } = intakePhase2Returns({
      ...FORM_BODY,
      laborCostPerHour: "twelve",
    });
    expect(refusal).toBeUndefined();
    expect(submission!.laborCostPerHour).toBe("twelve");
    expect(
      planPhase2ReturnsWrite(submission!).refusals.map((r) => r.reason),
    ).toContain("bad_labor_cost_per_hour");
  });

  it("leaves an already-numeric caller completely unchanged", () => {
    const numeric = {
      ...FORM_BODY,
      laborHoursSaved: 12.5,
      laborCostPerHour: 48,
      revenueSincePhase2Start: -250, // a refund month: real money, still allowed
    };
    const { submission } = intakePhase2Returns(numeric);
    expect(submission).toEqual(numeric);
    expect(planPhase2ReturnsWrite(submission!).refusals).toEqual([]);
  });

  it("does not invent fields that were never submitted", () => {
    const { submission } = intakePhase2Returns({ customerId: "acme-roofing" });
    expect("laborHoursSaved" in submission!).toBe(false);
  });

  it("copies the string fields verbatim — trimming stays the door's job", () => {
    const { submission } = intakePhase2Returns({
      ...FORM_BODY,
      measuredBy: "  rob  ",
      note: "  Q3 payroll export  ",
    });
    expect(submission!.measuredBy).toBe("  rob  ");
    expect(submission!.note).toBe("  Q3 payroll export  ");
  });

  it("refuses a body that is not an object at all", () => {
    for (const body of [null, undefined, "a string", 42, [FORM_BODY]]) {
      const result = intakePhase2Returns(body);
      expect(result.refusal).toBe("not_an_object");
      expect(result.submission).toBeUndefined();
    }
  });

  it("does not mutate the caller's body", () => {
    const body = { ...FORM_BODY };
    intakePhase2Returns(body);
    expect(body.laborHoursSaved).toBe("12.5");
  });
});
