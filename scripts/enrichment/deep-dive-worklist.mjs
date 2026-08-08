// Q87 inc.4 — the writer the ledger never had.
//
// inc.2: which referral targets are owed a deep dive (pure). inc.3: where a run gets written
// down (pure). Neither can open a file, so `due-unattributed` was a verdict no run could leave.
// This is the shell that touches the world — Supabase, disk, the clock — and decides nothing:
// every refusal it makes lives in `lib/enrichment/deepDiveCli.ts` where a test can hold it.
//
//   npm run worklist:deepdive                                  → report, writes nothing
//   npm run worklist:deepdive -- --record C-2021 --by lead-enricher
//
// --record writes PROVENANCE. It does not do research, and it must never be run to make a report
// look better: the row it appends is what lets `deepDiveDue` say `covered`, so a row naming a
// producer that did not run is a lie the CRM will repeat for a year.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseDeepDiveArgs,
  isCliRefusal,
  dossierPath,
  DEEP_DIVE_DOSSIER_DIR,
  DEEP_DIVE_LEDGER_PATH,
} from "../../lib/enrichment/deepDiveCli.ts";
import { deepDiveWorklist } from "../../lib/enrichment/deepDiveDue.ts";
import { parseLedger, recordRun, serializeLedger } from "../../lib/enrichment/deepDiveLedger.ts";
import { makeDossierDive, checkDossier } from "../../lib/enrichment/deepDiveDossier.ts";
import { runDeepDivePass, deepDivePassLog } from "../../lib/enrichment/deepDivePass.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = parseDeepDiveArgs(process.argv.slice(2));
if (isCliRefusal(args)) {
  console.error(`✋ ${args.refusal}`);
  process.exit(2);
}

/** The clock lives HERE and nowhere below — every module downstream takes the day as input. */
const today = new Date().toISOString().slice(0, 10);

function readLedger() {
  try {
    return JSON.parse(readFileSync(DEEP_DIVE_LEDGER_PATH, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return null; // no ledger yet is not an error; it is the start
    throw err;
  }
}

const onDisk = readLedger();
const { runs, rejected } = parseLedger(onDisk ?? { version: 1, runs: [] });
// A rejected row is reported every single time, never on a --verbose flag: a row that silently
// vanishes is how an org reads `due` forever while the file says it was covered.
for (const r of rejected) console.error(`⚠️  ledger row ${r.index} ignored — ${r.reason}`);

if (args.mode === "record") {
  const run = { orgId: args.orgId, ranAt: args.ranAt ?? today, producedBy: args.producedBy };
  const result = recordRun(onDisk, run);
  if (result.outcome === "duplicate") {
    console.log(`= already on file: ${run.orgId} ${run.ranAt} by ${run.producedBy} — nothing appended`);
  } else {
    mkdirSync(dirname(DEEP_DIVE_LEDGER_PATH), { recursive: true });
    writeFileSync(DEEP_DIVE_LEDGER_PATH, serializeLedger(result.ledger));
    console.log(`✔ recorded: ${run.orgId} deep-dived ${run.ranAt} by ${run.producedBy} → ${DEEP_DIVE_LEDGER_PATH}`);
  }
  process.exit(0);
}

if (args.mode === "check") {
  // Read-only, and it never reaches prod: whether a dossier is well-formed is a question about the
  // FILE, not about the book. Asking Supabase here would make a researcher need the service key to
  // proof-read its own output, and would make an offline check impossible.
  const path = dossierPath(args.orgId);
  if (isCliRefusal(path)) {
    console.error(`✋ ${path.refusal}`);
    process.exit(2);
  }
  let raw = null;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err?.code !== "ENOENT") {
      // Unparseable is NOT the same as absent, and must not be reported as "nothing researched it".
      console.error(`✋ ${path} exists but is not readable JSON: ${err.message}`);
      process.exit(2);
    }
  }

  const check = checkDossier(args.orgId, raw);
  console.log(`\nDOSSIER CHECK — ${args.orgId}  (${path})`);
  for (const d of check.droppedSources) console.error(`⚠️  source dropped — "${d.value}" — ${d.reason}`);
  if (check.dossierRefusal) console.log(`\n✗ REJECTED by the dossier reader:\n    ${check.dossierRefusal}`);
  else if (check.passRefusal) console.log(`\n✗ REJECTED by the pass's finding rules:\n    ${check.passRefusal}`);
  else {
    console.log(
      `\n✔ RECORDABLE — the pass would write: ${check.wouldRecord.orgId} ` +
        `${check.wouldRecord.ranAt} by ${check.wouldRecord.producedBy}`,
    );
    // Said out loud every time it passes. A green check is not a covered company.
    console.log(`  Nothing was written. This org is still owed its row until --pass --execute earns it.`);
  }
  process.exit(check.accepted ? 0 : 1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✋ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot read the book");
  process.exit(2);
}
const res = await fetch(
  `${url}/rest/v1/orgs?select=id,name,node_type,relationship,description,notes,key_dates&order=id`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) {
  console.error(`✋ orgs read failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const orgs = (await res.json()).map((o) => ({
  id: o.id,
  name: o.name,
  nodeType: o.node_type,
  relationship: o.relationship,
  description: o.description,
  notes: o.notes,
  keyDates: o.key_dates,
}));

if (args.mode === "pass") {
  // The loader — the ONLY new thing that touches disk this increment. It opens the file
  // `dossierPath` names and hands the parsed JSON to `makeDossierDive`, which decides whether it
  // covers this org. A missing file returns null on purpose: `dossierToFinding` says "nothing has
  // researched it yet" in those words, which is a different fact from "found nothing".
  const dropped = [];
  const load = async (decision) => {
    const path = dossierPath(decision.orgId);
    if (isCliRefusal(path)) throw new Error(path.refusal);
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      if (err?.code === "ENOENT") return null;
      throw new Error(`the dossier at ${path} could not be read: ${err.message}`);
    }
  };

  const result = await runDeepDivePass(
    {
      listOrgs: async () => orgs,
      loadLedger: async () => onDisk,
      dive: makeDossierDive(load, (decision, read) => {
        for (const d of read.droppedSources) dropped.push(`${decision.orgId}: "${d.value}" — ${d.reason}`);
      }),
      saveLedger: async (ledger) => {
        mkdirSync(dirname(DEEP_DIVE_LEDGER_PATH), { recursive: true });
        writeFileSync(DEEP_DIVE_LEDGER_PATH, serializeLedger(ledger));
      },
    },
    {
      missingConfig: [],
      execute: args.execute === true,
      limit: args.limit,
      freshness: { asOf: today, freshDays: args.freshDays },
    },
  );

  console.log(`\nDEEP-DIVE PASS — dossiers read from ${DEEP_DIVE_DOSSIER_DIR}/, as of ${today}`);
  console.log(JSON.stringify(deepDivePassLog(result), null, 2));
  // Dropped sources are printed every run, never behind a flag: a dossier half of whose sources
  // were attributions still earns a row, and whoever reads the ledger deserves to know that.
  for (const d of dropped) console.error(`⚠️  source dropped — ${d}`);
  if (result.kind === "planned") {
    console.log(
      `\nPLANNED ONLY — ${result.plan.due.length} org(s) owed a dive. Nothing was researched and ` +
        `nothing was written.\n  Add --execute to run the pass against the dossiers on disk.`,
    );
  }
  process.exit(0);
}

const { due, counts } = deepDiveWorklist(orgs, { runs, asOf: today, freshDays: args.freshDays });

console.log(`\nDEEP-DIVE WORKLIST — ${orgs.length} orgs read, as of ${today}`);
console.log(`ledger: ${runs.length} recorded run(s)${onDisk ? "" : " (no ledger file yet)"}\n`);
for (const [verdict, n] of Object.entries(counts)) if (n) console.log(`  ${String(n).padStart(3)}  ${verdict}`);
if (!due.length) {
  console.log("\nNothing owed a deep dive.");
} else {
  console.log(`\nOWED (${due.length}), emptiest record first:`);
  for (const d of due) console.log(`  ${d.orgId}  ${d.name}\n      ${d.because}`);
  console.log(
    `\nTo attribute a run once one has ACTUALLY been done:\n` +
      `  npm run worklist:deepdive -- --record <orgId> --by <agent/skill that produced it>`,
  );
}
