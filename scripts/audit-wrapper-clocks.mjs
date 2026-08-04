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

import { access, constants, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  auditWrapperClocks,
  censusDepartures,
  classifyCensusRead,
  clockGateBrief,
  departureFindings,
  departureKey,
  reconcileOpenDepartures,
  unreadableCarriedField,
  wrapperCensus,
  BRIEF_MARKER,
  REPO_STAMP_CALL,
  TRIGGER_CALLS,
} from "../lib/integrity/wrapperClock.ts";
import { ledgerReadPlan, ledgerReadUrl } from "../lib/flags/ledgerRead.ts";

const DEFAULT_DIR = path.join(os.homedir(), ".claude", "scripts");
const CENSUS_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "integrity",
  "wrapper-census.json",
);
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
    // The exec bit is carried for the census, not for the verdict: a `*.sh` is collected either
    // way, but for every other language it is the whole reason the file is here at all, so losing
    // it is a silent end to that wrapper's coverage (Q84 inc.158).
    let executable = true;
    try {
      await access(file, constants.X_OK);
    } catch {
      executable = false;
    }
    scripts.push({ name: path.basename(file), source: await readFile(file, "utf8"), executable });
  }
}

const audit = auditWrapperClocks(scripts, unjudged);

/**
 * Q84 inc.158 — write the census BEFORE any verdict block, because every one of them exits.
 *
 * Written on every default-directory run rather than behind a flag: the driver's tick is the only
 * thing that runs this gate, it runs `--brief`, and it commits its increment — so the census lands
 * in a diff at the cadence the wrappers actually change. Behind a flag it would be as unenforced
 * as the two shell comments inc.142 deleted.
 *
 * Only for the default directory. A human pointing this at one file or a scratch copy would
 * otherwise overwrite the committed record of the real machine with a partial one, which is a
 * worse lie than having no record.
 */
async function writeCensus() {
  if (targets.length !== 1 || targets[0] !== DEFAULT_DIR)
    return { departures: [], corrections: [], censusRefusal: null };
  const census = wrapperCensus(audit, scripts);
  // Q84 inc.159 — read the committed record BEFORE overwriting it. inc.158 left the census in git
  // but nothing reading it, so a wrapper could still leave the scanned set with a diff no human is
  // required to notice, and every count here would stay green because every count is derived from
  // what was found. An unreadable or malformed file is treated as "no previous record" rather than
  // as a mass departure: the failure mode of a bad parse must not be 33 false findings.
  //
  // Q84 inc.174 — and "could not read it" no longer means "there was nothing there". The three
  // outcomes are separated (`classifyCensusRead`, tested in the repo under test) because a PRESENT
  // file this gate cannot parse is the only record of what it has published to Rob's ledger, and
  // the write below would replace it with a census carrying zero `openDepartures` — dropping every
  // key it is still correcting, in the same tick, with nothing said. So a corrupt census is not
  // overwritten: the run reports it and leaves the bytes exactly as found, which is inc.170/173's
  // disposition for an unreadable row applied to an unreadable file.
  let read;
  try {
    read = classifyCensusRead({ missing: false, text: await readFile(CENSUS_FILE, "utf8") });
  } catch (err) {
    read =
      err.code === "ENOENT"
        ? classifyCensusRead({ missing: true, text: null })
        : { disposition: "corrupt", census: null, reason: `it could not be opened (${err.code ?? err.message})` };
  }
  if (read.disposition === "corrupt") {
    console.error(
      `→ census: REFUSING TO WRITE — ${CENSUS_FILE} is present but unreadable: ${read.reason}. It is ` +
        `left exactly as found and NOTHING is filed this tick, because overwriting it would drop ` +
        `every departure row this gate is still correcting on Rob's ledger, permanently and ` +
        `silently (Q84 inc.174). Repair the file by hand, or delete it to start a fresh record ` +
        `and accept that the open rows are gone. Repeats every tick until then.`,
    );
    // Q84 inc.175 — the reason travels to `--brief` as well as to stderr. The driver filters this
    // gate's output with `grep '^CLOCK GATE'`, so on its own this line reaches no prompt and the
    // only reader that acts is handed a clean verdict from a gate that is knowingly tracking none
    // of Rob's open rows.
    return { departures: [], corrections: [], censusRefusal: read.reason };
  }
  const previous = read.census;
  const departures = censusDepartures(previous, census);
  // Q84 inc.162 — carry the rows this gate has already filed, and re-measure the one claim in them
  // that can go stale (who runs this gate now) against today's tree. A census written before
  // inc.162 has no such list, which reads as "none recorded": nothing is corrected until a
  // departure files a key the gate can vouch for having written.
  const previousOpen = Array.isArray(previous?.openDepartures) ? previous.openDepartures : [];
  // Q84 inc.163/164 — the ONE piece of evidence on which a recorded key stops being corrected is Rob
  // closing the row himself, read from the ledger. Best effort, and it fails toward CHANGING
  // NOTHING: an unreachable ledger returns null, which neither closes a row nor reopens one. Never a
  // timer, never a cap, never a name returning. The read now also catches the inverse — he can
  // reopen the same key — which is why a closed row keeps this list non-empty and keeps being read.
  // inc.165 — both sides of the read travel: closing needs the key SEEN resolved, reopening needs it
  // SEEN open. A key the read never mentioned (a short or filtered response) moves nothing.
  const ledger = previousOpen.length
    ? await resolvedDepartureKeys(previousOpen.map((row) => departureKey(row.name)))
    : null;
  const { corrections, open, closed, reopened, withheld, unreadableClaims } = reconcileOpenDepartures(
    previousOpen,
    departures,
    audit.triggeredBy,
    ledger?.resolved ?? null,
    ledger?.open ?? null,
  );
  await writeFile(CENSUS_FILE, `${JSON.stringify({ ...census, openDepartures: open }, null, 2)}\n`);
  for (const row of closed) {
    console.error(`→ census: ${row.name} no longer corrected — you resolved ${departureKey(row.name)} in the ledger`);
  }
  for (const row of reopened) {
    console.error(`→ census: ${row.name} corrected again — you reopened ${departureKey(row.name)} in the ledger`);
  }
  // Q84 inc.170 — a withheld correction is never silent here. The row on Rob's page says the claim
  // is not being re-checked; this says which claim, on which tick, so the withholding is auditable.
  // inc.171 — and it says that it will keep saying it: withholding is re-derived every tick from the
  // frozen claim and the current tree, not recorded once, so a missed tick loses nothing.
  for (const row of withheld) {
    console.error(
      `→ census: ${row.name} enforcement claim changed and was NOT re-filed — ${departureKey(row.name)} ` +
        `cannot be read back by the ledger query, so the gate cannot tell an edit from a re-insert ` +
        `(Q84 inc.170). This line repeats every tick until the claim matches again or you close the row.`,
    );
  }
  // Q84 inc.172 — a census row carrying no readable enforcement claim. Said out loud because the
  // gate deliberately does NOT repair it: measuring the claim now and writing it back would record
  // as published a state that was never published. Nothing is corrected on this key until the census
  // row is fixed by hand or the row is closed on the ledger; this line repeats until then.
  // inc.173 — the field is NAMED, and it is no longer only `orphaned`: `closed` corrupts silently
  // (a truthy non-boolean freezes a row Rob never closed) and `name` becomes the ledger key itself.
  // A reader who is told "unreadable" without being told which field cannot repair the census.
  for (const row of unreadableClaims) {
    const field = unreadableCarriedField(row);
    console.error(
      `→ census: row ${JSON.stringify(row.name)} is unreadable history — \`${field}\` is ` +
        `${JSON.stringify(row[field])}, not the shape it was written in. The row is kept exactly as ` +
        `found and NOT repaired, and NO correction is filed on it, because the gate will not publish ` +
        `a row it cannot read back (Q84 inc.172/173). Repeats every tick until the census is repaired.`,
    );
  }
  return { departures, corrections, censusRefusal: null };
}

/**
 * Q84 inc.163 — which departure rows Rob has already resolved. Returns `null` when the ledger could
 * not be read, and the difference matters: `[]` means "read it, he has closed none", `null` means
 * "did not read it", and only the first may drop anything. A key the ledger has never heard of is
 * NOT resolved — absent is not closed, so it is simply not returned here and stays tracked.
 *
 * Q84 inc.165 — and the OPEN keys travel with them, because absence is not a reopen either. This
 * read can come back short (PostgREST's max-rows cap as the ledger grows, a filtered base URL) and a
 * missing row is indistinguishable from a row that was never filed. Reporting only `resolved` made
 * the reconciler read that silence as "Rob reopened it" and re-POST a row he closed.
 *
 * Q84 inc.166 — and it now asks for ONLY the keys it tracks, which is what removes the growth
 * cliff rather than tolerating it. Measured first: prod holds 144 flag rows and this route
 * returned all 144, so nothing truncates today; the cap that would truncate it later is a server
 * setting unreadable from here. A read bounded by this gate's own key list cannot reach it at any
 * ledger size. A deployment predating the `keys` param ignores it and answers with the whole
 * ledger — a superset, handled identically. inc.165's rule is untouched: absence still moves
 * nothing in either direction.
 */
async function resolvedDepartureKeys(keys = []) {
  const base = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");
  // Q84 inc.167 — THE UN-NARROWED READ IS NEVER IMPLICIT HERE. `ledgerReadUrl` widens on an empty
  // key list on purpose (a malformed narrow must never mean "match nothing"), which means a caller
  // that FORGETS its keys gets the whole ledger and no sign that it did. This gate refuses that
  // read outright rather than narrowing it, because at this call site an empty list does not mean
  // "ask about everything" — it means there is nothing to ask about, and `null` is already the
  // answer that moves nothing in either direction (inc.163/165). The sentence is the point: a
  // future caller that loses its keys says so on stderr instead of quietly reading 144 rows.
  const plan = ledgerReadPlan(keys);
  // Q84 inc.168 — a key the transport would not hand back unchanged is never sent. The comma is
  // both this param's separator and a legal character in a filename, and percent-encoding does not
  // save it: the route decodes before it splits. Sent anyway, the gate would be answered about two
  // keys it never filed while the real one reads as absent — and absence is silent by design
  // (inc.165), so the row would go uncorrected forever with no line saying why. Dropped, it behaves
  // exactly like an unread ledger for that key alone, and this sentence is the record.
  for (const key of plan.unaskable) {
    console.error(`→ ledger: NOT asked about ${key} — this key cannot survive the query the route parses back`);
  }
  if (!plan.narrowed) {
    console.error("→ ledger: not read — this gate asked about no keys, and a whole-ledger read is never implicit");
    return null;
  }
  console.error(`→ ledger: asked about ${plan.keys.length} key(s) this gate filed — ${plan.keys.join(", ")}`);
  try {
    const res = await fetch(ledgerReadUrl(base, plan.keys), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { flags } = await res.json();
    if (!Array.isArray(flags)) return null;
    // A key is closed only when the ledger holds a resolved row for it AND no open one. A
    // superseded twin sits resolved next to a live row on the same key (`supersededNote`), and
    // reading that as "closed" would drop a row still sitting on Rob's page.
    const open = new Set(
      flags.filter((f) => f?.status === "open" && typeof f?.dedupe_key === "string").map((f) => f.dedupe_key),
    );
    return {
      resolved: [
        ...new Set(
          flags
            .filter((f) => f?.status === "resolved" && typeof f?.dedupe_key === "string" && !open.has(f.dedupe_key))
            .map((f) => f.dedupe_key),
        ),
      ],
      open: [...open],
    };
  } catch {
    return null;
  }
}

/**
 * Q84 inc.160 — the departure that was `judged` or ran this gate gets a durable row, per the
 * FINDINGS PROTOCOL. `departureFindings()` decides WHICH and WHAT; this decides what it costs.
 *
 * Runs on BOTH paths and before the `--brief` exit, because `--brief` is the only path the driver
 * takes — filing after that branch would be filing for nobody.
 *
 * BEST EFFORT, AND NEVER THE GATE'S EXIT CODE. The stderr sentence is the enforcement and it has
 * already been decided; the ledger row is durability on top of it. This gate runs on a laptop, in
 * a CI runner with no network, and on a tick where Vercel is down, and in all three the honest
 * outcome is "the loss was reported, the row was not written" — not a green run turned red by an
 * unrelated outage, and not a departure swallowed because a POST failed. A failed write says so on
 * stderr, next to the finding it belongs to.
 *
 * NOT SKIPPED WHEN `SKIP_FLAGS` IS SET — there is no such switch, on purpose. An opt-in would be
 * unset on every tick that matters, which is exactly how inc.158's census sat unread.
 */
async function fileDepartures(list, corrections = []) {
  // Q84 inc.161: the same tick already knows who still runs this gate, so the row states it
  // instead of guessing "if it was the last one".
  // Q84 inc.162: corrections ride the same path deliberately — a correction is worth exactly what a
  // departure is worth, costs the exit code exactly as little, and says so on stderr the same way.
  const findings = [...departureFindings(list, audit.triggeredBy), ...corrections];
  if (findings.length === 0) return;
  const base = (process.env.FLAGS_BASE_URL || "https://mle-rob-dashboard.vercel.app").replace(/\/$/, "");
  for (const finding of findings) {
    try {
      const res = await fetch(`${base}/api/admin/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finding),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.text();
      if (!res.ok) {
        console.error(`✖ ledger write FAILED ${res.status} for ${finding.dedupeKey}: ${body.slice(0, 200)}`);
        continue;
      }
      const json = JSON.parse(body);
      console.error(`→ ledger ${json.action} [${finding.dedupeKey}] — ${json.reason ?? "filed"}`);
    } catch (err) {
      console.error(
        `✖ ledger write UNREACHABLE for ${finding.dedupeKey}: ${err.message}. The departure is ` +
          `reported below and this run is the only one that can report it — copy it somewhere.`,
      );
    }
  }
}
const { findings, usesRepoStamp, skipped, triggeredBy, unrankedGateVars, strandedGateVars } = audit;
const { silencedComposers } = audit;
const scanned = scripts.length - skipped.length;

// --brief has exactly one job: hand the driver the sentence the next increment will read. The
// sentence and its exit code are decided in the repo under test (Q84 inc.144), so this file does
// not get to reword the enforcement it is delivering.
// Never on a zero-wrapper scan: that outcome is "the rule was not checked", and overwriting the
// committed record with an empty one would turn a scan that saw nothing into a repo that says
// there is nothing to see.
const { departures, corrections, censusRefusal } =
  scripts.length > 0 ? await writeCensus() : { departures: [], corrections: [], censusRefusal: null };
await fileDepartures(departures, corrections);

if (BRIEF) {
  const { code, line } = clockGateBrief(audit, departures, censusRefusal);
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

// Q84 inc.159 — the only finding here about a wrapper that is NOT in the scan. Printed last and
// exiting 4 with its siblings, but it is the one that cannot be re-derived by looking harder at
// this run: the census has already been rewritten, so the next tick's comparison is against a set
// that no longer contains it, and this is the single run in which it is knowable.
if (departures.length > 0) {
  for (const d of departures) {
    console.error(
      `\n✖ ${d.name}  in the last census, absent from this scan — was ${d.wasRole}` +
        `${d.wasTrigger ? ", and it ran this gate" : ""}` +
        `${d.wasRepoStamp ? ", and it asked the repo for its stamp" : ""}`,
    );
  }
  console.error(
    `\n${departures.length} wrapper${departures.length === 1 ? "" : "s"} left the scanned set. ` +
      `Deleted, renamed, or stripped of the exec bit that got ${departures.length === 1 ? "it" : "them"} ` +
      `collected — from here those are indistinguishable, so this gate names the loss and not a ` +
      `cause. Every count above is derived from what was found, which is why nothing else moved.`,
  );
  console.error(
    `Fix: confirm it was intended (and this line is the record of it), or restore the file. ` +
      `\`git diff docs/integrity/wrapper-census.json\` shows the row that left.`,
  );
}

if (
  strandedGateVars.length > 0 ||
  unrankedGateVars.length > 0 ||
  silencedComposers.length > 0 ||
  audit.unjudged.length > 0 ||
  departures.length > 0
) {
  process.exit(4);
}

say("✓ every human-readable stamp reaching Rob names its zone");
say(`✓ every DRIVER_* gate the wrappers hand the driver has a rank in GATE_ORDER`);
say(`✓ every ranked gate a wrapper sets actually travels to the driver`);
say(`✓ every wrapper that asks the composer for a prompt keeps its diagnostics`);
process.exit(0);
