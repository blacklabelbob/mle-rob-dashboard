import { describe, expect, it } from "vitest";
import { buildCrmGapFinding, KEY_CRM_GAP } from "../crmGapFinding";
import type { ArchiveCheck, ArchiveRow } from "../archiveCheck";
import { planMeetingActivities } from "../activityPlan";

function row(id: string, day: string, title: string, company?: string): ArchiveRow {
  return { id, day, title, ...(company ? { company } : {}) } as ArchiveRow;
}

function check(over: Partial<ArchiveCheck["counts"]>, archiveOnly: ArchiveRow[] = []): ArchiveCheck {
  return {
    matched: [],
    archiveOnly,
    crmOnly: [],
    ambiguous: [],
    counts: {
      archiveRows: 0,
      crmMeetings: 0,
      matched: 0,
      archiveOnly: archiveOnly.length,
      crmOnly: 0,
      ambiguous: 0,
      ...over,
    },
  };
}

describe("buildCrmGapFinding", () => {
  it("files nothing when every archived meeting has a CRM activity", () => {
    expect(buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 40, matched: 40 }))).toBeNull();
  });

  it("carries the stable key so it corrects its own row instead of stacking a new one", () => {
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]));
    expect(f?.dedupeKey).toBe(KEY_CRM_GAP);
    expect(f?.entityName).toBe("CRM meeting record");
  });

  it("counts the LIVE archive rather than a number a human typed once", () => {
    const grown = buildCrmGapFinding(check({ archiveRows: 47, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]));
    expect(grown?.title).toContain("47 recorded meetings");
    expect(grown?.title).not.toContain("40");
  });

  it("an empty CRM is HIGH and says the pipeline is absent, not that matching failed", () => {
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, [row("a", "2026-07-28", "Omega")]))!;
    expect(f.severity).toBe("high");
    expect(f.title).toContain("the CRM has NO meeting activities");
    expect(f.detail).toContain("no path writes");
    expect(f.detail).toContain("not because the reconciliation disagreed");
  });

  it("with no plan it states the gap and never claims one pipeline closes them", () => {
    const rows = [row("a", "2026-07-28", "Omega"), row("b", "2026-07-22", "Gulf Coast")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows))!;
    expect(f.detail).not.toContain("• 2026-07-28");
    expect(f.detail).not.toContain("closes all");
    expect(f.detail).not.toContain("could be filed unattended");
  });

  it("with a plan it says what the pipeline would NOT close, per bucket", () => {
    const rows = [
      row("a", "2026-07-28", "Omega sit-down", "Omega Title"),
      row("b", "2026-07-22", "Gulf Coast kickoff", "Gulf Coast RE"),
      row("c", "2026-07-20", "weekly"),
    ];
    const plan = planMeetingActivities(rows, [{ id: "C-1", name: "Gulf Coast RE" }]);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows), plan)!;
    expect(f.detail).toContain("necessary and NOT sufficient");
    expect(f.detail).toContain("1 could be filed unattended today");
    expect(f.detail).toContain("1 name a company the CRM does not have");
    expect(f.detail).toContain("1 never said who the meeting was with at all");
    // The one row a human has to move is named; the wall is counted, not printed.
    expect(f.detail).toContain("UNKNOWN-COMPANY");
    expect(f.detail).toContain("• 2026-07-28 — Omega sit-down");
    expect(f.detail).toContain("no CRM org is named “Omega Title”");
    expect(f.detail).not.toContain("• 2026-07-20 — weekly");
  });

  it("prints no dangling list when every orphan is in the no-company wall", () => {
    const rows = [row("a", "2026-07-28", "Omega"), row("b", "2026-07-22", "Gulf Coast")];
    const plan = planMeetingActivities(rows, [{ id: "C-1", name: "Gulf Coast RE" }]);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows), plan)!;
    expect(f.detail).toContain("2 never said who the meeting was with at all");
    expect(f.detail).not.toContain("•");
  });

  it("a partial gap keeps its own uncapped row list even when a plan is passed", () => {
    const rows = [row("b", "2026-07-22", "Gulf Coast kickoff"), row("a", "2026-07-28", "Omega sit-down")];
    const plan = planMeetingActivities(rows, []);
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38, matched: 38 }, rows), plan)!;
    const list = f.detail.slice(f.detail.indexOf("•"));
    expect(list).toBe("• 2026-07-28 — Omega sit-down\n• 2026-07-22 — Gulf Coast kickoff");
    expect(f.detail).toContain("necessary and NOT sufficient");
  });

  it("a partial gap is MEDIUM and the rows ARE the ask — listed, newest first", () => {
    const rows = [row("b", "2026-07-22", "Gulf Coast kickoff"), row("a", "2026-07-28", "Omega sit-down")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38, matched: 38 }, rows))!;
    expect(f.severity).toBe("medium");
    expect(f.title).toBe("2 archived meetings never reached the CRM");
    const list = f.detail.slice(f.detail.indexOf("•"));
    expect(list).toBe("• 2026-07-28 — Omega sit-down\n• 2026-07-22 — Gulf Coast kickoff");
  });

  it("strips the calendar sync's machine timestamp off a listed title", () => {
    const rows = [row("a", "2026-07-17", "📊 Weekly Review 2026-07-17T16:00:00.000-04:00")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 38 }, rows))!;
    expect(f.detail).toContain("• 2026-07-17 — 📊 Weekly Review");
    expect(f.detail).not.toContain("T16:00:00");
  });

  it("reports crmOnly and ambiguous when they exist, and stays silent when they do not", () => {
    const rows = [row("a", "2026-07-28", "Omega")];
    const both = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 5, crmOnly: 4, ambiguous: 2 }, rows))!;
    expect(both.detail).toContain("4 CRM meeting(s) have no archive row");
    expect(both.detail).toContain("2 row(s) could honestly be more than one");
    const neither = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 5 }, rows))!;
    expect(neither.detail).not.toContain("no archive row");
    expect(neither.detail).not.toContain("could honestly be");
  });

  it("never shares a key with the needs-human-account finding", async () => {
    const { KEY_NEEDS_HUMAN_ACCOUNT } = await import("../archiveFinding");
    expect(KEY_CRM_GAP).not.toBe(KEY_NEEDS_HUMAN_ACCOUNT);
  });
});
