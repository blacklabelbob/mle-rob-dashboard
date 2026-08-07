import { describe, expect, it } from "vitest";
import { planCompanyConfirmations } from "../companyConfirmation";
import type { ActivityPlanRow, CrmOrg, CrmPerson } from "../activityPlan";

/**
 * Fixtures mirror the LIVE 2026-08-07 prod shapes behind flags #214/#215 — three CG Roofing rows
 * blocked on an empty Notion cell, one "Dix" row whose only near miss is a PERSON, and one row
 * whose cell already names a company the CRM does not hold. Inventing a cleaner geometry would
 * make this suite green about a plan prod never produces.
 */
const CG: CrmOrg = { id: "C-2017", name: "CG Roofing Group", domain: "cgroofinggroup.com" };
const GULF: CrmOrg = { id: "C-2018", name: "Gulf Coast RE Group" };
const ORGS = [CG, GULF];
const PEOPLE: CrmPerson[] = [{ id: "P-1010", name: "Dixith Magadiev", orgId: "C-2099" }];

function planRow(
  disposition: ActivityPlanRow["disposition"],
  opts: { id: string; recorded?: boolean; title?: string; nearMiss?: ActivityPlanRow["nearMiss"] },
): ActivityPlanRow {
  return {
    row: {
      id: opts.id,
      url: `https://app.notion.com/p/${opts.id}`,
      title: opts.title || "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform",
      day: "2026-06-16",
      recording: opts.recorded === false ? "" : "https://app.fireflies.ai/view/abc",
    },
    disposition,
    nearMiss: opts.nearMiss,
    nextStep: "n/a",
  } as ActivityPlanRow;
}

const HOST_MISS: ActivityPlanRow["nearMiss"] = {
  kind: "title-host",
  hits: [{ host: "cgroofinggroup.com", orgs: [CG] }],
};

describe("planCompanyConfirmations", () => {
  it("turns a confirmed candidate into one Notion cell carrying the CRM's own org name", () => {
    const rows = [planRow("no-company", { id: "page-1", nearMiss: HOST_MISS })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-1", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(refusals).toEqual([]);
    expect(writes).toHaveLength(1);
    // The name is copied off the CRM record, NOT off the confirmation — that is what makes the
    // next check:archive run resolve the row instead of leaving it blocked with a full cell.
    expect(writes[0].companyText).toBe("CG Roofing Group");
    expect(writes[0].orgId).toBe("C-2017");
    expect(writes[0].confirmedBy).toBe("rob");
    expect(writes[0].pageUrl).toBe("https://app.notion.com/p/page-1");
  });

  it("labels a human naming a different org as an override rather than silently honouring it", () => {
    const rows = [planRow("no-company", { id: "page-1", nearMiss: HOST_MISS })];
    const suggested = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-1", orgId: "C-2017", confirmedBy: "rob" },
    ]);
    const overridden = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-1", orgId: "C-2018", confirmedBy: "rob" },
    ]);

    expect(suggested.writes[0].source).toBe("candidate");
    // Honoured — a human who was in the meeting outranks a title match — but never unlabelled.
    expect(overridden.writes[0].source).toBe("off-candidate");
    expect(overridden.writes[0].companyText).toBe("Gulf Coast RE Group");
  });

  it("NEVER overwrites a cell a human already typed into", () => {
    // `unknown-company` means the cell holds text; the CRM just does not hold that company.
    const rows = [planRow("unknown-company", { id: "page-2", title: "Rob | cgroofing.net" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-2", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("cell-not-empty");
  });

  it("refuses an ambiguous-company row for the same reason, not a different one", () => {
    const rows = [planRow("ambiguous-company", { id: "page-3" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-3", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("cell-not-empty");
  });

  it("refuses a person id — an employer is not the meeting's counterparty", () => {
    const rows = [planRow("no-company", { id: "page-4", title: "Rob & Dix" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-4", orgId: "P-1010", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("person-not-company");
    // The person's employer C-2099 must appear nowhere in the plan.
    expect(JSON.stringify({ writes, refusals })).not.toContain("C-2099");
  });

  it("refuses an org the CRM does not hold rather than writing the confirmed string", () => {
    const rows = [planRow("no-company", { id: "page-5" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-5", orgId: "C-9999", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("unknown-org");
  });

  it("refuses a row no recorder saw — Q84's pass, not Q85's", () => {
    const rows = [planRow("no-company", { id: "page-6", recorded: false })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-6", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("out-of-scope");
  });

  it("refuses a row whose blocker is the DAY, because filling a company leaves it blocked", () => {
    const rows = [planRow("no-date", { id: "page-7" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-7", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals[0].reason).toBe("not-a-company-blocker");
  });

  it("refuses a row that is already writable, and an id no row carries", () => {
    const rows = [planRow("attachable", { id: "page-8" })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-8", orgId: "C-2017", confirmedBy: "rob" },
      { pageId: "page-stale", orgId: "C-2017", confirmedBy: "rob" },
    ]);

    expect(writes).toEqual([]);
    expect(refusals.map((r) => r.reason)).toEqual(["not-blocked", "not-blocked"]);
  });

  it("refuses BOTH halves of a contradictory pair — the second only, first honoured in order", () => {
    const rows = [planRow("no-company", { id: "page-1", nearMiss: HOST_MISS })];
    const { writes, refusals } = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-1", orgId: "C-2017", confirmedBy: "rob" },
      { pageId: "page-1", orgId: "C-2018", confirmedBy: "will" },
    ]);

    expect(writes).toHaveLength(1);
    expect(writes[0].orgId).toBe("C-2017");
    expect(refusals[0].reason).toBe("duplicate");
    // The contradicting org is named in the refusal so a human can see what they collided with.
    expect(refusals[0].detail).toContain("C-2018");
  });

  it("plans three CG Roofing rows as three cells from three confirmations — one decision, typed once each", () => {
    const rows = ["page-a", "page-b", "page-c"].map((id) =>
      planRow("no-company", { id, nearMiss: HOST_MISS }),
    );
    const { writes, refusals } = planCompanyConfirmations(
      rows,
      ORGS,
      PEOPLE,
      rows.map((r) => ({ pageId: r.row.id, orgId: "C-2017", confirmedBy: "rob" })),
    );

    expect(refusals).toEqual([]);
    expect(writes.map((w) => w.pageId)).toEqual(["page-a", "page-b", "page-c"]);
    expect(new Set(writes.map((w) => w.companyText))).toEqual(new Set(["CG Roofing Group"]));
    expect(writes.every((w) => w.source === "candidate")).toBe(true);
  });

  it("plans nothing at all when no confirmation is given", () => {
    const rows = [planRow("no-company", { id: "page-1", nearMiss: HOST_MISS })];
    expect(planCompanyConfirmations(rows, ORGS, PEOPLE, [])).toEqual({ writes: [], refusals: [] });
  });
});
