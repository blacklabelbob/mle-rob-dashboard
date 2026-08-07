#!/usr/bin/env node
/**
 * confirm-meeting-company.mjs — Q85 inc.14. The caller inc.13 left as a dashed edge.
 *
 * inc.13 built `lib/meetings/companyConfirmation.ts`, which decides what a human's
 * "yes, that one" turns into and refuses it six ways. It writes nothing, on purpose, and it
 * had NO CALLER — so flag #215 still named three companies for fifteen blocked meetings and
 * still changed nothing. This is the one thing standing between that plan and the Notion cell.
 *
 * DRY RUN BY DEFAULT. Without `--apply` it prints exactly which `Company Meeting with` cells
 * it would fill, with what text, and every refusal with its reason — and exits 0 having
 * touched nothing. `--apply` is the only mode that PATCHes Notion.
 *
 * WHAT IT WILL NEVER DO, in any mode:
 *   · Write a cell that already holds text. A non-empty cell is `cell-not-empty` in the module
 *     and is refused there; this script has no override for it and must never grow one — a
 *     bulk pass is the worst possible place to overwrite a sentence a human typed.
 *   · Touch any property other than `Company Meeting with`. The PATCH body is built from the
 *     single key, so a widened body cannot happen by accident.
 *   · Write the string a human typed. The text is the CRM's own `org.name`, carried on the
 *     plan by the module. See its header for why: a cell filled with an unmatched name is
 *     blocked with a full cell, which is strictly worse than blocked with an empty one,
 *     because a full cell stops looking like work.
 *   · Create, delete or edit any CRM record, deal, money, quoted, signed or paid field.
 *
 * VERIFY-BEFORE-WRITE. Between the plan and the PATCH, each page is re-read from Notion and
 * its cell must still be empty. The plan is computed from a `check:archive` snapshot that may
 * be minutes or hours old; a human filling that cell by hand in the meantime is exactly the
 * race that would let a bulk pass clobber them. A page whose cell filled since the snapshot is
 * SKIPPED and reported — never overwritten, and never silently.
 *
 * Usage:
 *   npm run --silent check:archive -- --json > /tmp/q85-check.json
 *   node scripts/confirm-meeting-company.mjs --input /tmp/q85-check.json \
 *        --by "Rob Acheson" --confirm <notion-page-id>=<C-####>
 *   … same command with --apply to write.
 *   --confirmations <file.json>  # [{ pageId, orgId, confirmedBy }] instead of --confirm flags
 *   --json                       # the plan as data, for a reviewer or another script
 *
 * `--silent` is not optional on the producing command: without it npm prints its banner onto
 * STDOUT ahead of the JSON and the redirect captures a file no parser will read.
 */

import { readFileSync } from "node:fs";

import { planCompanyConfirmations } from "../lib/meetings/companyConfirmation.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const AS_JSON = args.includes("--json");

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
}

const INPUT = flag("--input");
const CONFIRMED_BY = flag("--by");
const CONFIRMATIONS_FILE = flag("--confirmations");

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
// `NOTION_API_KEY` only, and the API version is a CONSTANT — both exactly as
// `notion-crm-check.mjs` has them. The first draft of this file accepted `NOTION_KEY` as an
// alias and read the version from `NOTION_VERSION`, and the env-manifest gate
// (lib/__tests__/envManifest.test.ts) refused the push: two undocumented names that nothing
// else in the repo sets. An alias for a credential is not a convenience — it is a second
// spelling that can be set, go unread, and leave a script "missing a key" that is right there.
// Removed rather than documented.
const NOTION_KEY = env.NOTION_API_KEY || "";
const NOTION_VERSION = "2025-09-03";

/* ── input ───────────────────────────────────────────────────────────────────────────── */

function usage(msg) {
  console.error(msg);
  console.error("usage: confirm-meeting-company.mjs --input <check:archive --json> --by <name> \\");
  console.error("         (--confirm <pageId>=<orgId> … | --confirmations <file.json>) [--apply] [--json]");
  console.error("  produce the input with:  npm run --silent check:archive -- --json > /tmp/q85-check.json");
  process.exit(2);
}

if (!INPUT) usage("no --input.");

/**
 * Collected as REPEATED `--confirm a=b` flags rather than one comma-joined string. A comma
 * list is one typo away from a page id silently carrying a fragment of the next pair, and the
 * failure would land as `not-blocked` — a refusal that reads like a stale worklist rather than
 * like a malformed argument.
 */
function inlineConfirmations() {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--confirm") continue;
    const pair = args[i + 1] || "";
    const eq = pair.indexOf("=");
    if (eq <= 0) usage(`--confirm expects <pageId>=<orgId>, got ${JSON.stringify(pair)}.`);
    out.push({ pageId: pair.slice(0, eq).trim(), orgId: pair.slice(eq + 1).trim() });
  }
  return out;
}

const check = JSON.parse(readFileSync(INPUT, "utf8"));
const planRows = check?.activityPlan?.rows;
if (!Array.isArray(planRows)) usage(`${INPUT} has no activityPlan.rows — is it \`check:archive --json\`?`);

// The CRM as the SAME read saw it. Deliberately not re-fetched here — see the note this
// increment added at the `--json` emit in notion-crm-check.mjs.
const orgs = check?.crm?.orgs;
const people = check?.crm?.people;
if (!Array.isArray(orgs) || !Array.isArray(people)) {
  usage(`${INPUT} carries no crm.orgs/crm.people — re-run \`check:archive --json\` (Q85 inc.14 added them).`);
}

let confirmations;
if (CONFIRMATIONS_FILE) {
  const raw = JSON.parse(readFileSync(CONFIRMATIONS_FILE, "utf8"));
  if (!Array.isArray(raw)) usage(`${CONFIRMATIONS_FILE} is not an array of { pageId, orgId, confirmedBy }.`);
  confirmations = raw;
} else {
  const inline = inlineConfirmations();
  if (inline.length === 0) usage("nothing to confirm — pass --confirm <pageId>=<orgId> or --confirmations <file>.");
  // `--by` is required for inline confirmations and has no default. A cell filled on a page
  // nobody will revisit must name who decided it; "the script" is not an answer, and a
  // default here would make it one.
  if (!CONFIRMED_BY) usage("--by <name> is required — a confirmed company must name who confirmed it.");
  confirmations = inline.map((c) => ({ ...c, confirmedBy: CONFIRMED_BY }));
}

const missingWho = confirmations.filter((c) => !c?.confirmedBy);
if (missingWho.length > 0) {
  usage(`${missingWho.length} confirmation(s) name no confirmedBy — every one must say who decided it.`);
}

/* ── the plan (pure; no network above this line) ─────────────────────────────────────── */

const plan = planCompanyConfirmations(planRows, orgs, people, confirmations);

if (AS_JSON && !APPLY) {
  console.log(JSON.stringify({ mode: "dry-run", ...plan }, null, 2));
  process.exit(0);
}

function printPlan() {
  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} — ${plan.writes.length} cell(s) to fill, ${plan.refusals.length} refused\n`);
  for (const w of plan.writes) {
    const flagged = w.source === "off-candidate" ? "  ⚠ OFF-CANDIDATE (a human overrode the worklist)" : "";
    console.log(`  ✎ ${w.pageTitle}`);
    console.log(`      Company Meeting with ← ${JSON.stringify(w.companyText)}  (${w.orgId}, confirmed by ${w.confirmedBy})${flagged}`);
    if (w.pageUrl) console.log(`      ${w.pageUrl}`);
  }
  if (plan.refusals.length > 0) {
    console.log("");
    for (const r of plan.refusals) console.log(`  ⨯ ${r.pageId}  [${r.reason}] ${r.detail}`);
  }
}

printPlan();

if (!APPLY) {
  console.log(`\nNothing written. Re-run with --apply to fill ${plan.writes.length} cell(s).`);
  process.exit(0);
}

/* ── write ───────────────────────────────────────────────────────────────────────────── */

if (!NOTION_KEY) {
  console.error("\n--apply needs NOTION_API_KEY in env or .env.local. Nothing written.");
  process.exit(2);
}

const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

const plainText = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text).join("") : "");

/** Re-read the page. The snapshot may be stale; the cell must still be empty RIGHT NOW. */
async function currentCompanyCell(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: NOTION_HEADERS });
  if (!res.ok) throw new Error(`Notion ${res.status} reading ${pageId}: ${(await res.text()).slice(0, 300)}`);
  const page = await res.json();
  return plainText(page.properties?.["Company Meeting with"]?.rich_text).trim();
}

let filled = 0;
const skipped = [];

for (const w of plan.writes) {
  let existing;
  try {
    existing = await currentCompanyCell(w.pageId);
  } catch (err) {
    skipped.push({ pageId: w.pageId, why: `could not re-read the page: ${err.message}` });
    continue;
  }
  if (existing) {
    skipped.push({ pageId: w.pageId, why: `cell filled since the snapshot (${JSON.stringify(existing)}) — left alone` });
    continue;
  }

  // One property. The body is built from the single key so it cannot widen by accident.
  const res = await fetch(`https://api.notion.com/v1/pages/${w.pageId}`, {
    method: "PATCH",
    headers: NOTION_HEADERS,
    body: JSON.stringify({
      properties: { "Company Meeting with": { rich_text: [{ text: { content: w.companyText } }] } },
    }),
  });
  if (!res.ok) {
    skipped.push({ pageId: w.pageId, why: `Notion ${res.status}: ${(await res.text()).slice(0, 200)}` });
    continue;
  }
  filled += 1;
  console.log(`  ✓ ${w.pageTitle} → ${w.companyText}`);
}

console.log(`\nFilled ${filled} cell(s); ${skipped.length} skipped.`);
for (const s of skipped) console.log(`  · ${s.pageId} — ${s.why}`);
console.log(`\nRe-run \`npm run check:archive\` — crm-gap #133 moves only once these rows stop being blocked.`);
process.exit(skipped.length > 0 ? 1 : 0);
