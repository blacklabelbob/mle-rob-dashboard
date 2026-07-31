import { describe, expect, it } from "vitest";
import { buildCrmGapFinding, KEY_CRM_GAP } from "../crmGapFinding";
import type { ArchiveCheck, ArchiveRow } from "../archiveCheck";

function row(id: string, day: string, title: string): ArchiveRow {
  return { id, day, title };
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

  it("does NOT list the meetings when one pipeline closes every one of them", () => {
    const rows = [row("a", "2026-07-28", "Omega"), row("b", "2026-07-22", "Gulf Coast")];
    const f = buildCrmGapFinding(check({ archiveRows: 40, crmMeetings: 0 }, rows))!;
    expect(f.detail).not.toContain("• 2026-07-28");
    expect(f.detail).toContain("not listed as 2 separate to-dos");
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
