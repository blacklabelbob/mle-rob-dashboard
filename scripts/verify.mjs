#!/usr/bin/env node
/**
 * The driver-side verify helper owed by INCIDENT-LEDGER #47 and #48.
 *
 *   node scripts/verify.mjs "npx vitest run"
 *   node scripts/verify.mjs "STORAGE_SOURCE=file npm run build"
 *
 * Runs the command, captures rc from THAT command and nothing else (no
 * intervening tail/grep/echo — the #47 bug), writes a receipt to `.verify/`,
 * and prints the one sanctioned verification line. Exits with the command's
 * own rc, so a red check reds the driver step too.
 *
 * `node scripts/verify.mjs --audit <file>` reads the receipts written this run
 * and reports every rc claim in <file> that no receipt backs — which is the
 * case an increment killed mid-flight leaves behind.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { formatVerifiedLine, makeReceipt, auditVerificationClaims } from "../lib/verification/verifyReceipt.ts";

const RECEIPT_DIR = join(process.cwd(), ".verify");

function readReceipts() {
  try {
    return readdirSync(RECEIPT_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(RECEIPT_DIR, f), "utf8")));
  } catch {
    return [];
  }
}

const argv = process.argv.slice(2);

if (argv[0] === "--audit") {
  const target = argv[1];
  if (!target) {
    console.error("usage: node scripts/verify.mjs --audit <file>");
    process.exit(2);
  }
  const receipts = readReceipts();
  const { backed, unbacked, unattributed } = auditVerificationClaims(
    readFileSync(target, "utf8"),
    receipts,
  );
  console.log(
    `receipts on disk: ${receipts.length} · claims backed: ${backed.length} · unattributed: ${unattributed.length}`,
  );
  for (const c of unattributed) {
    console.log(`  ? ${c.text} @${c.index} — no recognised command nearby`);
  }
  for (const c of unbacked) {
    console.log(`  ✗ ${c.text} @${c.index} — claims ${c.tool} rc=${c.rc}, no receipt says so`);
  }
  if (unbacked.length) {
    console.error(
      `\nUNBACKED: ${unbacked.length} exit-code claim(s) were written but never measured this run.`,
    );
    process.exit(1);
  }
  console.log("\nevery attributed rc claim is backed by a receipt from this run.");
  process.exit(0);
}

const command = argv.join(" ").trim();
if (!command) {
  console.error('usage: node scripts/verify.mjs "<command>"');
  process.exit(2);
}

const startedAt = new Date().toISOString();
const run = spawnSync(command, { shell: true, stdio: "inherit" });
// rc is read here and nowhere else. Nothing runs between the command and this
// line — that gap is exactly what #47 was.
const rc = run.status === null ? 128 + (run.signal ? 1 : 0) : run.status;
const finishedAt = new Date().toISOString();

const receipt = makeReceipt({ command, rc, startedAt, finishedAt });
mkdirSync(RECEIPT_DIR, { recursive: true });
writeFileSync(
  join(RECEIPT_DIR, `${receipt.tool}-${startedAt.replace(/[:.]/g, "-")}.json`),
  `${JSON.stringify(receipt, null, 2)}\n`,
);

console.log(formatVerifiedLine(receipt));
process.exit(rc);
