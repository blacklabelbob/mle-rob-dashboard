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

import { existsSync, readFileSync } from "node:fs";

import { buildRecoveryWorklist, parseReadLogPageIds } from "../lib/meetings/recoveryWorklist.ts";

const AS_JSON = process.argv.includes("--json");

/**
 * The log of pages that have ACTUALLY been opened. Without it this pass re-schedules finished
 * reads — which is what it was doing: six of the rows it printed as "to read" had been read
 * and filed days earlier, and the top of the list was a page whose transcript is already on
 * disk. A work-list that reopens finished work is the hand-maintenance Q84 exists to retire.
 */
const READ_LOG = new URL("../docs/research/Q84-READ-LOG-2026-08-05.md", import.meta.url);

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

// A missing read log means "nothing has been read yet", never "skip the check silently":
// the absence is printed below so a moved file cannot masquerade as an empty log.
const readLogFound = existsSync(READ_LOG);
const alreadyRead = readLogFound ? parseReadLogPageIds(readFileSync(READ_LOG, "utf8")) : [];

const worklist = buildRecoveryWorklist(input.measured, { alreadyRead });

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
  "already-read": "ALREADY READ — opened and filed in the read log; listed, not hidden",
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
console.log(
  readLogFound
    ? `   ${counts["already-read"]} row(s) are already read and filed in the read log ` +
        `(${counts["already-read"]} of ${counts.rows}); they are listed at the bottom, not dropped.`
    : `   ⚠ No read log at ${READ_LOG.pathname} — every row below is scheduled as UNREAD. ` +
        `If reads have happened, this list is wrong and the log is what is missing.`,
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
