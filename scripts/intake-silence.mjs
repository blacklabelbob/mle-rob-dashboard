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

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { silenceState, silenceNotice, silenceFlag, mergeSilenceQueue } from "./fireflies-quota.mjs";

const DIR = join(process.cwd(), "MLE Internal Meetings");
const SUCCESS = join(DIR, ".intake-last-success");
const OBSERVED = join(DIR, ".intake-silent-since");
const ESCALATED = join(DIR, ".intake-last-escalation");
/** An escalation that has not reached the ledger yet. See flushFlag() below for why a QUEUE and
 *  not a POST at the moment of escalation. */
const PENDING = join(DIR, ".intake-flag-pending");

const FLAGS_BASE = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");

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

/**
 * Deliver a queued escalation to the ledger, if there is one (Q84 inc.136).
 *
 * WHY A QUEUE AND NOT A POST AT THE MOMENT OF ESCALATION — this is the whole shape of the
 * increment: the commonest escalation is OFFLINE, and an OFFLINE escalation CANNOT be posted,
 * because the condition it reports is "this machine has no network". Posting inline would mean
 * the alarm is delivered in exactly the cases it is least needed and dropped in the case it was
 * built for. So the finding is written to disk the instant it is decided, and every later run —
 * including the successful one that ends the silence — tries to hand it over.
 *
 * IT IS STILL DELIVERED AFTER THE SILENCE HEALS, DELIBERATELY. A pipeline that was dark for eight
 * hours and then recovered is precisely the failure Rob would otherwise never learn about; the
 * notice carries the window it describes, so a row arriving late reads as history, not as a
 * false live alarm. Withdrawing it on recovery would rebuild the mute button inc.135 deleted.
 *
 * Never fatal, never changes an exit code: a ledger that is down must not turn the silence alarm
 * into a second failure, and the queue file surviving means the next beat retries.
 */
/** Read the queue as its merged state, or null. A v1 file (a bare finding, written before Q84
 *  inc.137) is NOT parsed as state — it is delivered as-is by flushFlag and never merged into,
 *  because its args were never stored and inventing them would fabricate a window. */
function readQueue() {
  if (!existsSync(PENDING)) return null;
  try {
    const parsed = JSON.parse(readFileSync(PENDING, "utf8"));
    return parsed && typeof parsed === "object" && parsed.args ? parsed : null;
  } catch {
    return null;
  }
}

async function flushFlag() {
  if (!existsSync(PENDING)) return;
  let finding;
  try {
    const parsed = JSON.parse(readFileSync(PENDING, "utf8"));
    // v2 stores the ARGS and derives the finding here, so there is one derivation path and the
    // detail can never disagree with the history it is supposed to carry. A v1 file holds the
    // finding itself; post it unchanged rather than guess at what produced it.
    finding = parsed?.args
      ? silenceFlag(parsed.args, { escalations: parsed.escalations, priorWindows: parsed.priorWindows })
      : parsed;
  } catch {
    // A garbled queue file can never become a ledger row; drop it rather than retry forever.
    rmSync(PENDING, { force: true });
    console.log("silence: discarded an unreadable pending finding");
    return;
  }
  try {
    const res = await fetch(`${FLAGS_BASE}/api/admin/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finding),
    });
    if (!res.ok) {
      console.log(`silence: ledger write deferred (${res.status}) — finding stays queued`);
      return;
    }
    rmSync(PENDING, { force: true });
    console.log("silence: escalation filed to Things to Address");
  } catch (err) {
    console.log(`silence: ledger unreachable (${err?.message ?? err}) — finding stays queued`);
  }
}

const mode = process.argv[2];
const outcome = (process.argv[3] ?? "DOWNGRADED").toUpperCase();
const now = Date.now();

if (mode === "record-success") {
  // A run that actually pulled ends the silence outright: both the observation mark and the
  // escalation mark are cleared by being superseded, so the next quiet stretch starts from zero.
  writeStamp(SUCCESS, now);
  // This is the run that PROVES the network is up, so it is the best chance an offline-born
  // escalation will ever get to reach the ledger.
  await flushFlag();
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
  // A quiet run still carries the queue forward: the escalation may have been decided hours ago
  // on a machine that had no network, and this beat may be the first one that does.
  await flushFlag();
  console.log(`silence: ${verdict.reason}${verdict.hoursQuiet == null ? "" : ` (~${verdict.hoursQuiet}h quiet)`}`);
  process.exit(0);
}

writeStamp(ESCALATED, now);
const args = { hoursQuiet: verdict.hoursQuiet, since: verdict.since, outcome, everSucceeded: lastSuccess != null };
// Queued BEFORE the delivery attempt, not after it: the point of failure this guards against is
// the process dying or the network being down mid-post, and a finding that exists only in a
// variable at that moment is a finding nobody ever sees.
//
// MERGED, not overwritten (Q84 inc.137): a second escalation for the SAME window supersedes and
// bumps the count, but one for a DIFFERENT window would otherwise delete the only record of an
// earlier dark stretch that never reached the ledger.
writeFileSync(PENDING, `${JSON.stringify(mergeSilenceQueue(readQueue(), args))}\n`);
await flushFlag();
console.log(silenceNotice(args));
process.exit(EXIT_ESCALATE);
