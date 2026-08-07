/**
 * Q85 inc.17 — the title as its own evidence grade.
 *
 * The tests that matter here are not "does it find the org". They are the ones that pin the
 * SEPARATION: a title answer never becomes an attendee answer, never outranks one, and never
 * shares a field, a count, a marker or a copy-paste command with one.
 */

import { describe, expect, it } from "vitest";
import { indexOrgsByHost, type CrmOrg, type CrmPerson, type ActivityPlanRow } from "@/lib/meetings/activityPlan";
import { candidateOrgFromTitle } from "@/lib/meetings/titleOrgCandidate";
import {
  suggestCompaniesForEmptyCells,
  confirmArgFor,
  titleConfirmArgFor,
} from "@/lib/meetings/emptyCellSuggestions";

const ORGS: CrmOrg[] = [
  { id: "C-2017", name: "CG Roofing Group", domain: "cgroofinggroup.com" },
  { id: "C-2018", name: "Gulf Coast RE Group", domain: "gulfcoastre.com" },
  { id: "C-2005", name: "Martin Fierro Restaurant" },
];
const INDEX = indexOrgsByHost(ORGS);

describe("candidateOrgFromTitle", () => {
  it("reaches one org from a host stated in the title", () => {
    const c = candidateOrgFromTitle("Caleb, Rob, Will | CGRoofingGroup.com + AI Platform", ORGS, INDEX);
    expect(c.outcome).toBe("title-candidate");
    expect(c.orgId).toBe("C-2017");
    expect(c.evidence.map((e) => e.kind)).toContain("host");
  });

  it("reaches one org from a NAME stated in the title, by whole-token containment", () => {
    const c = candidateOrgFromTitle("Rob & Austin | MArtin Fierro", ORGS, INDEX);
    expect(c.outcome).toBe("title-candidate");
    expect(c.orgId).toBe("C-2005");
    expect(c.evidence.every((e) => e.kind === "name")).toBe(true);
  });

  it("says no-title-match for a title that names only a topic", () => {
    const c = candidateOrgFromTitle(
      "Robert Acheson, Austin Wilkins | Cloudflare / SEO optimization — 2026-08-03",
      ORGS,
      INDEX,
    );
    expect(c.outcome).toBe("no-title-match");
    expect(c.orgId).toBeUndefined();
  });

  it("says no-title-match on the seven-row shape: a title with no company in it at all", () => {
    expect(candidateOrgFromTitle("MLE TEAM KICKOFF", ORGS, INDEX).outcome).toBe("no-title-match");
    expect(candidateOrgFromTitle("Speaker 1 / Speaker 3", ORGS, INDEX).outcome).toBe("no-title-match");
    expect(candidateOrgFromTitle(null, ORGS, INDEX).outcome).toBe("no-title-match");
  });

  it("REFUSES to tiebreak a title that reaches two orgs", () => {
    const c = candidateOrgFromTitle("Rob | CGRoofingGroup.com + Martin Fierro", ORGS, INDEX);
    expect(c.outcome).toBe("ambiguous-title");
    expect(c.orgId).toBeUndefined();
    expect(c.competingOrgIds).toEqual(expect.arrayContaining(["C-2017", "C-2005"]));
  });

  // The containment rule inherited from `titleCompany` is exact, not fuzzy, and this pins the
  // consequence: one extra word a speaker added ("dinner") drops the name hit entirely rather
  // than nearly-matching. That is the refusal working, and it is deliberately not softened here.
  it("drops a name candidate carrying a word the org's name does not hold", () => {
    const c = candidateOrgFromTitle("Rob | CGRoofingGroup.com + Martin Fierro dinner", ORGS, INDEX);
    expect(c.outcome).toBe("title-candidate");
    expect(c.orgId).toBe("C-2017");
    expect(c.evidence.every((e) => e.kind === "host")).toBe(true);
  });

  it("treats a host and a name landing on the SAME org as one answer, not two", () => {
    const c = candidateOrgFromTitle("Rob | CGRoofingGroup.com CG Roofing Group", ORGS, INDEX);
    expect(c.outcome).toBe("title-candidate");
    expect(c.orgId).toBe("C-2017");
    // Two readings agreed; that is agreement, and it is still one org.
    expect(new Set(c.evidence.map((e) => e.orgId)).size).toBe(1);
  });

  it("stamps every result with grade 'title' so no consumer can render it unlabelled", () => {
    for (const title of ["CGRoofingGroup.com", "MLE TEAM KICKOFF", "CGRoofingGroup.com + Martin Fierro"]) {
      expect(candidateOrgFromTitle(title, ORGS, INDEX).grade).toBe("title");
    }
  });
});

/* ── the separation, at the join ───────────────────────────────────────────────────────── */

const PEOPLE: CrmPerson[] = [{ id: "P-1", name: "Dixith Rao", orgId: "C-2018" }];

/** Same shape inc.16's own suite uses: a recorder-seen row with an empty company cell. */
function emptyCellRow(id: string, title: string, overrides: Partial<ActivityPlanRow["row"]> = {}): ActivityPlanRow {
  return {
    row: {
      id,
      title,
      day: "2026-07-29",
      url: `https://notion.so/${id}`,
      recording: "https://fireflies.ai/view/abc",
      mleAttendees: ["Rob"],
      ...overrides,
    },
    disposition: "no-company",
  } as ActivityPlanRow;
}

describe("emptyCellSuggestions — the title class stays subordinate and separate", () => {
  it("does NOT consult the title when the attendees already answered", () => {
    const rows = [emptyCellRow("page-1", "CGRoofingGroup.com sync", { contactName: "Dixith Rao" })];
    const out = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);
    const s = out.suggestions[0];
    expect(s.candidate.outcome).toBe("candidate");
    expect(s.candidate.orgId).toBe("C-2018");
    // The title says CG Roofing. It is never asked, so the two can never disagree in output.
    expect(s.titleCandidate).toBeNull();
    expect(titleConfirmArgFor(s)).toBeNull();
  });

  it("offers the title only where the humans could not answer, in its own field and count", () => {
    const rows = [emptyCellRow("page-2", "Rob, Will | CGRoofingGroup.com kickoff")];
    const out = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);
    const s = out.suggestions[0];
    expect(s.candidate.outcome).toBe("no-counterparty");
    expect(s.candidate.orgId).toBeUndefined();
    expect(s.titleCandidate?.outcome).toBe("title-candidate");
    expect(s.titleCandidate?.orgId).toBe("C-2017");
    // Two counts, never summed into one.
    expect(out.counts.candidate).toBe(0);
    expect(out.counts["title-candidate"]).toBe(1);
  });

  it("keeps the two confirm args on separate functions — the strong one stays null", () => {
    const rows = [emptyCellRow("page-3", "Rob, Will | CGRoofingGroup.com kickoff")];
    const s = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE).suggestions[0];
    expect(confirmArgFor(s)).toBeNull();
    expect(titleConfirmArgFor(s)).toBe(`--confirm ${s.pageId}=C-2017`);
  });

  it("ranks an attendee answer above a title answer above no answer", () => {
    const rows = [
      emptyCellRow("pg-none", "Speaker 1 / Speaker 3"),
      emptyCellRow("pg-title", "Rob | CGRoofingGroup.com"),
      emptyCellRow("pg-att", "quarterly", { contactName: "Dixith Rao" }),
    ];
    const out = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);
    expect(out.suggestions.map((s) => s.pageTitle)).toEqual([
      "quarterly",
      "Rob | CGRoofingGroup.com",
      "Speaker 1 / Speaker 3",
    ]);
  });

  it("an ambiguous title is offered to nobody", () => {
    const rows = [emptyCellRow("page-4", "Rob | CGRoofingGroup.com + Martin Fierro")];
    const s = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE).suggestions[0];
    expect(s.titleCandidate?.outcome).toBe("ambiguous-title");
    expect(titleConfirmArgFor(s)).toBeNull();
    expect(confirmArgFor(s)).toBeNull();
  });
});
