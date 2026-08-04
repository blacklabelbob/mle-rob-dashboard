#!/usr/bin/env node
// Q84 inc.142 — assert that no wrapper writes an unlabeled clock into a file Rob reads.
//
// USAGE
//   npm run audit:clocks                     # scans ~/.claude/scripts/*.sh
//   node --import ./scripts/ts-loader.mjs scripts/audit-wrapper-clocks.mjs <dir-or-file...>
//
// EXIT CODES
//   0  every human-readable stamp reaching Rob names its zone
//   1  at least one does not — the same defect inc.139/140/141 fixed three times by hand
//   2  the wrapper directory could not be read (a silent skip would read as "clean")
//
// The judgement lives in `lib/integrity/wrapperClock.ts` under 18 tests; this file reads bytes
// and prints, so nothing the tests pin is re-decided here (CR-3).
//
// WHY THIS IS NOT A CI STEP. The wrappers it guards live in `~/.claude/scripts` — a machine-local
// directory that does not exist on a CI runner, where this would exit 2 ("cannot read") on every
// run and get muted as noise. It runs where the wrappers are: the driver's own increment loop,
// alongside the six sibling `audit:*` scripts, none of which are in `.github/workflows/ci.yml`
// either. If a future run "fixes" CI by adding it, that is the mistake this paragraph exists for.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { auditWrapperClocks, REPO_STAMP_CALL } from "../lib/integrity/wrapperClock.ts";

const DEFAULT_DIR = path.join(os.homedir(), ".claude", "scripts");
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (targets.length === 0) targets.push(DEFAULT_DIR);

/** Expand a directory to its shell scripts; a file is taken as given. */
async function collect(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return [target];
  const entries = await readdir(target);
  return entries.filter((e) => e.endsWith(".sh")).map((e) => path.join(target, e));
}

const scripts = [];
for (const target of targets) {
  let files;
  try {
    files = await collect(target);
  } catch (err) {
    console.error(`✖ ${target}: cannot read (${err.code ?? err.message})`);
    process.exit(2);
  }
  for (const file of files) {
    scripts.push({ name: path.basename(file), source: await readFile(file, "utf8") });
  }
}

const { findings, usesRepoStamp, skipped } = auditWrapperClocks(scripts);
const scanned = scripts.length - skipped.length;

console.log(
  `scanned ${scripts.length} wrapper${scripts.length === 1 ? "" : "s"}: ` +
    `${scanned} write to a file Rob reads, ${skipped.length} do not.`,
);
if (usesRepoStamp.length > 0) {
  console.log(`asks the repo for its stamp (${REPO_STAMP_CALL}): ${usesRepoStamp.join(", ")}`);
}

if (findings.length === 0) {
  console.log("✓ every human-readable stamp reaching Rob names its zone");
  process.exit(0);
}

for (const f of findings) {
  console.error(`\n✖ ${f.script}:${f.line}  writes an unlabeled clock`);
  console.error(`    format:  '+${f.format}'  — no %Z, so the instant is not recoverable`);
  console.error(`    reaches: ${f.surfaces.join(", ")}`);
}
console.error(
  `\n${findings.length} private clock${findings.length === 1 ? "" : "s"}. Rob reads these files; ` +
    `a stamp that does not say whose clock produced it hands him arithmetic at the moment he is ` +
    `being told something is broken (Q84 inc.139).`,
);
console.error(
  `Fix: ask the repo — REPO_STAMP="$(cd <repo> && node scripts/${REPO_STAMP_CALL})" — and keep ` +
    `\`date '+%Y-%m-%d %H:%M:%S %Z'\` only as the fallback for when node or the repo is unusable.`,
);
process.exit(1);
