/**
 * Q84 inc.51 — the one place the unapplied-migration backlog lives.
 *
 * "Written, tested, not applied" has happened twice (0032 Q73 role grants, 0034
 * dedup_review CHECKs) and both said so only in a comment header. This reads the
 * markers, prints the backlog, and with `--flag` puts it on Rob's ledger under a
 * stable dedupeKey so a re-run CORRECTS its own row instead of stacking a second
 * contradicting count beside it (inc.8's rule).
 *
 * Read-only against the repo. The decisions live in lib/migrations/applyStatus.ts
 * (pure, 6 tests); this file is the I/O around it, imported through ts-loader so
 * the ladder that runs here is the ladder the tests grade.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/migration-backlog.mjs [--flag] [--json]
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationBacklog } from "../lib/migrations/applyStatus.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(REPO, "supabase/migrations");
const FLAG = process.argv.includes("--flag");
const JSON_OUT = process.argv.includes("--json");
// Same var as scripts/notion-crm-check.mjs, deliberately — a second name for the
// same destination is one more thing to document and one more thing to get wrong.
// Defaults to prod: the ledger Rob reads is the deployed one.
const BASE = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(join(DIR, name), "utf8") }));

const backlog = migrationBacklog(files);

if (JSON_OUT) {
  console.log(JSON.stringify(backlog, null, 2));
} else {
  console.log(`migrations: ${files.length} · pending ${backlog.pending.length} · unmarked ${backlog.unmarked.length}`);
  for (const p of backlog.pending) console.log(`  PENDING  ${p.name}  (owner: ${p.owner ?? "unnamed"})  ${p.evidence}`);
  for (const d of backlog.disagreements) console.log(`  ⚠️  ${d.name}: ${d.reason}`);
  if (!backlog.pending.length) console.log("  nothing outstanding — every migration is either applied or marked so.");
}

if (!FLAG) process.exit(0);

if (!backlog.pending.length) {
  console.log("--flag: nothing pending, no ledger write.");
  process.exit(0);
}

const names = backlog.pending.map((p) => p.name).join(", ");
const finding = {
  entityName: "MLE CRM",
  title: `${backlog.pending.length} migration(s) written and tested but NOT APPLIED to prod`,
  detail:
    `${names}. Each is committed, tested and deliberately safe to apply; ` +
    `applying them is one \`supabase db push\` (Rob's — it changes prod schema/privileges). ` +
    `0032 is the Q73 rollout half (column read privileges for non-owner roles); ` +
    `0034 pins dedup_review's status vocabulary, and that table holds 0 rows on prod so its ` +
    `CHECKs cannot fail on legacy data. Until pushed, the repo enforces rules the live ` +
    `database does not. Re-run: npm run migrations:backlog`,
  severity: "medium",
  dedupeKey: "unapplied-migrations",
};

const res = await fetch(`${BASE}/api/admin/flags`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(finding),
});
const body = await res.text();
if (!res.ok) {
  console.error(`--flag: ledger write FAILED ${res.status}: ${body.slice(0, 300)}`);
  process.exit(1);
}
const json = JSON.parse(body);
console.log(`--flag: [${finding.dedupeKey}] ledger ${json.action} — ${json.reason}`);
