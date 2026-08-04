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
//   2  nothing was checked — the wrapper directory could not be read, or it yielded 0 wrappers
//      (Q84 inc.154). One code for both because the reader's action is the same: find the
//      wrappers. A silent skip in either shape would read as "clean".
//   3  clean, but NO wrapper runs this gate — the rule is unenforced (Q84 inc.143)
//   4  clean and wired, but something the report cannot let pass as ✓: an unranked or stranded
//      `DRIVER_*` gate (inc.148/149), a composer whose stderr is discarded (inc.150), or an
//      executable sibling this gate never opened (inc.155). One code for all four because the
//      driver acts on the SENTENCE and never reads the number.
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

import { access, constants, readdir, readFile, stat } from "node:fs/promises";
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

/**
 * Expand a directory to every file that RUNS — not to `*.sh` (Q84 inc.155, inc.156).
 *
 * A file qualifies if it is executable and opens with a shebang, or ends in `.sh`. That is the
 * test for "this file is run", and it is what inc.155 was missing: `judge-cover.py` and
 * `project-tracker.py` are programs on the same timers writing into the same files, and
 * `daily-driver.sh.bak-2026-07-17` is shell that no extension test matches while still carrying
 * its exec bit — one stray invocation from running. The two prompt `.txt` files next to the real
 * wrappers are data, have no exec bit, and stay out.
 *
 * Which LANGUAGE each one is gets decided in the repo under test, from the shebang, and a file
 * whose language has no reader comes back named in `unjudged` rather than counted clean.
 */
async function collect(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return [target];
  const entries = await readdir(target);
  const files = [];
  for (const entry of entries) {
    const full = path.join(target, entry);
    if (entry.endsWith(".sh")) {
      files.push(full);
      continue;
    }
    try {
      if (!(await stat(full)).isFile()) continue;
      await access(full, constants.X_OK);
      if ((await readFile(full, "utf8")).startsWith("#!")) files.push(full);
    } catch {
      // Unreadable or not executable — not something this machine runs on a timer.
    }
  }
  return files;
}

const scripts = [];
const unjudged = [];
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

const audit = auditWrapperClocks(scripts, unjudged);
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

// Q84 inc.154 — before any verdict, because a zero-wrapper scan has no verdict to give. It does
// not currently print four ✓ (`triggeredBy` is empty too, so it falls to exit 3), but exit 3 tells
// the reader to re-wire a driver tick that is already wired, and the wrapper it names is the one
// the scan never saw. Same exit code as an unreadable directory, and for the same reason: the
// outcome is "the rule was not checked this tick", not "a wrapper is wrong".
if (scripts.length === 0) {
  console.error(
    `✖ ${targets.join(", ")}: 0 wrappers. Nothing was judged — this is NOT a clean run and NOT a ` +
      `missing trigger; the path holds no .sh files. Point the gate at the wrappers, or find out ` +
      `where they went (Q84 inc.154).`,
  );
  process.exit(2);
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

// Q84 inc.153 — printed FIRST and exits, because it is the only finding that says the report you
// are reading is wrong rather than that a wrapper is. Everything below judges `codeLines` output,
// and for a swallowed file that output is blank lines, which pass every check silently.
if (audit.unreadable.length > 0) {
  for (const u of audit.unreadable) {
    const opener = u.kind === "triple-quote" ? "triple-quoted string" : "heredoc";
    console.error(`\n✖ ${u.script}:${u.line}  opens ${opener} \`${u.word}\` — no terminator`);
    console.error(`  every line below it read as body; NOTHING in this file was judged.`);
    console.error(
      u.kind === "triple-quote"
        ? `  fix: close it with \`${u.word}\` — until then this file does not parse as Python either.`
        : `  fix: the delimiter shell is waiting for is \`${u.word}\`, alone on its own line.`,
    );
  }
  console.error(
    `\n  ${audit.unreadable.length} wrapper${audit.unreadable.length === 1 ? " was" : "s were"} ` +
      `not read. No ✓ below applies to ${audit.unreadable.length === 1 ? "it" : "them"}.`,
  );
  process.exit(1);
}

if (findings.length > 0) {
  for (const f of findings) {
    console.error(`\n✖ ${f.script}:${f.line}  writes an unlabeled clock`);
    console.error(
      f.note
        ? `    format:  '${f.format}'  — ${f.note}`
        : `    format:  '+${f.format}'  — no %Z, so the instant is not recoverable`,
    );
    console.error(`    reaches: ${f.surfaces.join(", ")}`);
  }
  console.error(
    `\n${findings.length} private clock${findings.length === 1 ? "" : "s"}. Rob reads these files; ` +
      `a stamp that does not say whose clock produced it hands him arithmetic at the moment he is ` +
      `being told something is broken (Q84 inc.139).`,
  );
  if (findings.some((f) => f.script.endsWith(".sh") || !f.script.endsWith(".py"))) {
    console.error(
      `Fix (shell): ask the repo — REPO_STAMP="$(cd <repo> && node scripts/${REPO_STAMP_CALL})" — ` +
        `and keep \`date '+%Y-%m-%d %H:%M:%S %Z'\` only as the fallback for when node or the repo ` +
        `is unusable.`,
    );
  }
  // Q84 inc.156 — a Python author handed the shell fix will not act on it, and the shell fix is
  // not even correct there: appending %Z to a naive datetime prints nothing at all.
  if (findings.some((f) => f.script.endsWith(".py"))) {
    console.error(
      `Fix (python): make the clock aware first — \`datetime.now().astimezone()\` — THEN add %Z to ` +
        `the format. %Z on a naive datetime renders the empty string, so the format-only fix looks ` +
        `applied and changes nothing.`,
    );
  }
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

// Q84 inc.155 — last, and about the report itself rather than any wrapper in it: the four ✓ below
// are scoped to `*.sh`, and this names what that scope left out. Same exit 4 as its three
// siblings — the action is one trip into the same directory — because a fifth code would imply a
// distinction the driver acts on, and it acts only on the sentence (inc.154's own reasoning).
if (audit.unjudged.length > 0) {
  for (const f of audit.unjudged) {
    console.error(`\n✖ ${f}  executable, shebanged, and never opened — this gate reads *.sh only`);
  }
  console.error(
    `\n${audit.unjudged.length} sibling${audit.unjudged.length === 1 ? "" : "s"} not judged. They ` +
      `run on the same machine, on the same timers, into the same files Rob reads — the ✓ lines ` +
      `below do not cover them, and until now nothing said so.`,
  );
  console.error(
    `Fix: teach this audit that language (the finding detector reads \`date '+FMT'\`, which is ` +
      `shell), or confirm the file is not a wrapper. Measured 2026-08-04: project-tracker.py:88 ` +
      `mints \`%Y-%m-%d %H:%M\` with no zone into PROJECT-TRACKER.md and PROJECT-CHANGELOG.md.`,
  );
}

if (
  strandedGateVars.length > 0 ||
  unrankedGateVars.length > 0 ||
  silencedComposers.length > 0 ||
  audit.unjudged.length > 0
) {
  process.exit(4);
}

say("✓ every human-readable stamp reaching Rob names its zone");
say(`✓ every DRIVER_* gate the wrappers hand the driver has a rank in GATE_ORDER`);
say(`✓ every ranked gate a wrapper sets actually travels to the driver`);
say(`✓ every wrapper that asks the composer for a prompt keeps its diagnostics`);
process.exit(0);
