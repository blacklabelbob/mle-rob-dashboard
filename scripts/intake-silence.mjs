#!/usr/bin/env node
// The stamp-keeper for meeting intake's elapsed-silence alarm (Q84 inc.135).
//
// WHY THIS IS A REPO SCRIPT AND NOT FOUR LINES IN THE WRAPPER: the wrapper
// (~/.claude/scripts/meeting-intake.sh) lives outside the repo, where nobody diffs it and no test
// runs against it. Q84 inc.4/inc.5 were spent deleting hand-copied second copies of rules from
// exactly that kind of file. So the wrapper stays dumb — it calls this, reads an exit code — and
// every judgement lives in scripts/fireflies-quota.mjs where a test can pin it (CR-3).
//
// It owns three stamps, all under "MLE Internal Meetings/" and all gitignored, because they
// describe THIS machine's runs and mean nothing in another clone.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { silenceState, silenceNotice } from "./fireflies-quota.mjs";

const DIR = join(process.cwd(), "MLE Internal Meetings");
const SUCCESS = join(DIR, ".intake-last-success");
const OBSERVED = join(DIR, ".intake-silent-since");
const ESCALATED = join(DIR, ".intake-last-escalation");

/** Exit code meaning "escalate this — the wrapper should write the red line". Not 1: this script
 *  itself did not fail, and the wrapper must be able to tell those apart. */
const EXIT_ESCALATE = 10;

const readStamp = (p) => {
  if (!existsSync(p)) return null;
  const n = Number(String(readFileSync(p, "utf8")).trim());
  // A corrupt stamp is treated as absent rather than as a huge or negative elapsed time — the
  // failure mode to avoid is a garbled file inventing a silence that never happened.
  return Number.isFinite(n) && n > 0 ? n : null;
};
const writeStamp = (p, v) => writeFileSync(p, `${v}\n`);

const mode = process.argv[2];
const outcome = (process.argv[3] ?? "DOWNGRADED").toUpperCase();
const now = Date.now();

if (mode === "record-success") {
  // A run that actually pulled ends the silence outright: both the observation mark and the
  // escalation mark are cleared by being superseded, so the next quiet stretch starts from zero.
  writeStamp(SUCCESS, now);
  process.exit(0);
}

if (mode !== "check") {
  console.error("usage: intake-silence.mjs <record-success|check> [OFFLINE|QUOTA]");
  process.exit(64); // EX_USAGE
}

const lastSuccess = readStamp(SUCCESS);
const lastEscalated = readStamp(ESCALATED);
let firstObserved = readStamp(OBSERVED);

// Only meaningful when no success was ever recorded: start the clock at first sight of trouble
// rather than pretending a pull happened. Once written it must NOT be refreshed on later runs —
// refreshing it would reset the silence clock on every beat and guarantee no escalation ever.
if (lastSuccess == null && firstObserved == null) {
  writeStamp(OBSERVED, now);
  firstObserved = now;
}

const verdict = silenceState({ lastSuccess, lastEscalated, firstObserved, now });

if (!verdict.escalate) {
  console.log(`silence: ${verdict.reason}${verdict.hoursQuiet == null ? "" : ` (~${verdict.hoursQuiet}h quiet)`}`);
  process.exit(0);
}

writeStamp(ESCALATED, now);
console.log(silenceNotice({ hoursQuiet: verdict.hoursQuiet, since: verdict.since, outcome, everSucceeded: lastSuccess != null }));
process.exit(EXIT_ESCALATE);
