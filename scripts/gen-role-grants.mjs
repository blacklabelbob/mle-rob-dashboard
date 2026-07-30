#!/usr/bin/env node
/**
 * `npm run gen:role-grants` — writes supabase/migrations/0032_role_read_grants.sql.
 * `npm run gen:role-grants -- --check` — writes nothing, exits 1 if the committed file drifted.
 *
 * Q73 rollout half, the half that is not Rob's. The model and the reasoning live in
 * `lib/security/roleGrants.ts`; this file is only the I/O around it, imported through
 * `scripts/ts-loader.mjs` so the module the generator applies is the module 20+ tests grade.
 *
 * WRITES A MIGRATION FILE. It does not apply one — no network call, no Supabase client, no
 * service-role key. The rollout ships on Rob's go.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSchema } from "./lib/schema-from-migrations.mjs";
import { sensitiveByTable } from "./lib/sensitive-columns.mjs";
import {
  renderRoleGrantSql, grantBreaches, uncoveredSensitive, COVERED_TABLES, DENIALS,
} from "../lib/security/roleGrants.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(repo, "supabase/migrations/0032_role_read_grants.sql");
const check = process.argv.includes("--check");

const schema = readSchema();
const sensitive = sensitiveByTable(schema);

const breaches = grantBreaches(schema, sensitive);
if (breaches.length) {
  console.error(`role-grant model has ${breaches.length} breach(es) — refusing to generate:`);
  for (const b of breaches) console.error(`  [${b.kind}] ${b.detail}`);
  process.exit(1);
}

const sql = renderRoleGrantSql(schema);

if (check) {
  if (!existsSync(target)) {
    console.error("0032_role_read_grants.sql is missing — run `npm run gen:role-grants`");
    process.exit(1);
  }
  if (readFileSync(target, "utf8") !== sql) {
    console.error("0032_role_read_grants.sql has drifted from the model — run `npm run gen:role-grants`");
    process.exit(1);
  }
  console.log("0032_role_read_grants.sql matches lib/security/roleGrants.ts");
  process.exit(0);
}

writeFileSync(target, sql);
const uncovered = uncoveredSensitive(sensitive);
console.log(
  `wrote supabase/migrations/0032_role_read_grants.sql — ${COVERED_TABLES.length} tables covered, ` +
  `${DENIALS.length} column denials, NOT APPLIED`,
);
console.log(
  `coverage limit, stated: ${uncovered.length} table(s) still carry money/PII outside this model — ` +
  uncovered.map((u) => `${u.table} (${u.columns.length})`).join(", "),
);
