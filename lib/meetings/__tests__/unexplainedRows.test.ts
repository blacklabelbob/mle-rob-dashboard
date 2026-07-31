import { describe, it, expect } from "vitest";
import {
  classifyUnexplainedRows,
  isPlaceholderTitle,
  type ArchiveRowDetail,
} from "../unexplainedRows";

const row = (over: Partial<ArchiveRowDetail> & { id: string }): ArchiveRowDetail => ({
  title: "",
  day: "",
  ...over,
});

/** A row a recorder saw and a human finished — the shape the pass must ignore entirely. */
const recorded = (over: Partial<ArchiveRowDetail> & { id: string }): ArchiveRowDetail =>
  row({ recording: "https://app.fireflies.ai/view/ABC", summary: "s", company: "c", ...over });

describe("isPlaceholderTitle", () => {
  it("rejects the titles that name no meeting", () => {
    expect(isPlaceholderTitle("")).toBe(true);
    expect(isPlaceholderTitle("  ")).toBe(true);
    expect(isPlaceholderTitle("Meeting")).toBe(true);
    expect(isPlaceholderTitle("bsn-kwzp-wch")).toBe(true);
    expect(isPlaceholderTitle("Jul 28, 2:00 PM")).toBe(true);
  });

  it("treats a DERIVED title as a placeholder, so it can never prove two rows are one meeting", () => {
    // The sync writes these when a recording says nothing about itself. Honest, but not a
    // human naming the meeting — two unnamed calls on one day derive nearly the same string.
    expect(isPlaceholderTitle("Untitled recording (12 min) — 2026-06-18")).toBe(true);
  });

  it("accepts a real human title", () => {
    expect(isPlaceholderTitle("Omega principals — in person")).toBe(false);
  });
});

describe("classifyUnexplainedRows", () => {
  it("ignores rows a recorder saw — the sync owns those, not this pass", () => {
    const report = classifyUnexplainedRows([recorded({ id: "r1", title: "Dix call", day: "2026-07-29" })]);
    expect(report.counts.recorded).toBe(1);
    expect(report.counts.unexplained).toBe(0);
    expect(report.open).toHaveLength(0);
  });

  it("counts a finished unrecorded row as complete and owes nothing for it", () => {
    const report = classifyUnexplainedRows([
      row({ id: "u1", title: "Omega principals", day: "2026-07-28", summary: "what was said", company: "Omega" }),
    ]);
    expect(report.counts.complete).toBe(1);
    expect(report.open).toHaveLength(0);
  });

  it("asks a human who was there when the row is named and dated but has no account of it", () => {
    const report = classifyUnexplainedRows([
      row({ id: "u1", title: "Omega principals — in person", day: "2026-07-28", company: "Omega" }),
    ]);
    expect(report.open[0].disposition).toBe("needs-human-account");
    expect(report.open[0].gaps).toEqual(["no summary"]);
  });

  it("asks for a NAME, not a memory, when the title is a placeholder", () => {
    const report = classifyUnexplainedRows([row({ id: "u1", title: "Meeting", day: "2026-07-20" })]);
    expect(report.open[0].disposition).toBe("needs-identification");
    expect(report.open[0].nextStep).toMatch(/Meeting Title/);
  });

  it("asks for a DATE first when there is none — an undated row can never be matched to anything", () => {
    const report = classifyUnexplainedRows([row({ id: "u1", title: "Gulf Coast RE kickoff" })]);
    expect(report.open[0].disposition).toBe("needs-identification");
    expect(report.open[0].nextStep).toMatch(/Call Date/);
  });

  it("flags a stray copy of a recorded call as a duplicate instead of sending it to Rob to remember", () => {
    const report = classifyUnexplainedRows([
      recorded({ id: "r1", title: "MLE Sales Network Intro", day: "2026-07-10" }),
      row({ id: "u1", title: "MLE Sales Network Intro", day: "2026-07-10" }),
    ]);
    expect(report.open[0].disposition).toBe("possible-duplicate");
    expect(report.open[0].twin?.id).toBe("r1");
  });

  it("does NOT call it a duplicate when the recorded twin is on another day", () => {
    const report = classifyUnexplainedRows([
      recorded({ id: "r1", title: "MLE Sales Network Intro", day: "2026-07-09" }),
      row({ id: "u1", title: "MLE Sales Network Intro", day: "2026-07-10" }),
    ]);
    expect(report.open[0].disposition).toBe("needs-human-account");
  });

  it("does NOT call it a duplicate when the recorded twin's title is derived", () => {
    // Two unnamed calls on one day derive near-identical strings; merging on that would
    // destroy a meeting record, and leaving two rows costs one click.
    const report = classifyUnexplainedRows([
      recorded({ id: "r1", title: "Untitled recording (9 min) — 2026-06-18", day: "2026-06-18" }),
      row({ id: "u1", title: "Untitled recording (9 min) — 2026-06-18", day: "2026-06-18" }),
    ]);
    // The unrecorded one has a derived title too, so it cannot even be identified yet.
    expect(report.open[0].disposition).toBe("needs-identification");
  });

  it("orders the work-list cheapest-to-close first, then newest", () => {
    const report = classifyUnexplainedRows([
      recorded({ id: "r1", title: "Title Base phase 1", day: "2026-07-23" }),
      row({ id: "human-old", title: "Omega principals", day: "2026-07-01", company: "Omega" }),
      row({ id: "human-new", title: "Joseph partnership", day: "2026-07-26", company: "Joseph" }),
      row({ id: "ident", title: "Meeting", day: "2026-07-15" }),
      row({ id: "dup", title: "Title Base phase 1", day: "2026-07-23" }),
    ]);
    expect(report.open.map((r) => r.row.id)).toEqual(["dup", "ident", "human-new", "human-old"]);
    expect(report.counts).toMatchObject({
      archiveRows: 5,
      recorded: 1,
      unexplained: 4,
      complete: 0,
      possibleDuplicate: 1,
      needsIdentification: 1,
      needsHumanAccount: 2,
    });
  });
});
