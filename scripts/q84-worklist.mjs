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

import { existsSync, readdirSync, readFileSync } from "node:fs";

import {
  buildRecoveryWorklist,
  parseArchivedReadPageIds,
  parseExhaustedDeepReadPageIds,
  parseReadLogPageIds,
} from "../lib/meetings/recoveryWorklist.ts";

const AS_JSON = process.argv.includes("--json");

/**
 * The log of pages that have ACTUALLY been opened. Without it this pass re-schedules finished
 * reads — which is what it was doing: six of the rows it printed as "to read" had been read
 * and filed days earlier, and the top of the list was a page whose transcript is already on
 * disk. A work-list that reopens finished work is the hand-maintenance Q84 exists to retire.
 */
const READ_LOG = new URL("../docs/research/Q84-READ-LOG-2026-08-05.md", import.meta.url);

/**
 * The archived dumps themselves — the second, stronger witness that a page was read.
 *
 * The log above is hand-written and therefore skippable, and it WAS skipped: the page this
 * list printed first had been read in full and archived days earlier, with no log entry, into
 * a `MLE Internal Meetings/` directory sitting OUTSIDE this repo. Untracked by git, unseen by
 * the log parser, so the work-list honestly believed it was unread. Reading it again would
 * have cost 28,869 chars to learn nothing.
 *
 * Both sources are consulted and unioned; neither is trusted to be complete on its own.
 */
const READ_ARCHIVE = new URL("../MLE Internal Meetings/archive-reads/", import.meta.url);

/**
 * Header of each dump only — enough for the `id :` line AND the `BODY:` summary block that
 * follows it, without loading whole transcripts (the largest dump on disk is 114k chars).
 *
 * ⚠ The window was 2,000 and that was sized for the `id :` line alone. `find_meeting.py`
 * prints every property before the body summary, so the transcription-wrapper warning that
 * `parseExhaustedDeepReadPageIds` keys on lands at char ~1,725 on today's 30-column schema —
 * inside the old window by 275 characters. One added Notion column would have pushed it out,
 * and the failure mode is silent: the row falls back to `deep-read-page` and is re-scheduled
 * forever, which is the exact defect that detector exists to stop. Widened to 12,000, which
 * clears any plausible schema while still reading none of the transcript.
 */
function archivedReadTexts() {
  if (!existsSync(READ_ARCHIVE)) return [];
  return readdirSync(READ_ARCHIVE)
    .filter((name) => name.endsWith(".deepread.txt"))
    .map((name) => readFileSync(new URL(encodeURIComponent(name), READ_ARCHIVE), "utf8").slice(0, 12000));
}

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
const loggedIds = readLogFound ? parseReadLogPageIds(readFileSync(READ_LOG, "utf8")) : [];
const archivedIds = parseArchivedReadPageIds(archivedReadTexts());
// Union, because each source has already been observed to miss a read the other caught.
const alreadyRead = [...new Set([...loggedIds, ...archivedIds])];
// Proven by the reader's own warning line, so it survives the read log being wrong in either
// direction. Subtracted from `archivedOnly` below: a dump that recovered nothing owes no
// write-up, and printing one would be the "done work reported as owed" lie inc.46 removed.
const deepReadExhausted = parseExhaustedDeepReadPageIds(archivedReadTexts());
const archivedOnly = archivedIds.filter(
  (id) => !loggedIds.includes(id) && !deepReadExhausted.includes(id),
);

const worklist = buildRecoveryWorklist(input.measured, { alreadyRead, deepReadExhausted });

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
  "open-in-notion":
    "OPEN IN NOTION — the uncapped re-read RAN and the API has no more to give; a [transcription] " +
    "wrapper with no text under it is a limit of the reader, never an empty meeting",
  "already-read": "ALREADY READ — opened and filed in the read log; listed, not hidden",
};

console.log(`\n── Q84 recovery work-list: ${counts.rows} open archive row(s) ──`);
console.log(
  `   ${counts["read-page"]} to read · ${counts["deep-read-page"]} to re-read uncapped · ` +
    `${counts["sweep-by-date"]} to sweep · ${counts["identify-first"]} to identify · ` +
    `${counts["re-measure"]} to re-measure · ${counts["open-in-notion"]} to open by hand in Notion`,
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
if (archivedOnly.length) {
  // Not an error — the read is safe either way. It is an owed WRITE-UP, printed so the gap
  // between "we read it" and "we recorded reading it" cannot close silently again.
  console.log(
    `   ⚠ ${archivedOnly.length} read(s) proven by an archived dump but ABSENT from the read log ` +
      `— the dump is on disk, the write-up is owed: ${archivedOnly.join(", ")}`,
  );
}

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
