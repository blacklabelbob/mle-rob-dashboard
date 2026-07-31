import { describe, it, expect } from "vitest";
import { buildArchiveFinding, KEY_NEEDS_HUMAN_ACCOUNT, type UnexplainedCounts } from "../archiveFinding";
import { classifyUnexplainedRows, type ArchiveRowDetail, type UnexplainedReport } from "../unexplainedRows";

const counts = (over: Partial<UnexplainedCounts> = {}): UnexplainedCounts => ({
  archiveRows: 40,
  recorded: 13,
  unexplained: 27,
  complete: 0,
  possibleDuplicate: 0,
  needsIdentification: 4,
  needsHumanAccount: 23,
  ...over,
});

/**
 * The counts and the rows are separable in the type but never in a real run, so the helper
 * lets a test state a count block without hand-building 23 rows. The list-shaped tests below
 * go the other way and drive the REAL classifier, so nothing here can claim a list the
 * classifier would not produce.
 */
const report = (over: Partial<UnexplainedCounts> = {}, open: UnexplainedReport["open"] = []): UnexplainedReport => ({
  rows: open,
  open,
  counts: counts(over),
});

const row = (over: Partial<ArchiveRowDetail> = {}): ArchiveRowDetail => ({
  id: over.id ?? `id-${over.day ?? "x"}-${over.title ?? ""}`,
  title: "Gulf Coast RE KICKOFF",
  day: "2026-07-22",
  ...over,
});

describe("buildArchiveFinding", () => {
  it("carries the CURRENT count in the title", () => {
    expect(buildArchiveFinding(report())!.title).toBe(
      "23 archived meetings can only be closed by someone who was in the room",
    );
  });

  it("keeps the SAME key as the count changes — that is the whole point", () => {
    // #132 said 26 and #134 said 25 for this one finding because each run inserted a new
    // row. A stable key is what makes the next run correct the row instead of stacking.
    const a = buildArchiveFinding(report({ needsHumanAccount: 23 }))!;
    const b = buildArchiveFinding(report({ needsHumanAccount: 19 }))!;
    expect(a.dedupeKey).toBe(KEY_NEEDS_HUMAN_ACCOUNT);
    expect(b.dedupeKey).toBe(a.dedupeKey);
    expect(b.title).not.toBe(a.title);
  });

  it("matches the key already on prod flag #134, so it corrects that row rather than opening a fourth", () => {
    expect(KEY_NEEDS_HUMAN_ACCOUNT).toBe("meeting-archive/needs-human-account");
  });

  it("returns null when the bucket is empty — an empty to-do is not a finding", () => {
    expect(buildArchiveFinding(report({ needsHumanAccount: 0 }))).toBeNull();
  });

  it("reports every bucket from the SAME run, so the detail cannot contradict the title", () => {
    const f = buildArchiveFinding(report({ needsIdentification: 4, possibleDuplicate: 1 }))!;
    expect(f.detail).toContain("40 rows");
    expect(f.detail).toContain("13 carry a recording");
    expect(f.detail).toContain("27 have no recording");
    expect(f.detail).toContain("4 of those are missing a date");
    expect(f.detail).toContain("1 look like a");
  });

  it("stays on the entity name the existing row uses", () => {
    expect(buildArchiveFinding(report())!.entityName).toBe("Meeting archive");
    expect(buildArchiveFinding(report())!.severity).toBe("medium");
  });

  // ── inc.13: the ledger row carries the meetings, not a terminal command ──────────────

  it("no longer sends Rob to a terminal for the list", () => {
    const r = classifyUnexplainedRows([row()]);
    expect(buildArchiveFinding(r)!.detail).not.toContain("npm run check:archive");
  });

  it("lists one line per meeting Rob has to account for", () => {
    const r = classifyUnexplainedRows([
      row({ day: "2026-07-28", title: "Meeting 2026-07-28", company: "Omega Title" }),
      row({ day: "2026-07-22", title: "Gulf Coast RE KICKOFF" }),
    ]);
    const f = buildArchiveFinding(r)!;
    expect(f.title).toContain("2 archived meetings");
    expect(f.detail).toContain("• 2026-07-28 — with Omega Title · no title was ever typed");
    expect(f.detail).toContain("• 2026-07-22 — Gulf Coast RE KICKOFF");
  });

  it("does not print the day twice — the calendar sync's ISO stamp is not part of the name", () => {
    // 19 of the 23 real rows carry one of these tails, and the line already opens with the
    // day. Left in, the words Rob reads get pushed off the end by a restatement of the date.
    const r = classifyUnexplainedRows([
      row({ day: "2026-07-17", title: "📊 Weekly Review - Pipeline / Deals 2026-07-17T16:00:00.000-04:00" }),
    ]);
    const line = buildArchiveFinding(r)!.detail.split("\n").find((l) => l.startsWith("• "))!;
    expect(line).toBe("• 2026-07-17 — 📊 Weekly Review - Pipeline / Deals");
  });

  it("keeps a date that is genuinely part of the name — the tail must be a full stamp", () => {
    const r = classifyUnexplainedRows([row({ day: "2026-01-28", title: "The Roof Co | Q1 2026 Presentation" })]);
    const line = buildArchiveFinding(r)!.detail.split("\n").find((l) => l.startsWith("• "))!;
    expect(line).toBe("• 2026-01-28 — The Roof Co | Q1 2026 Presentation");
  });

  it("drops a bare date tail ONLY when it is the row's own day — a different date might mean something", () => {
    const same = classifyUnexplainedRows([row({ day: "2026-07-22", title: "Gulf Coast RE KICKOFF 2026-07-22" })]);
    const other = classifyUnexplainedRows([row({ day: "2026-01-28", title: "The Roof Co | Q1 close 2026-03-31" })]);
    const lineOf = (r: UnexplainedReport) =>
      buildArchiveFinding(r)!.detail.split("\n").find((l) => l.startsWith("• "))!;
    expect(lineOf(same)).toBe("• 2026-07-22 — Gulf Coast RE KICKOFF");
    expect(lineOf(other)).toBe("• 2026-01-28 — The Roof Co | Q1 close 2026-03-31");
  });

  it("puts the number of lines EXACTLY where the title's number is — the count is the list", () => {
    // The title and the list are both derived from the same pass, so a reader counting the
    // bullets must arrive at the headline number. This is the check that a filter drifting
    // away from the disposition the title names would fail.
    const rows = ["2026-07-28", "2026-07-22", "2026-06-16", "2026-04-30"].map((day, i) =>
      row({ day, title: `Real meeting ${i}` }),
    );
    const f = buildArchiveFinding(classifyUnexplainedRows(rows))!;
    const bullets = f.detail.split("\n").filter((l) => l.startsWith("• "));
    expect(bullets).toHaveLength(4);
    expect(f.title).toContain("4 archived meetings");
  });

  it("lists newest first — the meeting only Rob can account for is the one he just had", () => {
    const rows = ["2025-12-15", "2026-07-28", "2026-06-16"].map((day, i) => row({ day, title: `Real meeting ${i}` }));
    const bullets = buildArchiveFinding(classifyUnexplainedRows(rows))!
      .detail.split("\n")
      .filter((l) => l.startsWith("• "));
    expect(bullets[0]).toContain("2026-07-28");
    expect(bullets[2]).toContain("2025-12-15");
  });

  it("lists ONLY the bucket the title names — a row anyone with a calendar can close is not Rob's to remember", () => {
    const r = classifyUnexplainedRows([
      row({ day: "2026-07-28", title: "Real meeting", company: "Omega Title" }),
      row({ day: "", title: "Meeting 2026-07-30" }), // needs-identification: no date
      row({ day: "2026-06-16", title: "Meeting 2026-06-16T11:05:00.000-04:00" }), // placeholder, no company
    ]);
    expect(r.counts.needsIdentification).toBe(2);
    const f = buildArchiveFinding(r)!;
    expect(f.detail).toContain("• 2026-07-28 — Real meeting · with Omega Title");
    expect(f.detail).not.toContain("Meeting 2026-07-30");
    expect(f.detail).not.toContain("11:05");
  });

  it("says nothing about a meeting beyond its day, its name and who it was with", () => {
    // The row is a memory prompt, and a prompt that guesses makes Rob correct the machine
    // instead of recalling the call. A summary present on the row is still not repeated.
    const r = classifyUnexplainedRows([row({ day: "2026-07-22", title: "Gulf Coast RE KICKOFF", company: "Gulf Coast" })]);
    const line = buildArchiveFinding(r)!.detail.split("\n").find((l) => l.startsWith("• "))!;
    expect(line).toBe("• 2026-07-22 — Gulf Coast RE KICKOFF · with Gulf Coast");
  });

  it("changes when the LIST changes even though the count does not — the ledger row is the work-list", () => {
    // inc.12 declines to re-date the row when nothing is new. That is only correct if
    // "nothing is new" accounts for WHICH meetings are owed, not just how many.
    const a = buildArchiveFinding(classifyUnexplainedRows([row({ day: "2026-07-28", title: "Real one" })]))!;
    const b = buildArchiveFinding(classifyUnexplainedRows([row({ day: "2026-07-28", title: "Real two" })]))!;
    expect(a.title).toBe(b.title);
    expect(a.detail).not.toBe(b.detail);
  });
});
