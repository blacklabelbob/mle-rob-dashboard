import { describe, it, expect } from "vitest";
import {
  BACKUP_TABLES,
  BACKUP_ORDER_KEY,
  backupFailDetail,
  backupObjectName,
  buildSnapshot,
  verifySnapshot,
} from "../backup";

const takenAt = "2026-07-23T04:00:00.000Z";

function fullTables(rowsPerTable = 2): Record<string, unknown[]> {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = Array.from({ length: rowsPerTable }, (_, i) => ({ id: `${t}-${i}` }));
  }
  return tables;
}

function countsOf(tables: Record<string, unknown[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) counts[t] = (tables[t] ?? []).length;
  return counts;
}

describe("buildSnapshot", () => {
  it("carries takenAt and per-table counts for every backup table", () => {
    const tables = fullTables(3);
    const snap = buildSnapshot(tables, takenAt);
    expect(snap.takenAt).toBe(takenAt);
    for (const t of BACKUP_TABLES) expect(snap.counts[t]).toBe(3);
    expect(snap.tables).toBe(tables);
  });

  it("counts a missing table as 0 rather than omitting it", () => {
    const tables = fullTables(1);
    delete tables.dev_chat;
    const snap = buildSnapshot(tables, takenAt);
    expect(snap.counts.dev_chat).toBe(0);
  });
});

describe("BACKUP_ORDER_KEY", () => {
  it("covers every backup table, with dedup_review on its pair_key PK", () => {
    for (const t of BACKUP_TABLES) {
      expect(BACKUP_ORDER_KEY[t]).toBe(t === "dedup_review" ? "pair_key" : "id");
    }
  });
});

describe("backupObjectName", () => {
  it("is dated from the ISO timestamp", () => {
    expect(backupObjectName(takenAt)).toBe("crm-backup-2026-07-23.json");
  });
});

describe("verifySnapshot", () => {
  it("passes a faithful round-trip", () => {
    const tables = fullTables(2);
    const snap = buildSnapshot(tables, takenAt);
    const verdict = verifySnapshot(JSON.parse(JSON.stringify(snap)), countsOf(tables));
    expect(verdict).toEqual({ ok: true, problems: [] });
  });

  it("rejects non-object payloads (corrupt upload)", () => {
    for (const bad of [null, "nope", 7, [1, 2]]) {
      const verdict = verifySnapshot(bad, countsOf(fullTables(1)));
      expect(verdict.ok).toBe(false);
      expect(verdict.problems).toEqual(["snapshot is not a JSON object"]);
    }
  });

  it("rejects a snapshot missing its tables map", () => {
    const verdict = verifySnapshot({ takenAt }, countsOf(fullTables(1)));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain("missing tables");
  });

  it("flags a missing takenAt", () => {
    const snap = buildSnapshot(fullTables(1), takenAt) as Record<string, unknown>;
    delete snap.takenAt;
    const verdict = verifySnapshot(snap, countsOf(fullTables(1)));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain("missing takenAt");
  });

  it("flags each table absent from the snapshot", () => {
    const tables = fullTables(1);
    delete tables.deals;
    const snap = buildSnapshot(tables, takenAt);
    delete (snap.tables as Record<string, unknown>).deals;
    const verdict = verifySnapshot(snap, countsOf(fullTables(1)));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain("table deals: missing from snapshot");
  });

  it("catches count drift vs the independent live head-counts (truncated fetch)", () => {
    const tables = fullTables(2);
    const snap = buildSnapshot(tables, takenAt);
    const live = countsOf(tables);
    live.activities = 5; // live says 5, snapshot holds 2 → truncation
    const verdict = verifySnapshot(snap, live);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain(
      "table activities: snapshot has 2 rows, live has 5"
    );
  });

  it("reports a table with no live count to verify against", () => {
    const tables = fullTables(1);
    const snap = buildSnapshot(tables, takenAt);
    const live = countsOf(tables);
    delete live.verticals;
    const verdict = verifySnapshot(snap, live);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain("table verticals: no live count to verify against");
  });

  it("refuses to certify an empty people table even when counts agree", () => {
    const tables = fullTables(1);
    tables.people = [];
    const snap = buildSnapshot(tables, takenAt);
    const verdict = verifySnapshot(snap, countsOf(tables));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain(
      "people table is empty — refusing to certify an empty backup"
    );
  });
});

describe("backupFailDetail", () => {
  it("joins problems and names the restore-point rule", () => {
    const detail = backupFailDetail(["a", "b"], takenAt);
    expect(detail).toContain(takenAt);
    expect(detail).toContain("a; b");
    expect(detail).toContain("restore point");
  });
});
