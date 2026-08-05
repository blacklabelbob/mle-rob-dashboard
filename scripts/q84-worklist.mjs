#!/usr/bin/env node
/**
 * q84-worklist.mjs — print the reads Q84 still owes, derived from the re-count's measurement.
 *
 * `recount:q84` says WHAT each open archive row is (body-present / container-only /
 * body-empty / unmeasured). This says WHAT TO RUN, in the order it should be run, and why
 * each command is owed. Nothing is read, summarized, or written here — the pages are
 * evidence, and this pass never touches them. It is offline by construction: no Notion key,
 * no network, no clock.
 *
 * Usage:
 *   npm run --silent check:archive -- --json > /tmp/q84-check.json
 *   npm run --silent recount:q84 -- --input /tmp/q84-check.json --json > /tmp/q84-recount.json
 *   npm run --silent worklist:q84 -- --input /tmp/q84-recount.json
 *   npm run --silent worklist:q84 -- --input /tmp/q84-recount.json --json
 *
 * `--silent` is not optional on the producing commands: without it npm prints its own banner
 * onto STDOUT ahead of the JSON and the redirect captures a file no parser will read. The
 * same trap sits in front of every `npm run … --json > file` in this repo.
 */

import { readFileSync } from "node:fs";

import { buildRecoveryWorklist } from "../lib/meetings/recoveryWorklist.ts";

const AS_JSON = process.argv.includes("--json");

function readInput() {
  const flag = process.argv.indexOf("--input");
  if (flag !== -1 && process.argv[flag + 1]) return JSON.parse(readFileSync(process.argv[flag + 1], "utf8"));
  if (!process.stdin.isTTY) {
    const raw = readFileSync(0, "utf8").trim();
    if (raw) return JSON.parse(raw);
  }
  return null;
}

const input = readInput();
if (!Array.isArray(input?.measured)) {
  console.error(
    "No re-count on stdin. Run (--silent matters — npm's banner corrupts the JSON):\n" +
      "  npm run --silent check:archive -- --json > /tmp/q84-check.json\n" +
      "  npm run --silent recount:q84 -- --input /tmp/q84-check.json --json > /tmp/q84-recount.json\n" +
      "  npm run --silent worklist:q84 -- --input /tmp/q84-recount.json",
  );
  process.exit(2);
}

const worklist = buildRecoveryWorklist(input.measured);

if (AS_JSON) {
  console.log(JSON.stringify(worklist, null, 2));
  process.exit(0);
}

const { counts, steps, atMostUnrecoverable } = worklist;
const HEAD = {
  "read-page": "READ — text is on the page; it is unread, not unexplainable",
  "deep-read-page": `RE-READ UNCAPPED — blocks but no text within the walk's depth cap; a container is not an absence`,
  "sweep-by-date": "SWEEP — nothing on the page; check every other database for that day",
  "identify-first": "IDENTIFY — nothing on the page and no date to sweep with",
  "re-measure": "RE-MEASURE — the measurement itself failed; an error is not an empty page",
};

console.log(`\n── Q84 recovery work-list: ${counts.rows} open archive row(s) ──`);
console.log(
  `   ${counts["read-page"]} to read · ${counts["deep-read-page"]} to re-read uncapped · ` +
    `${counts["sweep-by-date"]} to sweep · ${counts["identify-first"]} to identify · ` +
    `${counts["re-measure"]} to re-measure`,
);
console.log(
  `   At most ${atMostUnrecoverable} row(s) could turn out to be unrecoverable — and only ` +
    `after every read above comes back empty. Not a finding.`,
);

let current = "";
for (const step of steps) {
  if (step.action !== current) {
    current = step.action;
    console.log(`\n${HEAD[step.action]}`);
  }
  console.log(`  ${(step.row.day || "NO-DATE").padEnd(10)} ${step.row.title.slice(0, 60)}`);
  console.log(`      why: ${step.why}`);
  if (step.command) console.log(`      run: ${step.command}`);
}

console.log(
  `\nNo page was read or written by this pass. It schedules reads; it does not perform them,\n` +
    `and it never summarizes a meeting it has not read.\n`,
);
