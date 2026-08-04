#!/usr/bin/env node
// Q84 inc.142 — assert that no wrapper writes an unlabeled clock into a file Rob reads.
//
// USAGE
//   npm run audit:clocks                     # scans ~/.claude/scripts/*.sh
//   npm run audit:clocks -- --brief          # ONE line, and only when something is wrong
//   node --import ./scripts/ts-loader.mjs scripts/audit-wrapper-clocks.mjs <dir-or-file...>
//
// EXIT CODES
//   0  every human-readable stamp reaching Rob names its zone, and something invokes this gate
//   1  at least one does not — the same defect inc.139/140/141 fixed three times by hand
//   2  the wrapper directory could not be read (a silent skip would read as "clean")
//   3  clean, but NO wrapper runs this gate — the rule is unenforced (Q84 inc.143)
//
// WHERE THE TRIGGER LIVES, AND WHY NOT A GIT HOOK (Q84 inc.143). The files judged here are not in
// this repo, so a repo commit is not the event that introduces the defect — a new wrapper appears
// in `~/.claude/scripts` without any commit happening at all, and `.git/hooks` is not checked in,
// so a rule enforced there would live exactly as nowhere as the two shell comments inc.142 killed.
// The driver's tick is the event that matches: it runs on the machine that HAS those wrappers, at
// the cadence they change, and it already asks this repo for things (`intake-silence.mjs stamp`).
// So `--brief` exists to be prefixed onto the driver's prompt: silent when clean, one line when
// not, which puts the finding in front of the next increment instead of in a log nobody opens.
// The wiring itself sits in an undiffed shell file, so this gate checks that it is still there.
//
// The judgement lives in `lib/integrity/wrapperClock.ts` under 23 tests; this file reads bytes
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
import { auditWrapperClocks, REPO_STAMP_CALL, TRIGGER_CALLS } from "../lib/integrity/wrapperClock.ts";

const DEFAULT_DIR = path.join(os.homedir(), ".claude", "scripts");
const args = process.argv.slice(2);
const BRIEF = args.includes("--brief");
const targets = args.filter((a) => !a.startsWith("--"));
if (targets.length === 0) targets.push(DEFAULT_DIR);

/** In --brief the caller is a prompt builder, not a reader: say nothing unless it must act. */
const say = (line) => {
  if (!BRIEF) console.log(line);
};

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
    // Even in --brief this speaks: "cannot read" is the one outcome that must never pass as clean.
    console.error(
      BRIEF
        ? `CLOCK GATE COULD NOT RUN — ${target} unreadable (${err.code ?? err.message}); the ` +
            `wrapper-clock rule was NOT checked this tick. Say so rather than assuming clean.`
        : `✖ ${target}: cannot read (${err.code ?? err.message})`,
    );
    process.exit(2);
  }
  for (const file of files) {
    scripts.push({ name: path.basename(file), source: await readFile(file, "utf8") });
  }
}

const { findings, usesRepoStamp, skipped, triggeredBy } = auditWrapperClocks(scripts);
const scanned = scripts.length - skipped.length;

say(
  `scanned ${scripts.length} wrapper${scripts.length === 1 ? "" : "s"}: ` +
    `${scanned} write to a file Rob reads, ${skipped.length} do not.`,
);
if (usesRepoStamp.length > 0) {
  say(`asks the repo for its stamp (${REPO_STAMP_CALL}): ${usesRepoStamp.join(", ")}`);
}
say(
  triggeredBy.length > 0
    ? `runs this gate: ${triggeredBy.join(", ")}`
    : `⚠ nothing runs this gate — it only fires when a human types it`,
);

if (findings.length > 0) {
  if (BRIEF) {
    const worst = findings[0];
    console.error(
      `CLOCK GATE IS RED — ${findings.length} unlabeled stamp` +
        `${findings.length === 1 ? " reaches" : "s reach"} a file Rob reads (first: ${worst.script}:` +
        `${worst.line}, '+${worst.format}' → ${worst.surfaces.join(", ")}). Fix this BEFORE the ` +
        `queue item: run \`npm run audit:clocks\` for the full report. Q84 inc.142.`,
    );
    process.exit(1);
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
}

// Clean — but a clean gate nobody runs is the state inc.143 exists to make visible. The wiring
// lives in a shell file outside this repo, so its absence can only be noticed by looking.
if (triggeredBy.length === 0) {
  console.error(
    BRIEF
      ? `CLOCK GATE HAS NO TRIGGER — no wrapper in the scanned set invokes ` +
          `\`${TRIGGER_CALLS[0]}\`, so the rule is only enforced when a human remembers to type it. ` +
          `Re-wire the driver tick (Q84 inc.143) before the queue item.`
      : `\n✖ no wrapper invokes \`${TRIGGER_CALLS[0]}\` — the rule is unenforced. The driver tick is ` +
          `where it belongs: it runs on the machine that has these wrappers, at the cadence they ` +
          `change. Add \`npm run audit:clocks -- --brief\` to the prompt it builds (Q84 inc.143).`,
  );
  process.exit(3);
}

say("✓ every human-readable stamp reaching Rob names its zone");
process.exit(0);
