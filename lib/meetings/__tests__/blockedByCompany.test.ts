import { describe, expect, it } from "vitest";
import {
  KEY_BLOCKED_BY_COMPANY,
  buildBlockedByCompanyFinding,
  groupBlockedByCompany,
} from "../blockedByCompany";
import type { ActivityPlanRow, NearMiss } from "../activityPlan";

/**
 * Fixtures are the LIVE 2026-08-07 prod rows, copied out of `npm run check:archive -- --json`,
 * not invented shapes. The whole finding is about three CG Roofing rows collapsing into one
 * decision, and a fixture that made up its own near-miss geometry would be green about a
 * grouping prod never produces.
 */
function planRow(
  disposition: ActivityPlanRow["disposition"],
  opts: { recorded: boolean; id: string; title?: string; day?: string; nearMiss?: NearMiss },
): ActivityPlanRow {
  return {
    row: {
      id: opts.id,
      url: `https://app.notion.com/p/${opts.id}`,
      title: opts.title || "Rob & Someone | A Call",
      day: opts.day ?? "2026-06-16",
      recording: opts.recorded ? "https://app.fireflies.ai/view/abc" : "",
    },
    disposition,
    nearMiss: opts.nearMiss,
    nextStep: "n/a",
  } as ActivityPlanRow;
}

const CG: NearMiss = {
  kind: "title-host",
  hits: [
    {
      host: "cgroofinggroup.com",
      orgs: [{ id: "C-2017", name: "CG Roofing Group", domain: "cgroofinggroup.com" }],
    },
  ],
};

const GULF: NearMiss = {
  kind: "title-name",
  hits: [
    {
      candidate: "gulf coast re",
      orgs: [{ id: "C-2018", name: "Gulf Coast RE Group", domain: "gulfcoastregroup.com" }],
    },
  ],
};

const MARTIN: NearMiss = {
  kind: "title-name",
  hits: [
    {
      candidate: "martin fierro",
      orgs: [{ id: "C-2005", name: "Martin Fierro Restaurant", domain: "martinfierronaples.com" }],
    },
  ],
};

const DIX: NearMiss = {
  kind: "person-not-company",
  people: [{ id: "P-1010", name: "Dixith Magadiev", orgId: "C-2006" }],
};

/** The six near-missing rows exactly as prod holds them on 2026-08-07, plus the nine blind ones. */
function livePlan(): ActivityPlanRow[] {
  return [
    planRow("unknown-company", {
      recorded: true,
      id: "cg-1",
      title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery",
      nearMiss: CG,
    }),
    planRow("unknown-company", {
      recorded: true,
      id: "cg-2",
      title: "Caleb, Rob, Will | CGRoofingGroup.com + AI Platform Discovery - Jun 16, 2026 (Fireflies)",
      nearMiss: CG,
    }),
    planRow("unknown-company", {
      recorded: true,
      id: "cg-3",
      title: "Rob Will Caleb | CGRoofinggroup.com - Next Steps",
      day: "2026-06-18",
      nearMiss: CG,
    }),
    planRow("unknown-company", {
      recorded: true,
      id: "gulf-1",
      title: "Rob, Alex, Will, Chris | Gulf Coast RE + AI Platform - Jun 17, 2026 (Fireflies)",
      day: "2026-06-17",
      nearMiss: GULF,
    }),
    planRow("unknown-company", {
      recorded: true,
      id: "martin-1",
      title: "Rob & Austin | MArtin Fierro",
      day: "2026-08-03",
      nearMiss: MARTIN,
    }),
    planRow("unknown-company", {
      recorded: true,
      id: "dix-1",
      title: "Rob & Dix | MLE & Skin Cancer Detection AI Model",
      day: "2026-07-29",
      nearMiss: DIX,
    }),
    ...Array.from({ length: 9 }, (_, i) =>
      planRow("no-company", { recorded: true, id: `blind-${i}` }),
    ),
  ];
}

describe("groupBlockedByCompany", () => {
  it("collapses the three CG Roofing rows into ONE decision and ranks it first", () => {
    const g = groupBlockedByCompany(livePlan());
    expect(g.blocked).toBe(15);
    expect(g.companies[0]).toMatchObject({
      orgId: "C-2017",
      orgName: "CG Roofing Group",
      evidence: ["title-host"],
    });
    expect(g.companies[0].meetings).toHaveLength(3);
    // Three rows, one company: that ratio IS the finding. If this ever reads 3 groups, the
    // worklist has gone back to being one line per meeting.
    expect(g.companies).toHaveLength(3);
    expect(g.named).toBe(5);
  });

  it("keeps the person case out of the company list and never prints their employer as the answer", () => {
    const g = groupBlockedByCompany(livePlan());
    expect(g.companies.map((c) => c.orgId)).not.toContain("C-2006");
    expect(g.people).toHaveLength(1);
    expect(g.people[0]).toMatchObject({ personId: "P-1010", employerOrgId: "C-2006" });
    expect(g.personOnly).toBe(1);
  });

  it("counts the rows nothing can name rather than dropping them", () => {
    const g = groupBlockedByCompany(livePlan());
    expect(g.unnameable).toBe(9);
    expect(g.named + g.personOnly + g.unnameable).toBe(g.blocked);
  });

  it("excludes rows no recorder saw — Q85's scope line, not a second reading of it", () => {
    const g = groupBlockedByCompany([
      planRow("unknown-company", { recorded: false, id: "cg-off", nearMiss: CG }),
      planRow("unknown-company", { recorded: true, id: "cg-on", nearMiss: CG }),
    ]);
    expect(g.blocked).toBe(1);
    expect(g.companies[0].meetings).toHaveLength(1);
  });

  it("never counts an attachable row — it is not blocked and belongs on no worklist", () => {
    const g = groupBlockedByCompany([
      planRow("attachable", { recorded: true, id: "ok", nearMiss: CG }),
    ]);
    expect(g.blocked).toBe(0);
    expect(g.companies).toHaveLength(0);
  });

  it("refuses to pick a company when a near miss names two — the row falls to unnameable", () => {
    const twoOrgs: NearMiss = {
      kind: "title-name",
      hits: [
        {
          candidate: "omega title",
          orgs: [
            { id: "C-2019", name: "Omega Title (FL)" },
            { id: "C-2024", name: "Omega Title" },
          ],
        },
      ],
    };
    const g = groupBlockedByCompany([
      planRow("unknown-company", { recorded: true, id: "amb", nearMiss: twoOrgs }),
    ]);
    expect(g.companies).toHaveLength(0);
    expect(g.unnameable).toBe(1);
  });
});

describe("buildBlockedByCompanyFinding", () => {
  it("carries its own key, and medium severity so #214 stays the only high row", () => {
    const finding = buildBlockedByCompanyFinding(livePlan())!;
    expect(finding.dedupeKey).toBe(KEY_BLOCKED_BY_COMPANY);
    expect(finding.severity).toBe("medium");
  });

  it("names the dominant company in the title, so the row is actionable unopened", () => {
    const finding = buildBlockedByCompanyFinding(livePlan())!;
    expect(finding.title).toContain("CG Roofing Group");
    expect(finding.title).toContain("3 of them");
  });

  it("gives every meeting a Notion URL — a worklist you cannot open is a complaint", () => {
    const finding = buildBlockedByCompanyFinding(livePlan())!;
    for (const id of ["cg-1", "cg-2", "cg-3", "gulf-1", "martin-1", "dix-1"]) {
      expect(finding.detail).toContain(`https://app.notion.com/p/${id}`);
    }
  });

  it("prints the page id, never the word null, when the archive row carries no link", () => {
    // The row type promises `null` means "no link, here is the page id". Until this was pinned
    // the detail rendered the literal string `null` on the one line a human is meant to click —
    // a broken-looking row where the honest answer is an absent one. tsc found the type half;
    // only a test can hold the sentence the type cannot say.
    const noLink = {
      ...planRow("unknown-company", { recorded: true, id: "cg-nolink", nearMiss: CG }),
    } as ActivityPlanRow;
    (noLink.row as { url?: string }).url = undefined;
    const finding = buildBlockedByCompanyFinding([noLink])!;
    expect(finding.detail).not.toContain("\n      null");
    expect(finding.detail).toContain("(no link on the row — Notion page id cg-nolink)");
  });

  it("states the nine it cannot name, in the same row, rather than implying it is complete", () => {
    const finding = buildBlockedByCompanyFinding(livePlan())!;
    expect(finding.detail).toContain("9 blocked meeting(s) are NOT on this list");
    expect(finding.detail).toContain("Only someone who was in the room");
  });

  it("says candidate, never decision — the whole row is a question with records attached", () => {
    const finding = buildBlockedByCompanyFinding(livePlan())!;
    expect(finding.detail).toContain("CANDIDATE");
    expect(finding.detail).toContain("Nothing has been written, created or attached");
  });

  it("files nothing when no blocked row names anything — silence beats an empty worklist", () => {
    const blindOnly = Array.from({ length: 9 }, (_, i) =>
      planRow("no-company", { recorded: true, id: `blind-${i}` }),
    );
    expect(buildBlockedByCompanyFinding(blindOnly)).toBeNull();
  });
});
