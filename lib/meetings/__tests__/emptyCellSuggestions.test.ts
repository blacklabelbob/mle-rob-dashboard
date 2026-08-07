/**
 * Q85 inc.16 — the join between inc.15's candidates and inc.14's caller.
 *
 * Fixtures are the same real records inc.15's suite uses, copied out of `data/network.local.json`:
 * P-1009 Michael Jaenvega → C-2005 Martin Fierro Restaurant, P-1013 Joe Fleming → C-2013 Vive
 * Health, P-1012 Giovanni Spazioso → C-2014 De Cecco USA.
 *
 * The two tests that matter most here are the SCOPE ones — a suggestion offered for a row the
 * confirm path would refuse spends a human's decision and hands back `out-of-scope` afterwards.
 */

import { describe, expect, it } from "vitest";
import type { ActivityPlanRow, CrmOrg, CrmPerson } from "../activityPlan";
import { blockerFor } from "../writeBlockerFinding";
import { planCompanyConfirmations } from "../companyConfirmation";
import { confirmArgFor, personAskLines, suggestCompaniesForEmptyCells } from "../emptyCellSuggestions";

const ORGS: CrmOrg[] = [
  { id: "C-2005", name: "Martin Fierro Restaurant" },
  { id: "C-2013", name: "Vive Health" },
  { id: "C-2014", name: "De Cecco USA" },
];

const PEOPLE: CrmPerson[] = [
  { id: "P-1009", name: "Michael Jaenvega", orgId: "C-2005" },
  { id: "P-1013", name: "Joe Fleming", orgId: "C-2013" },
  { id: "P-1012", name: "Giovanni Spazioso", orgId: "C-2014" },
];

/** A recorder-seen row with an empty `Company Meeting with` — the shape this pass exists for. */
function emptyCellRow(
  id: string,
  overrides: Partial<ActivityPlanRow["row"]> = {},
  disposition: ActivityPlanRow["disposition"] = "no-company",
): ActivityPlanRow {
  return {
    row: {
      id,
      title: `Meeting ${id}`,
      day: "2026-07-30",
      url: `https://notion.so/${id}`,
      recording: "https://fireflies.ai/view/abc",
      ...overrides,
    },
    disposition,
  } as ActivityPlanRow;
}

describe("suggestCompaniesForEmptyCells", () => {
  it("offers the company of the one person the archive named", () => {
    const rows = [emptyCellRow("page-1", { contactName: "Michael Jaenvega", mleAttendees: ["Rob"] })];

    const { suggestions, counts } = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);

    expect(counts.rows).toBe(1);
    expect(counts.candidate).toBe(1);
    expect(suggestions[0].candidate.orgId).toBe("C-2005");
    expect(suggestions[0].candidate.orgName).toBe("Martin Fierro Restaurant");
    expect(suggestions[0].pageUrl).toBe("https://notion.so/page-1");
    expect(suggestions[0].day).toBe("2026-07-30");
  });

  it("never offers a row no recorder saw — that is Q84's pass, and the confirm path refuses it", () => {
    const unrecorded = emptyCellRow("page-2", { recording: "", contactName: "Michael Jaenvega" });

    expect(suggestCompaniesForEmptyCells([unrecorded], ORGS, PEOPLE).suggestions).toEqual([]);

    // The same row, confirmed anyway, is exactly the refusal this scope gate avoids spending a
    // human's decision on.
    const plan = planCompanyConfirmations([unrecorded], ORGS, PEOPLE, [
      { pageId: "page-2", orgId: "C-2005", confirmedBy: "Rob Acheson" },
    ]);
    expect(plan.writes).toEqual([]);
    expect(plan.refusals[0].reason).toBe("out-of-scope");
  });

  it("never offers a row whose cell already holds text a human typed", () => {
    const full = emptyCellRow(
      "page-3",
      { company: "CG Roofing Group", contactName: "Michael Jaenvega" },
      "unknown-company",
    );
    expect(blockerFor(full)).toBe("unknown-company");

    expect(suggestCompaniesForEmptyCells([full], ORGS, PEOPLE).suggestions).toEqual([]);

    const plan = planCompanyConfirmations([full], ORGS, PEOPLE, [
      { pageId: "page-3", orgId: "C-2005", confirmedBy: "Rob Acheson" },
    ]);
    expect(plan.refusals[0].reason).toBe("cell-not-empty");
  });

  it("reports the rows it cannot offer instead of dropping them", () => {
    const rows = [
      emptyCellRow("page-4", { contactName: "Michael Jaenvega" }),
      emptyCellRow("page-5", {}),
      emptyCellRow("page-6", { nonMleAttendees: "Somebody Nobody Knows" }),
      emptyCellRow("page-7", { nonMleAttendees: "Michael Jaenvega, Joe Fleming" }),
    ];

    const { suggestions, counts } = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);

    expect(counts).toMatchObject({
      rows: 4,
      candidate: 1,
      "no-counterparty": 1,
      "no-matched-person": 1,
      "ambiguous-orgs": 1,
    });
    // Offerable first; the rest keep the plan's own order rather than being re-ranked.
    expect(suggestions.map((s) => s.pageId)).toEqual(["page-4", "page-5", "page-6", "page-7"]);
  });

  it("does NOT let an already-resolved org narrow the answer — the offer would assume the question", () => {
    // Two Joe Flemings; the row carries an org the planner attached for another reason. If this
    // module passed `planRow.org` into the resolver, the ambiguity would silently resolve to it.
    const people = [...PEOPLE, { id: "P-9002", name: "Joe Fleming", orgId: "C-2014" }];
    const row = emptyCellRow("page-8", { nonMleAttendees: "Joe Fleming" });
    (row as ActivityPlanRow).org = { id: "C-2013", name: "Vive Health" };

    const { suggestions } = suggestCompaniesForEmptyCells([row], ORGS, people);

    expect(suggestions[0].candidate.outcome).toBe("no-matched-person");
    expect(suggestions[0].candidate.orgId).toBeUndefined();
  });

  it("produces a confirm argument only for an offer, and the confirm path accepts it", () => {
    const rows = [
      emptyCellRow("page-9", { contactName: "Michael Jaenvega" }),
      emptyCellRow("page-10", {}),
    ];
    const { suggestions } = suggestCompaniesForEmptyCells(rows, ORGS, PEOPLE);

    expect(confirmArgFor(suggestions[0])).toBe("--confirm page-9=C-2005");
    expect(confirmArgFor(suggestions[1])).toBeNull();

    // End to end: the offer, confirmed by a human, is a write the confirm path plans.
    const plan = planCompanyConfirmations(rows, ORGS, PEOPLE, [
      { pageId: "page-9", orgId: "C-2005", confirmedBy: "Rob Acheson" },
    ]);
    expect(plan.refusals).toEqual([]);
    expect(plan.writes[0]).toMatchObject({
      pageId: "page-9",
      orgId: "C-2005",
      companyText: "Martin Fierro Restaurant",
      confirmedBy: "Rob Acheson",
    });
  });
});

/**
 * Q85 inc.18 — the two `no-matched-person` rows on prod, and why one of them must NOT be acted on.
 *
 * Fixtures are the exact live values read off prod this increment: `Contact Name = "Joseph Green"`
 * on the Fireflies "Next Steps" row, and `Contact Name = "Dix thedev08"` on the Dixith intro call.
 * P-1010 Dixith Magadiev and P-1018 Caleb Green are real CRM records; both are in the fixture
 * because both are the reason an answer here is not the obvious one.
 */
describe("no-matched-person rows carry WHICH human, and whether to create them", () => {
  const CAST: CrmPerson[] = [
    ...PEOPLE,
    { id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" },
    { id: "P-1018", name: "Caleb Green", orgId: "C-2005" },
  ];

  it("proposes a genuinely missing human, and carries the shared surname as context not a match", () => {
    const rows = [emptyCellRow("page-j", { contactName: "Joseph Green" })];
    const { suggestions, counts } = suggestCompaniesForEmptyCells(rows, ORGS, CAST);

    expect(suggestions[0].candidate.outcome).toBe("no-matched-person");
    expect(suggestions[0].personAsk).toHaveLength(1);
    expect(suggestions[0].personAsk[0].kind).toBe("propose");
    expect(counts["person-to-propose"]).toBe(1);
    expect(counts["person-withheld"]).toBe(0);

    // Caleb Green [P-1018] is named as context. It must never be offered as the person.
    const line = personAskLines(suggestions[0])[0];
    expect(line).toContain("＋");
    expect(line).toContain("Caleb Green [P-1018]");
    expect(line).toContain("DIFFERENT person");
  });

  it("WITHHOLDS the display handle — following the generic next step would duplicate P-1010", () => {
    const rows = [emptyCellRow("page-d", { contactName: "Dix thedev08" })];
    const { suggestions, counts } = suggestCompaniesForEmptyCells(rows, ORGS, CAST);

    expect(suggestions[0].candidate.outcome).toBe("no-matched-person");
    expect(suggestions[0].personAsk[0].kind).toBe("withhold");
    expect(counts["person-withheld"]).toBe(1);
    expect(counts["person-to-propose"]).toBe(0);

    const line = personAskLines(suggestions[0])[0];
    expect(line).toContain("⛔");
    expect(line).toContain("Dixith Magadiev [P-1010]");
    expect(line).toContain("Do NOT create a person");
  });

  it("the generic sentence and the per-name answer are never both shown — the per-name one wins", () => {
    const rows = [emptyCellRow("page-d", { contactName: "Dix thedev08" })];
    const { suggestions } = suggestCompaniesForEmptyCells(rows, ORGS, CAST);

    // The generic string still exists on the candidate (its own module's tests pin it) and says
    // the opposite of the truth for this row. `personAskLines` is non-empty, which is the signal
    // the caller uses to print the specific answer INSTEAD.
    expect(suggestions[0].candidate.nextStep).toContain("Create the person first");
    expect(personAskLines(suggestions[0])).not.toHaveLength(0);
  });

  it("is populated ONLY for no-matched-person — not on every row", () => {
    const rows = [
      emptyCellRow("page-ok", { contactName: "Michael Jaenvega" }), // candidate
      emptyCellRow("page-none", {}), // no-counterparty
    ];
    const { suggestions } = suggestCompaniesForEmptyCells(rows, ORGS, CAST);

    for (const s of suggestions) {
      expect(s.candidate.outcome).not.toBe("no-matched-person");
      expect(s.personAsk).toEqual([]);
      expect(personAskLines(s)).toEqual([]);
    }
  });

  it("a single-token counterparty identifies nobody, so it gets no proposal at all", () => {
    // "Alex" is below inc.5's two-token floor: `not-identifying`, never `unknown`. A proposal
    // built from it would create a record for a first name, which is how a second Alex is born.
    const rows = [emptyCellRow("page-a", { contactName: "Alex" })];
    const { suggestions } = suggestCompaniesForEmptyCells(rows, ORGS, CAST);

    expect(suggestions[0].personAsk).toEqual([]);
  });
});
