#!/usr/bin/env node
// PRD Task MC.9 (invoicing leg, half 2) — the ENTRY POINT.
//
// Half 1 parses the ledger, `ledgerSync.ts` decides, `ledgerRunner.ts` sequences,
// `ledgerAdapters.ts` supplies the real filesystem/git/Supabase effects. This is
// the hand that pulls the lever, and it deliberately lives HERE and not in a
// Vercel cron: the ledger is `invoices/invoice-ledger.csv` in the CONTRACTS repo,
// which is not deployed with the dashboard. A serverless function has no path to
// that file, so a cron route could only ever report a read failure. The sync runs
// on the machine that holds both checkouts.
//
// DEFAULT IS PLAN-ONLY. Every number this moves is money on a panel Rob shows
// people. So the default run reads, digests, diffs and PRINTS — writing nothing,
// recording no run. `--apply` is the explicit second step, and it is the only
// path that touches prod.
//
//   node scripts/sync-invoice-ledger.mjs              # preview the diff
//   node scripts/sync-invoice-ledger.mjs --apply      # write it
//
// Exit codes are for the scheduler that will wrap this (MC.14 alerting):
//   0 = clean (preview produced a plan, or the run applied with nothing to review)
//   1 = needs a human (refusal, read failure, apply failure, or requiresReview)
//
// The TS modules are loaded through Vite's SSR loader — already installed via
// vitest, so this adds no dependency and the script runs the SAME modules the
// tests cover, not a transpiled copy that can drift.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Defaults point at the sibling checkout; both are overridable for a machine
// that keeps the repos elsewhere.
const CONTRACTS_REPO_DIR =
  process.env.CONTRACTS_REPO_DIR ?? path.resolve(repoRoot, "..", "contracts");
const SOURCE_PATH = process.env.CONTRACTS_LEDGER_PATH ?? "invoices/invoice-ledger.csv";
const SOURCE_REPO = process.env.CONTRACTS_REPO_LABEL ?? "MyLocalEverything/contracts";

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/** Load the ledger TS modules exactly as written (Vite resolves the
 *  extensionless relative imports Node's type-stripping cannot). */
async function loadLedgerModules() {
  const server = await createServer({
    configFile: false,
    root: repoRoot,
    logLevel: "warn",
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const [runner, adapters] = await Promise.all([
      server.ssrLoadModule("/lib/readModel/ledgerRunner.ts"),
      server.ssrLoadModule("/lib/readModel/ledgerAdapters.ts"),
    ]);
    return { runner, adapters };
  } finally {
    await server.close();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvLocal();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");

  const ledgerFile = path.join(CONTRACTS_REPO_DIR, SOURCE_PATH);
  if (!existsSync(ledgerFile)) {
    // Named before we start, because "0 invoices" and "wrong path" print the
    // same way once a run is under way.
    throw new Error(`ledger not found at ${ledgerFile} — set CONTRACTS_REPO_DIR`);
  }

  const { runner, adapters } = await loadLedgerModules();
  const input = {
    source: adapters.createFsLedgerSource({ repoDir: CONTRACTS_REPO_DIR, sourcePath: SOURCE_PATH }),
    store: adapters.createSupabaseLedgerStore(adapters.createLedgerSyncClient(url, key)),
    syncedAt: new Date().toISOString(),
    sourceRepo: SOURCE_REPO,
    sourcePath: SOURCE_PATH,
  };

  console.log(`${apply ? "APPLY" : "PLAN ONLY"} · ${SOURCE_REPO}/${SOURCE_PATH}`);

  if (!apply) {
    const preview = await runner.previewLedgerSync(input);
    console.log(preview.log);
    if (preview.outcome !== "planned") return 1;
    console.log("Nothing was written. Re-run with --apply to commit this plan.");
    return preview.plan.refusalReason || preview.plan.requiresReview ? 1 : 0;
  }

  const result = await runner.runLedgerSync(input);
  console.log(`${result.outcome.toUpperCase()} · ${result.log}`);
  return runner.runNeedsAttention(result) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
