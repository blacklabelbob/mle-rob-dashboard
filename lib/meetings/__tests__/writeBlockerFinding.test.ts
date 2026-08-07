import { describe, expect, it } from "vitest";
import {
  KEY_WRITE_BLOCKERS,
  blockerFor,
  buildWriteBlockerFinding,
  censusWriteBlockers,
} from "../writeBlockerFinding";
import type { ActivityPlanRow } from "../activityPlan";

/**
 * A plan row shaped like the ones prod produces. `recording` is the ONLY thing that puts a row
 * in Q85's scope, so it is explicit on every fixture rather than defaulted.
 */
function planRow(
  disposition: ActivityPlanRow["disposition"],
  opts: { recorded: boolean; id?: string } = { recorded: true }
): ActivityPlanRow {
  return {
    row: {
      id: opts.id || `row-${disposition}`,
      title: "Rob & Austin | Something",
      day: "2026-07-30",
      recording: opts.recorded ? "https://fireflies.ai/view/abc" : "",
    },
    disposition,
    nextStep: "n/a",
  } as ActivityPlanRow;
}

describe("blockerFor", () => {
  it("maps every disposition, and attachable is the only one that blocks nothing", () => {
    expect(blockerFor(planRow("attachable"))).toBeNull();
    expect(blockerFor(planRow("no-company"))).toBe("empty-company");
    expect(blockerFor(planRow("unknown-company"))).toBe("unknown-company");
    expect(blockerFor(planRow("ambiguous-company"))).toBe("ambiguous-company");
    expect(blockerFor(planRow("no-date"))).toBe("no-date");
  });
});

describe("censusWriteBlockers", () => {
  it("counts only rows a recorder saw, and names the rest rather than dropping them", () => {
    const census = censusWriteBlockers([
      planRow("no-company", { recorded: true, id: "a" }),
      planRow("no-company", { recorded: false, id: "b" }),
      planRow("attachable", { recorded: false, id: "c" }),
    ]);
    expect(census.inScope).toBe(1);
    expect(census.outOfScope).toBe(2);
    // The unrecorded attachable row must NOT inflate `writable` — it is Q84's, not Q85's.
    expect(census.writable).toBe(0);
    expect(census.counts["empty-company"]).toBe(1);
  });

  it("reproduces the live prod shape — the empty Notion column dominates", () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => planRow("no-company", { recorded: true, id: `e${i}` })),
      ...Array.from({ length: 4 }, (_, i) => planRow("unknown-company", { recorded: true, id: `u${i}` })),
    ];
    const census = censusWriteBlockers(rows);
    expect(census.inScope).toBe(15);
    expect(census.writable).toBe(0);
    expect(census.dominant).toBe("empty-company");
    expect(census.counts["empty-company"]).toBe(11);
    expect(census.counts["unknown-company"]).toBe(4);
  });

  it("refuses to break a tie — two equally large fixes name no dominant one", () => {
    const census = censusWriteBlockers([
      planRow("no-company", { recorded: true, id: "a" }),
      planRow("unknown-company", { recorded: true, id: "b" }),
    ]);
    expect(census.dominant).toBeNull();
  });
});

describe("buildWriteBlockerFinding", () => {
  it("is null when nothing is blocked — it never asserts an all-clear", () => {
    expect(
      buildWriteBlockerFinding([planRow("attachable"), planRow("attachable", { recorded: false })])
    ).toBeNull();
  });

  it("carries its own key, high severity, and the fix-in system per blocker", () => {
    const finding = buildWriteBlockerFinding([
      planRow("no-company", { recorded: true, id: "a" }),
      planRow("no-company", { recorded: true, id: "b" }),
      planRow("unknown-company", { recorded: true, id: "c" }),
    ]);
    expect(finding).not.toBeNull();
    expect(finding!.dedupeKey).toBe(KEY_WRITE_BLOCKERS);
    expect(finding!.severity).toBe("high");
    expect(finding!.title).toContain("3 recorded meeting(s) blocked");
    expect(finding!.title).toContain("empty Notion `Company Meeting with`");
    // The two blockers live in different systems and the row must say which.
    expect(finding!.detail).toContain("FIX IN: Notion");
    expect(finding!.detail).toContain("FIX IN: the CRM");
  });

  it("states #211's claim — the block is on the company side, never the person side", () => {
    const finding = buildWriteBlockerFinding([planRow("no-company")]);
    expect(finding!.detail).toContain("THE BLOCK IS ON THE COMPANY SIDE, NOT THE PERSON SIDE");
    expect(finding!.detail).toContain("meeting-archive/person-proposals");
  });

  it("reports the out-of-scope rows on the row, so the total never quietly shrinks", () => {
    const finding = buildWriteBlockerFinding([
      planRow("no-company", { recorded: true, id: "a" }),
      ...Array.from({ length: 31 }, (_, i) => planRow("no-company", { recorded: false, id: `x${i}` })),
    ]);
    expect(finding!.detail).toContain("31 archive row(s) are out of Q85's scope");
  });

  it("never claims a write happened", () => {
    const finding = buildWriteBlockerFinding([planRow("no-date")]);
    expect(finding!.detail).toContain("Nothing has been written, created or attached");
  });
});
