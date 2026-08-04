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
//   4  clean and wired, but a wrapper hands the driver a `DRIVER_*` gate that GATE_ORDER does not
//      rank — it fires and is printed, and nothing decides what it beats (Q84 inc.148)
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
import {
  auditWrapperClocks,
  clockGateBrief,
  BRIEF_MARKER,
  REPO_STAMP_CALL,
  TRIGGER_CALLS,
} from "../lib/integrity/wrapperClock.ts";

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
        ? `${BRIEF_MARKER} COULD NOT RUN — ${target} unreadable (${err.code ?? err.message}); the ` +
            `wrapper-clock rule was NOT checked this tick. Say so rather than assuming clean.`
        : `✖ ${target}: cannot read (${err.code ?? err.message})`,
    );
    process.exit(2);
  }
  for (const file of files) {
    scripts.push({ name: path.basename(file), source: await readFile(file, "utf8") });
  }
}

const audit = auditWrapperClocks(scripts);
const { findings, usesRepoStamp, skipped, triggeredBy, unrankedGateVars, strandedGateVars } = audit;
const { silencedComposers } = audit;
const scanned = scripts.length - skipped.length;

// --brief has exactly one job: hand the driver the sentence the next increment will read. The
// sentence and its exit code are decided in the repo under test (Q84 inc.144), so this file does
// not get to reword the enforcement it is delivering.
if (BRIEF) {
  const { code, line } = clockGateBrief(audit);
  if (line) console.error(line);
  process.exit(code);
}

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
    `\n✖ no wrapper invokes \`${TRIGGER_CALLS[0]}\` — the rule is unenforced. The driver tick is ` +
      `where it belongs: it runs on the machine that has these wrappers, at the cadence they ` +
      `change. Add \`npm run audit:clocks -- --brief\` to the prompt it builds (Q84 inc.143).`,
  );
  process.exit(3);
}

// Q84 inc.149 — the worse sibling, so it prints first: a gate this repo HAS ranked, that the
// wrapper computes and then drops on the floor. Reported alongside the unranked ones and not
// instead of them; both exit 4, because the caller's only action for either is the same trip into
// the wrapper, and a second exit code would imply a distinction nothing acts on.
if (strandedGateVars.length > 0) {
  for (const v of strandedGateVars) {
    console.error(
      `\n✖ ${v.script}:${v.line}  sets \`${v.envVar}\` as a plain local — it is ranked, it fires, ` +
        `and no child process ever receives it`,
    );
  }
  console.error(
    `\n${strandedGateVars.length} ranked gate${strandedGateVars.length === 1 ? "" : "s"} never ` +
      `reach${strandedGateVars.length === 1 ? "es" : ""} the driver. This is quieter than an ` +
      `unranked gate, not louder: \`gatesFromEnv\` reads the environment it was handed, so a var ` +
      `that was never put there looks exactly like a gate that did not fire.`,
  );
  console.error(
    `Fix: \`export\` it, or write it as a prefix on the invocation line next to the gates that do ` +
      `travel (\`DRIVER_X="$X" node scripts/driver-prompt.mjs\`).`,
  );
}

// Q84 inc.148 — the stamps are clean and the gate is wired, but a gate nobody ranked is still a
// decision nobody made. Reported after the clock verdict, never instead of it.
if (unrankedGateVars.length > 0) {
  for (const v of unrankedGateVars) {
    console.error(`\n✖ ${v.script}:${v.line}  hands the driver \`${v.envVar}\`, which nothing ranks`);
  }
  console.error(
    `\n${unrankedGateVars.length} unranked gate${unrankedGateVars.length === 1 ? "" : "s"}. It ` +
      `fires and reaches the prompt (inc.147 made sure of that), but it is placed last by default ` +
      `and the precedence line says so — nobody decided what it beats.`,
  );
  console.error(
    `Fix: add it to \`GATE_ORDER\` in lib/integrity/driverPrefixes.ts with the ONE sentence saying ` +
      `why it sits where it sits. The env var name is derived from the key (\`clockGate\` → ` +
      `\`DRIVER_CLOCK_GATE\`), so ranking it is the whole change.`,
  );
}

// One exit for both gate defects, after both have had their say. The unranked block used to own
// `process.exit(4)` inline, which would have made a stranded-only run exit 0 while printing its
// own failure — a report that contradicts its exit code is the exact shape of defect this file
// exists to catch (Q84 inc.149).
// Q84 inc.150 — printed last for the same reason it is appended last to the brief: the two above
// are defects in what the wrapper DOES, this is a defect in what it can TELL you when something
// else goes wrong. Same exit 4 — the action is the same trip into the same file.
if (silencedComposers.length > 0) {
  for (const v of silencedComposers) {
    console.error(
      `\n\u2716 ${v.script}:${v.line}  runs the prompt composer with \`2>/dev/null\` — the fallback to ` +
        `concatenation is the only sign it ever failed`,
    );
  }
  console.error(
    `\nA composer that has failed on every tick looks exactly like one that has worked on every ` +
      `tick. The empty-output fallback is correct and should stay — running with an unresolved ` +
      `gate tie beats running with no standing prompt — but the REASON is thrown away with it.`,
  );
  console.error(
    `Fix: capture stderr and write it to the driver log on the failing path only ` +
      `(\`2>"$ERR"\`, then log \`$ERR\` inside the \`[ -z "$PROMPT" ]\` branch), so a healthy tick ` +
      `stays silent and a broken one names itself.`,
  );
}

if (strandedGateVars.length > 0 || unrankedGateVars.length > 0 || silencedComposers.length > 0) {
  process.exit(4);
}

say("✓ every human-readable stamp reaching Rob names its zone");
say(`✓ every DRIVER_* gate the wrappers hand the driver has a rank in GATE_ORDER`);
say(`✓ every ranked gate a wrapper sets actually travels to the driver`);
say(`✓ every wrapper that asks the composer for a prompt keeps its diagnostics`);
process.exit(0);
