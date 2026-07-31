import { describe, expect, it } from "vitest";
import { planMeetingActivities, type CrmOrg } from "@/lib/meetings/activityPlan";
import type { ArchiveRowDetail } from "@/lib/meetings/unexplainedRows";

const row = (over: Partial<ArchiveRowDetail> = {}): ArchiveRowDetail => ({
  id: "n1",
  title: "Kickoff",
  day: "2026-07-22",
  ...over,
});

const ORGS: CrmOrg[] = [
  { id: "C-0001", name: "PropLogix, LLC." },
  { id: "C-0002", name: "Gulf Coast Roofing" },
];

describe("planMeetingActivities", () => {
  it("attaches when exactly one org matches after normalization", () => {
    const plan = planMeetingActivities([row({ company: "proplogix llc" })], ORGS);
    expect(plan.rows[0].disposition).toBe("attachable");
    expect(plan.rows[0].org?.id).toBe("C-0001");
    expect(plan.counts).toMatchObject({ considered: 1, attachable: 1 });
  });

  it("reports a company the CRM does not have rather than guessing the nearest", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofin" })], ORGS);
    expect(plan.rows[0].disposition).toBe("unknown-company");
    expect(plan.rows[0].org).toBeUndefined();
    expect(plan.counts.unknownCompany).toBe(1);
  });

  it("never picks between two orgs sharing a name — it lists both", () => {
    const twins: CrmOrg[] = [...ORGS, { id: "C-0009", name: "proplogix llc" }];
    const plan = planMeetingActivities([row({ company: "PropLogix, LLC." })], twins);
    expect(plan.rows[0].disposition).toBe("ambiguous-company");
    expect(plan.rows[0].candidates?.map((c) => c.id)).toEqual(["C-0001", "C-0009"]);
    expect(plan.rows[0].org).toBeUndefined();
  });

  it("does not split a company field that names two companies", () => {
    const plan = planMeetingActivities([row({ company: "PropLogix, LLC. & Gulf Coast Roofing" })], ORGS);
    expect(plan.rows[0].disposition).toBe("unknown-company");
  });

  it("separates 'nobody said who this was with' from a matching failure", () => {
    const plan = planMeetingActivities([row({ company: "   " }), row({ id: "n2" })], ORGS);
    expect(plan.rows.map((r) => r.disposition)).toEqual(["no-company", "no-company"]);
    expect(plan.counts).toMatchObject({ considered: 2, noCompany: 2, attachable: 0 });
  });

  it("ignores an unnamed CRM org instead of matching an unnamed archive row to it", () => {
    const plan = planMeetingActivities([row({ company: "  " })], [...ORGS, { id: "C-0000", name: "" }]);
    expect(plan.rows[0].disposition).toBe("no-company");
  });

  it("will not call a dateless row attachable even when the company is known", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofing", day: "" })], ORGS);
    expect(plan.rows[0].disposition).toBe("no-date");
    // The org IS reported — the human only has to supply the missing day, not re-find the company.
    expect(plan.rows[0].org?.id).toBe("C-0002");
    expect(plan.counts).toMatchObject({ attachable: 0, noDate: 1 });
  });

  it("carries the whole archive row through so a report needs no second lookup", () => {
    const plan = planMeetingActivities([row({ company: "Gulf Coast Roofing", url: "https://notion/x" })], ORGS);
    expect(plan.rows[0].row.day).toBe("2026-07-22");
    expect(plan.rows[0].row.url).toBe("https://notion/x");
  });

  it("is empty-safe on both sides", () => {
    expect(planMeetingActivities([], ORGS).counts.considered).toBe(0);
    expect(planMeetingActivities([row({ company: "PropLogix, LLC." })], []).rows[0].disposition).toBe("unknown-company");
  });
});
