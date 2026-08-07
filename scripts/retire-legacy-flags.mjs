/**
 * Q85 inc.10 — apply the reviewed retirement of the UNKEYED rows #206-#212.
 *
 *   node --import ./scripts/ts-loader.mjs scripts/retire-legacy-flags.mjs          # dry run
 *   node --import ./scripts/ts-loader.mjs scripts/retire-legacy-flags.mjs --apply  # writes
 *
 * The decision lives in `lib/flags/legacyRetirement.ts` (pure, tested). This file is the I/O:
 * read the ledger, print the plan, and — only with `--apply` — resolve the rows the plan says
 * may be resolved, with `supersededNote` so the existing Reopen control can undo every one.
 *
 * DRY RUN IS THE DEFAULT on purpose: these rows are Rob's to-do list, and a pass that writes
 * because it was merely invoked is how a to-do list gets edited by accident. Nothing is ever
 * deleted; the only write is `status`/`resolved_at`/`resolution_note` on rows the plan names.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Q85_LEGACY_RETIREMENTS,
  planLegacyRetirements,
  retirementPlanText,
} from "../lib/flags/legacyRetirement.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(join(REPO, ".env.local"), "utf8");
    const m = file.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Cannot run — missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env.local.");
  process.exit(1);
}
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function readLedger() {
  const url = `${SUPABASE_URL}/rest/v1/flags?select=id,status,dedupe_key,title&order=id.asc&limit=2000`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`flags read failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.map((r) => ({ id: r.id, status: r.status, dedupeKey: r.dedupe_key ?? null, title: r.title }));
}

const ledger = await readLedger();
const steps = planLegacyRetirements(Q85_LEGACY_RETIREMENTS, ledger);
const titles = new Map(ledger.map((r) => [r.id, r.title]));

console.log(`\n${APPLY ? "APPLY" : "DRY RUN — nothing will be written"}  ·  ${ledger.length} ledger rows read\n`);
console.log(retirementPlanText(steps));
console.log("");
for (const s of steps) {
  const t = titles.get(s.legacyId);
  if (t) console.log(`  #${s.legacyId}: ${String(t).slice(0, 96)}`);
}

if (!APPLY) {
  console.log("\nRe-run with --apply to resolve the RETIRE rows. HOLD rows are never written.");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
let written = 0;
for (const step of steps) {
  if (step.action !== "retire") continue;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/flags?id=eq.${step.legacyId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "resolved", resolved_at: today, resolution_note: step.note }),
  });
  if (!res.ok) {
    console.error(`  FAILED #${step.legacyId}: ${res.status} ${await res.text()}`);
    continue;
  }
  const [row] = await res.json();
  written += 1;
  console.log(`  retired #${step.legacyId} → status=${row.status} note="${row.resolution_note}"`);
}
console.log(`\n${written} row(s) retired. HOLD rows left open, unchanged.`);
