import { describe, it, expect } from "vitest";
import { buildArchiveFinding, KEY_NEEDS_HUMAN_ACCOUNT, type UnexplainedCounts } from "../archiveFinding";

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

describe("buildArchiveFinding", () => {
  it("carries the CURRENT count in the title", () => {
    expect(buildArchiveFinding(counts())!.title).toBe(
      "23 archived meetings can only be closed by someone who was in the room",
    );
  });

  it("keeps the SAME key as the count changes — that is the whole point", () => {
    // #132 said 26 and #134 said 25 for this one finding because each run inserted a new
    // row. A stable key is what makes the next run correct the row instead of stacking.
    const a = buildArchiveFinding(counts({ needsHumanAccount: 23 }))!;
    const b = buildArchiveFinding(counts({ needsHumanAccount: 19 }))!;
    expect(a.dedupeKey).toBe(KEY_NEEDS_HUMAN_ACCOUNT);
    expect(b.dedupeKey).toBe(a.dedupeKey);
    expect(b.title).not.toBe(a.title);
  });

  it("matches the key already on prod flag #134, so it corrects that row rather than opening a fourth", () => {
    expect(KEY_NEEDS_HUMAN_ACCOUNT).toBe("meeting-archive/needs-human-account");
  });

  it("returns null when the bucket is empty — an empty to-do is not a finding", () => {
    expect(buildArchiveFinding(counts({ needsHumanAccount: 0 }))).toBeNull();
  });

  it("reports every bucket from the SAME run, so the detail cannot contradict the title", () => {
    const f = buildArchiveFinding(counts({ needsIdentification: 4, possibleDuplicate: 1 }))!;
    expect(f.detail).toContain("40 rows");
    expect(f.detail).toContain("13 carry a recording");
    expect(f.detail).toContain("27 have no recording");
    expect(f.detail).toContain("4 of those are missing a date");
    expect(f.detail).toContain("1 look like a");
  });

  it("stays on the entity name the existing row uses", () => {
    expect(buildArchiveFinding(counts())!.entityName).toBe("Meeting archive");
    expect(buildArchiveFinding(counts())!.severity).toBe("medium");
  });
});
