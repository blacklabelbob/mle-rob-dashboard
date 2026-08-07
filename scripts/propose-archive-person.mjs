#!/usr/bin/env node
/**
 * propose-archive-person.mjs — Q85 inc.22. The caller inc.21 left as a dashed edge.
 *
 * inc.21 built `lib/meetings/personFromArchive.ts`, which turns flag #213's word *propose*
 * into a concrete row — or into one of eight named refusals — and it writes nothing, on
 * purpose. It had NO CALLER, so twenty-one increments in, `Joseph Green` still exists only as
 * a sentence in a ledger row. This script is the thing that runs that planner against LIVE
 * prod: the archive's own day, prod's people, prod's verticals, and the two answers only a
 * reviewer can give.
 *
 * READ-ONLY, AND THAT IS A DESIGN DECISION RATHER THAN AN UNFINISHED EDGE. There is no
 * `--apply` here, and adding one blind is the exact defect inc.20 caught: `--apply` shipped in
 * inc.19 against a route contract nobody had exercised, was dead on arrival, and its silence
 * read as success for a full increment. The write this script would make is a `people` INSERT
 * on prod, and its two required inputs — `verticalId` and `referredById` — are questions for
 * Rob that no run of this script can answer for him. A write path that cannot be exercised in
 * the run that ships it is not a feature; it is inc.20 again with a different table. The write
 * is inc.23, and it lands the same day its first real exercise does.
 *
 * WHAT IT WILL NEVER DO, in any mode: create, update or delete any person, org, activity or
 * proposal; PATCH Notion; touch a money, quoted, signed or paid field (those are not fields on
 * `NewArchivePersonRow`, so the compiler agrees); read or set `STORAGE_SOURCE`.
 *
 * WHY THE ARCHIVE JSON IS AN INPUT RATHER THAN A SECOND NOTION READ. `check:archive --json`
 * already carries the rows and the CRM people from one read. Re-reading Notion here would put
 * a second ladder on the same rows and let the two answers drift — the same reasoning
 * `confirm-meeting-company.mjs` runs on, and it takes its input the same way.
 *
 * Usage:
 *   npm run --silent check:archive -- --json > /tmp/q85-check.json
 *   node --import ./scripts/ts-loader.mjs scripts/propose-archive-person.mjs \
 *        --input /tmp/q85-check.json                       # every proposable name + what it still needs
 *   … --input … --name "Joseph Green" --vertical title --referred-by P-1001
 *   … --input … --proposals reviewed.json                  # [{ name, verticalId, referredById }]
 *   … --json                                               # the plans as data
 *
 * `--silent` is not optional on the producing command: without it npm prints its banner onto
 * STDOUT ahead of the JSON and the redirect captures a file no parser will read.
 */

import { readFileSync } from "node:fs";

import { readArchiveAttendees } from "../lib/meetings/archiveAttendees.ts";
import { resolveRowAttendees } from "../lib/meetings/attendeePerson.ts";
import { decidePersonProposal, personProposalText } from "../lib/meetings/personProposal.ts";
import { planPeopleFromArchive } from "../lib/meetings/personFromArchive.ts";

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
}

const INPUT = flag("--input");
const PROPOSALS_FILE = flag("--proposals");

function usage(msg) {
  console.error(`${msg}\n`);
  console.error("  npm run --silent check:archive -- --json > /tmp/q85-check.json");
  console.error("  node --import ./scripts/ts-loader.mjs scripts/propose-archive-person.mjs \\");
  console.error("       --input /tmp/q85-check.json [--name NAME --vertical ID --referred-by P-####]");
  process.exit(2);
}

if (!INPUT) usage("Need --input <check:archive --json output>.");

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(INPUT, "utf8"));
} catch (err) {
  usage(`Could not read ${INPUT}: ${err.message}`);
}

const people = snapshot?.crm?.people ?? [];
if (!Array.isArray(people) || people.length === 0) {
  usage(`${INPUT} carries no CRM people — is it the output of \`check:archive --json\`?`);
}

/* ── env ─────────────────────────────────────────────────────────────────────────────── */

function readEnvLocal() {
  const out = {};
  let raw = "";
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || "";
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  usage("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env or .env.local to read the vertical list.");
}

/**
 * The verticals a reviewer may pick from, read from the SAME database the row would land in.
 * Hard-coding this list is how `unknown-vertical` becomes a lie: the planner would accept a
 * vertical Postgres then refuses on the NOT NULL FK, and the refusal a human reads would be a
 * 500 instead of a sentence.
 */
async function readVerticals() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/verticals?select=id,name&order=id`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

/* ── the decisions, rebuilt from the same snapshot the check printed ──────────────────── */

/**
 * Every proposable attendee, with the day of the meeting they were on.
 *
 * The day is the ROW'S, never today's — a "met" date invented at proposal time would put a
 * wrong first-contact on a record that outlives the reason anyone remembers it. A row with no
 * day is carried anyway and the planner refuses it by name (`met-required`); dropping it here
 * would make a blocked name look like a name nobody owed.
 */
function proposableFromSnapshot() {
  const found = new Map();
  for (const row of snapshot.archiveOnly ?? []) {
    const resolved = resolveRowAttendees(readArchiveAttendees(row), people, null);
    for (const resolution of resolved.resolutions) {
      const decision = decidePersonProposal(resolution, people);
      if (!decision) continue;
      const seen = found.get(decision.name);
      // One name can be on several rows. Keep the EARLIEST dated one: the first meeting a
      // person appears on is the earliest contact this archive can evidence, and a later row
      // would overstate how long they have been unknown.
      if (!seen) found.set(decision.name, { decision, dayISO: row.day || "" });
      else if (row.day && (!seen.dayISO || row.day < seen.dayISO)) seen.dayISO = row.day;
    }
  }
  return [...found.values()];
}

/* ── the reviewer's answers ───────────────────────────────────────────────────────────── */

function readReviewed() {
  const byName = new Map();
  if (PROPOSALS_FILE) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(PROPOSALS_FILE, "utf8"));
    } catch (err) {
      usage(`Could not read ${PROPOSALS_FILE}: ${err.message}`);
    }
    if (!Array.isArray(parsed)) usage(`${PROPOSALS_FILE} must be an array of { name, verticalId, referredById }.`);
    for (const entry of parsed) {
      if (!entry?.name) usage(`${PROPOSALS_FILE} has an entry with no name.`);
      byName.set(String(entry.name), {
        verticalId: entry.verticalId ?? "",
        referredById: entry.referredById ?? "",
      });
    }
  }
  const name = flag("--name");
  if (name) {
    byName.set(name, { verticalId: flag("--vertical"), referredById: flag("--referred-by") });
  }
  return byName;
}

/* ── run ──────────────────────────────────────────────────────────────────────────────── */

const verticals = await readVerticals();
const verticalIds = verticals.map((v) => v.id);
const reviewed = readReviewed();
const proposable = proposableFromSnapshot();

// One call, never one per name: inc.21 MEASURED what planning them separately does —
// `nextPersonId` asked twice about one snapshot answered `P-1023` twice, and approving both
// would have inserted the second over the first. `planPeopleFromArchive` threads the reserved
// set. The day is per name, so the planner is asked per day and the reserved set is threaded
// by grouping — a single shared day would date one of them wrong.
const plans = [];
for (const { decision, dayISO } of proposable) {
  const [plan] = planPeopleFromArchive(
    [decision],
    (d) => reviewed.get(d.name) ?? {},
    // Everything already planned this run counts as taken, which is what makes the collision
    // impossible across differing days as well as within one.
    people.concat(
      plans
        .filter((p) => p.plan.kind === "create")
        .map((p) => ({ id: p.plan.person.id, name: p.plan.person.name, orgId: "" }))
    ),
    verticalIds,
    dayISO
  );
  plans.push({ name: decision.name, dayISO, decision, plan });
}

if (AS_JSON) {
  console.log(JSON.stringify({ verticals, plans }, null, 2));
  process.exit(0);
}

const creates = plans.filter((p) => p.plan.kind === "create");
console.log(`\n── ${plans.length} name(s) the archive proposes · ${creates.length} planned · read-only, nothing written ──`);
console.log(`   verticals available: ${verticalIds.join(" · ")}`);

for (const { name, dayISO, decision, plan } of plans) {
  console.log(`\n  ${plan.kind === "create" ? "＋" : "⛔"} ${name}${dayISO ? `  (met ${dayISO})` : "  (no date on the row)"}`);
  console.log(`     decision: ${personProposalText(decision)}`);
  if (plan.kind === "refused") {
    console.log(`     refused [${plan.reason}]: ${plan.detail}`);
    if (plan.reason === "vertical-required" || plan.reason === "referrer-required") {
      console.log(
        `     → answer both and re-run: --name "${name}" --vertical <${verticalIds.join("|")}> --referred-by <P-####>`
      );
    }
    continue;
  }
  const row = plan.person;
  console.log(`     would insert: ${row.id} · ${row.name} · ${row.legacySlug} · ${row.verticalId} · ${row.nodeType}/${row.status}`);
  console.log(`     referred by:  ${row.referredById}`);
  console.log(`     notes:        ${row.notes}`);
}

console.log(
  `\n  Nothing above has been written. The insert is inc.23 — it ships with its first real ` +
    `exercise, never before it (inc.20: an unexercised --apply reads as success while being dead).`
);
