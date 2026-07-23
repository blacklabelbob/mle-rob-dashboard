// PRD Task MC.16 — nightly backup snapshot shaping + verification (pure, CR-3).
// The cron route fetches every table's rows, this module builds the snapshot
// object and — after the route re-downloads what it uploaded — verifies the
// stored copy against live head-counts taken independently of the row fetch.
// A backup that exists but fails verification is treated as MISSING (the DoD
// is "backup with verification", not "a file landed somewhere").

/** Every Supabase table the CRM writes. Adding a table? Add it here or the
 *  verifier fails the next nightly run — deliberate: silent partial backups
 *  are worse than a loud failed one. */
export const BACKUP_TABLES = [
  "people",
  "orgs",
  "edges",
  "org_memberships",
  "activities",
  "deals",
  "tasks",
  "flags",
  "dedup_review",
  "verticals",
  "projects",
  "dev_chat",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Stable column each table is paged by (deterministic ranges need an order).
 *  Every table keys on `id` except dedup_review (pair_key PK) — caught live
 *  by the first prod run's verifier, hence pinned here + in tests. */
export const BACKUP_ORDER_KEY: Record<BackupTable, string> = {
  people: "id",
  orgs: "id",
  edges: "id",
  org_memberships: "id",
  activities: "id",
  deals: "id",
  tasks: "id",
  flags: "id",
  dedup_review: "pair_key",
  verticals: "id",
  projects: "id",
  dev_chat: "id",
};

export const BACKUP_BUCKET = "backups";

export type BackupSnapshot = {
  takenAt: string; // ISO timestamp, injected by the route (no clocks here)
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

export function buildSnapshot(
  tables: Record<string, unknown[]>,
  takenAt: string
): BackupSnapshot {
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) counts[t] = (tables[t] ?? []).length;
  return { takenAt, counts, tables };
}

/** Dated object name so nightly runs never overwrite each other;
 *  the route additionally upserts `latest.json` as the restore pointer. */
export function backupObjectName(takenAt: string): string {
  return `crm-backup-${takenAt.slice(0, 10)}.json`;
}

export type VerifyResult = { ok: boolean; problems: string[] };

/** Verify a re-downloaded snapshot against live head-counts queried
 *  independently of the row fetch — catches truncated fetches (paging bugs,
 *  row caps) as well as corrupt/partial uploads. */
export function verifySnapshot(
  parsed: unknown,
  liveCounts: Record<string, number>
): VerifyResult {
  const problems: string[] = [];
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problems: ["snapshot is not a JSON object"] };
  }
  const snap = parsed as Partial<BackupSnapshot>;
  if (typeof snap.takenAt !== "string" || !snap.takenAt) {
    problems.push("missing takenAt");
  }
  const tables = snap.tables;
  if (typeof tables !== "object" || tables === null) {
    return { ok: false, problems: [...problems, "missing tables"] };
  }
  for (const t of BACKUP_TABLES) {
    const rows = (tables as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) {
      problems.push(`table ${t}: missing from snapshot`);
      continue;
    }
    const live = liveCounts[t];
    if (typeof live !== "number") {
      problems.push(`table ${t}: no live count to verify against`);
    } else if (rows.length !== live) {
      problems.push(`table ${t}: snapshot has ${rows.length} rows, live has ${live}`);
    }
  }
  // Non-empty guard: a "successful" backup of an empty people table means the
  // fetch (or the DB) is broken — never verify it as a good restore point.
  const people = (tables as Record<string, unknown>)["people"];
  if (Array.isArray(people) && people.length === 0) {
    problems.push("people table is empty — refusing to certify an empty backup");
  }
  return { ok: problems.length === 0, problems };
}

export const BACKUP_FAIL_TITLE = "Nightly CRM backup FAILED verification";

export function backupFailDetail(problems: string[], takenAt: string): string {
  return (
    `Backup run at ${takenAt} did not produce a verified restore point: ` +
    problems.join("; ") +
    ". Until a run verifies clean, the newest GOOD object in the backups bucket is the restore point (MC.16)."
  );
}
