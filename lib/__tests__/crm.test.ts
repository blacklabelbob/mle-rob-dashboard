import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  DEAL_STAGES,
  ROUTING_LANES,
  TASK_STATUSES,
  fromActivity,
  fromDeal,
  fromTask,
  toActivity,
  toDeal,
  toTask,
} from "../crm";
import type { Activity, Deal, Task } from "@/lib/types";

// Gate suite (CR-3 / Q4 FIELD_MAP pattern): the mappers and enum arrays are
// pinned to the actual 0005 DDL parsed from disk — renaming/adding a column or
// widening a check constraint without moving lib/crm.ts fails here.

const ddl = readFileSync(
  join(__dirname, "../../supabase/migrations/0005_crm_core.sql"),
  "utf8"
);

// Every migration AFTER 0005, so a column added by a later `alter table` counts
// as part of the schema this gate compares against. Without this the gate reads
// 0005 as the whole truth and fails the moment a column arrives by ALTER — which
// would push the next author to weaken the gate rather than extend it. (Q41 inc.2
// added `deals.equity` in 0024; that is what surfaced this.)
const laterDdl = readdirSync(join(__dirname, "../../supabase/migrations"))
  .filter((f) => f.endsWith(".sql") && f > "0005")
  .map((f) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8"))
  .join("\n");

// Columns of one `create table` block: lines like `  name text not null,`,
// plus any `alter table <t> add column [if not exists] <c> <type>` since 0005.
function ddlColumns(table: string): Set<string> {
  const m = ddl.match(new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`table ${table} not found in 0005 DDL`);
  const cols = new Set<string>();
  for (const line of m[1].split("\n")) {
    const col = line.match(/^\s{2}([a-z_]+)\s+(?:text|numeric|boolean|jsonb|date|timestamptz)/);
    if (col) cols.add(col[1]);
  }
  for (const add of laterDdl.matchAll(
    new RegExp(`alter table (?:if exists )?${table}\\s+add column (?:if not exists )?([a-z_]+)`, "gi")
  )) {
    cols.add(add[1]);
  }
  return cols;
}

// Values of a `X in ('a','b',...)` check constraint.
function ddlEnum(column: string): string[] {
  const m = ddl.match(new RegExp(`${column} in\\s*\\(([^)]*)\\)`));
  if (!m) throw new Error(`check list for ${column} not found in 0005 DDL`);
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}

const sampleDeal: Deal = {
  id: "d-test",
  personId: "p1",
  verticalId: "v1",
  ownerId: "rob",
  name: "Test deal",
  stage: "quote_sent",
  value: 7000,
  routingLane: "rep",
  referralSourced: true,
  keyDates: { quoted: "2026-07-01" },
  // Q40 inc.10: the gate asks "can the mapper write every column the schema has?",
  // so the sample must carry every optional field — including a recorded phase.
  phase: 2,
  bookProtected: false,
  notes: "n",
  createdAt: "2026-07-22T00:00:00Z",
  updatedAt: "2026-07-22T00:00:00Z",
};

const sampleActivity: Activity = {
  id: "a-test",
  orgId: "o1",
  dealId: "d-test",
  createdBy: "max",
  type: "call",
  source: "dialer",
  sourceContext: { callSid: "CA123" },
  summary: "s",
  recordingUrl: "https://r",
  bookProtected: true,
  occurredAt: "2026-07-22T00:00:00Z",
  createdAt: "2026-07-22T00:00:00Z",
};

const sampleTask: Task = {
  id: "t-test",
  dealId: "d-test",
  assignedTo: "rob",
  title: "Follow up",
  status: "open",
  dueDate: "2026-07-30",
  bookProtected: false,
  createdAt: "2026-07-22T00:00:00Z",
  updatedAt: "2026-07-22T00:00:00Z",
};

describe("deals.phase is written only when it was stated (Q40 inc.10, 0026)", () => {
  it("omits the column entirely when no phase is recorded", () => {
    const row = fromDeal({ ...sampleDeal, phase: undefined });
    // Not `phase: null` — 0026 is committed-not-applied, and an unconditional key
    // would add an unknown column to every deal upsert on a database that has not
    // taken the migration, breaking saves that never mention a phase.
    expect("phase" in row).toBe(false);
  });

  it("writes the phase a human recorded, unchanged", () => {
    expect(fromDeal({ ...sampleDeal, phase: 3 })).toMatchObject({ phase: 3 });
  });

  it("reads an out-of-range or absent stored phase as not-stated, never as 1", () => {
    expect(toDeal({ ...fromDeal(sampleDeal), phase: 4 }).phase).toBeUndefined();
    expect(toDeal({ ...fromDeal(sampleDeal), phase: null }).phase).toBeUndefined();
    expect(toDeal({ ...fromDeal(sampleDeal), phase: 2 }).phase).toBe(2);
  });
});

describe("crm mappers ↔ 0005 DDL gate", () => {
  const cases = [
    ["deals", fromDeal(sampleDeal)],
    ["activities", fromActivity(sampleActivity)],
    ["tasks", fromTask(sampleTask)],
  ] as const;

  for (const [table, row] of cases) {
    it(`from* for ${table} emits exactly the DDL columns`, () => {
      const ddlCols = ddlColumns(table);
      const rowCols = new Set(Object.keys(row));
      // Both directions: no phantom writes, no silently-dropped columns.
      expect([...rowCols].filter((c) => !ddlCols.has(c))).toEqual([]);
      expect([...ddlCols].filter((c) => !rowCols.has(c))).toEqual([]);
    });
  }

  it("enum arrays match the DDL check constraints exactly", () => {
    expect([...DEAL_STAGES]).toEqual(ddlEnum("stage"));
    expect([...ROUTING_LANES]).toEqual(ddlEnum("routing_lane"));
    expect([...ACTIVITY_TYPES]).toEqual(ddlEnum("type"));
    expect([...ACTIVITY_SOURCES]).toEqual(ddlEnum("source"));
    expect([...TASK_STATUSES]).toEqual(ddlEnum("status"));
  });
});

describe("crm mappers round-trip", () => {
  it("deal survives to→from→to (nulls become undefined and back)", () => {
    const row = fromDeal(sampleDeal);
    expect(toDeal(row)).toEqual(sampleDeal);
    // undefined optionals write as null, read back as undefined
    const bare = toDeal(fromDeal({ ...sampleDeal, personId: undefined, orgId: "o1", value: undefined, notes: undefined }));
    expect(bare.personId).toBeUndefined();
    expect(bare.value).toBeUndefined();
    expect(bare.notes).toBeUndefined();
  });

  it("numeric deal value coming back as a string (pg numeric) is coerced", () => {
    expect(toDeal({ ...fromDeal(sampleDeal), value: "7000" }).value).toBe(7000);
  });

  it("activity survives round-trip; jsonb defaults stay {}", () => {
    expect(toActivity(fromActivity(sampleActivity))).toEqual(sampleActivity);
    expect(toActivity({ ...fromActivity(sampleActivity), source_context: null }).sourceContext).toEqual({});
  });

  it("task survives round-trip", () => {
    expect(toTask(fromTask(sampleTask))).toEqual(sampleTask);
  });
});
