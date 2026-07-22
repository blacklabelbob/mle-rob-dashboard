// PRD Task 3.7: orphaned-row check, pure per CR-3. The schema *should* make
// orphans impossible (FKs + check constraints on activities), but two real
// paths exist and this watches the invariant instead of asserting it:
//   * tasks have NO anchor check constraint — a deal delete (deal_id on delete
//     set null) can strand a task with zero anchors.
//   * belt-and-braces: dangling FK targets / anchorless activities would mean
//     a constraint was dropped or bypassed — exactly what a watchdog is for.
// Caller fetches rows; this only judges them. Alerts ride the flags ledger.

type ActivityRow = {
  id: string;
  person_id: string | null;
  org_id: string | null;
  deal_id: string | null;
};

type TaskRow = {
  id: string;
  person_id: string | null;
  deal_id: string | null;
  activity_id: string | null;
};

export type OrphanFinding = {
  table: "activities" | "tasks";
  rowId: string;
  reason: string;
};

export type OrphanInput = {
  activities: ActivityRow[];
  tasks: TaskRow[];
  peopleIds: Iterable<string>;
  orgIds: Iterable<string>;
  dealIds: Iterable<string>;
};

// Deterministic flag title — the idempotency key against the flags ledger:
// one flag per orphaned row, ever; nightly re-runs never duplicate it.
export function orphanFlagTitle(f: OrphanFinding): string {
  return `Orphaned ${f.table.slice(0, -1)} row ${f.rowId}`;
}

export function findOrphans(input: OrphanInput): OrphanFinding[] {
  const people = new Set(input.peopleIds);
  const orgs = new Set(input.orgIds);
  const deals = new Set(input.dealIds);
  const activityIds = new Set(input.activities.map((a) => a.id));
  const findings: OrphanFinding[] = [];

  for (const a of input.activities) {
    if (!a.person_id && !a.org_id && !a.deal_id) {
      findings.push({
        table: "activities",
        rowId: a.id,
        reason: "activity has no person, org, or deal anchor (check constraint bypassed?)",
      });
      continue;
    }
    const dangling =
      (a.person_id && !people.has(a.person_id) && `person ${a.person_id}`) ||
      (a.org_id && !orgs.has(a.org_id) && `org ${a.org_id}`) ||
      (a.deal_id && !deals.has(a.deal_id) && `deal ${a.deal_id}`);
    if (dangling) {
      findings.push({
        table: "activities",
        rowId: a.id,
        reason: `activity references deleted ${dangling} (FK bypassed?)`,
      });
    }
  }

  for (const t of input.tasks) {
    if (!t.person_id && !t.deal_id && !t.activity_id) {
      findings.push({
        table: "tasks",
        rowId: t.id,
        reason: "task lost all anchors (person/deal/activity) — likely a deal delete set-nulled its last link",
      });
      continue;
    }
    const dangling =
      (t.person_id && !people.has(t.person_id) && `person ${t.person_id}`) ||
      (t.deal_id && !deals.has(t.deal_id) && `deal ${t.deal_id}`) ||
      (t.activity_id && !activityIds.has(t.activity_id) && `activity ${t.activity_id}`);
    if (dangling) {
      findings.push({
        table: "tasks",
        rowId: t.id,
        reason: `task references deleted ${dangling} (FK bypassed?)`,
      });
    }
  }

  return findings;
}
