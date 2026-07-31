/**
 * Q84 inc.52 — check the migration files against what PROD actually has.
 *
 * inc.51 left 36 migrations `unmarked`. Back-filling `APPLY-STATUS: APPLIED` on
 * all 36 by assertion would have been one sed away and worth nothing. This asks
 * prod instead: PostgREST's OpenAPI root (`GET /rest/v1/`) lists every exposed
 * table/view and its columns — and, as inc.53 found, every exposed function as
 * an `/rpc/<name>` path. Read-only, no schema privileges needed.
 *
 * What it will and will not conclude lives in lib/migrations/schemaEvidence.ts
 * (pure, 10 tests). The short version: a MISSING object proves a file has not
 * landed; a present object proves only that the object exists — constraints,
 * grants, policies and indexes are invisible from here, so any file that also
 * carries those is reported as "not proof".
 *
 * Read-only end to end: it reads the repo, does one GET, writes nothing to the
 * database and edits no migration.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/migration-evidence.mjs [--all] [--json]
 *
 *   (default: only the files inc.51's backlog left unmarked — the open question.
 *    --all grades every migration, including the two known-pending ones.)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationBacklog } from "../lib/migrations/applyStatus.ts";
import { evidenceReport, liveShapeFromOpenApi } from "../lib/migrations/schemaEvidence.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(REPO, "supabase/migrations");
const ALL = process.argv.includes("--all");
const JSON_OUT = process.argv.includes("--json");

// .env.local, same loader shape the other scripts use — no new convention.
for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot ask prod, and guessing is the thing this replaces.");
  process.exit(1);
}

const res = await fetch(`${URL_BASE.replace(/\/$/, "")}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`OpenAPI root ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const live = liveShapeFromOpenApi(await res.json());

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(join(DIR, name), "utf8") }));

const unmarked = new Set(migrationBacklog(files).unmarked);
const subject = ALL ? files : files.filter((f) => unmarked.has(f.name));
const report = evidenceReport(subject, live);

if (JSON_OUT) {
  console.log(JSON.stringify({ liveTables: Object.keys(live.tables).length, liveRpcs: live.rpcs.length, ...report }, null, 2));
  process.exit(report.notLanded.length ? 2 : 0);
}

console.log(
  `prod exposes ${Object.keys(live.tables).length} tables/views + ${live.rpcs.length} rpc function(s) · grading ${subject.length} migration(s)` +
    (ALL ? " (all)" : " (unmarked only)"),
);
for (const e of report.evidence) console.log(`  ${e.verdict.padEnd(34)} ${e.name}  — ${e.reason}`);
console.log(
  `\nnot landed: ${report.notLanded.length} · evidence supports APPLIED: ${report.supportsApplied.length} · ` +
    `no evidence: ${report.noEvidence.length} · present-but-unprovable: ` +
    `${report.evidence.length - report.notLanded.length - report.supportsApplied.length - report.noEvidence.length}`,
);
if (report.notLanded.length) {
  console.log(`\n⚠️  objects missing from prod: ${report.notLanded.join(", ")}`);
}
process.exit(report.notLanded.length ? 2 : 0);
